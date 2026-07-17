const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const { execSync, spawn } = require('child_process');

// Directories for Survive
const SURVIVE_DIRS = {
    base: path.join(__dirname, 'Survive'),
    audio: path.join(__dirname, 'Survive', 'Audio'),
    images: path.join(__dirname, 'Survive', 'Images'),
    videos: path.join(__dirname, 'Survive', 'Videos'),
};

// Ensure directories exist
Object.values(SURVIVE_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const { callPollinations, synthesizeDirectElevenLabs } = require('./skeleton-handlers.cjs');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const historyManager = require('./history-manager.cjs');

const LANG_NAMES = {
    en: 'English',
    ru: 'Russian',
    de: 'German',
    fr: 'French',
    // Also support full names as keys (SurviveTab sends full names)
    English: 'English',
    Russian: 'Russian',
    German: 'German',
    French: 'French',
};

// ─────────────────────────────────────────────────────────────────────────────
// VoiceAPI Integration (same as Cartoon)
// ─────────────────────────────────────────────────────────────────────────────
async function surviveGenerateVoice(text, language, outputDir, sceneIndex = null, ttsService = 'voiceapi') {
    // Voice ID: try SURVIVE_VOICE_ID, fallback to STORY_VOICE_ID, then TEST_VOICE_ID
    const voiceId = process.env.SURVIVE_VOICE_ID || process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID;
    if (!voiceId) throw new Error('[Survive Voice] Set SURVIVE_VOICE_ID, STORY_VOICE_ID, or TEST_VOICE_ID in .env');

    let filename;
    if (sceneIndex !== null && sceneIndex !== undefined) {
        filename = `scene_${sceneIndex + 1}.mp3`;
    } else {
        const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
        filename = `voice_${hash}.mp3`;
    }
    const dir = outputDir || SURVIVE_DIRS.audio;
    const outputPath = path.join(dir, filename);

    // Cache check
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1000) {
            const fd = fs.openSync(outputPath, 'r');
            const hdr = Buffer.alloc(4);
            fs.readSync(fd, hdr, 0, 4, 0);
            fs.closeSync(fd);
            const isID3  = hdr[0] === 0x49 && hdr[1] === 0x44 && hdr[2] === 0x33;
            const isSync = hdr[0] === 0xFF && (hdr[1] & 0xE0) === 0xE0;
            if (isID3 || isSync) {
                console.log(`[Survive Voice] Using cached: ${outputPath} (${stat.size}B)`);
                return outputPath;
            }
            console.warn(`[Survive Voice] Cached file invalid. Deleting and regenerating...`);
            fs.unlinkSync(outputPath);
        } else {
            console.warn(`[Survive Voice] Cached file too small (${stat.size}B). Deleting...`);
            fs.unlinkSync(outputPath);
        }
    }

    if (ttsService === 'elevenlabs') {
        const el11Key = process.env.ElevenLabs_API;
        if (!el11Key) throw new Error('[Voice] ElevenLabs_API key not set in .env');
        return await synthesizeDirectElevenLabs(text, voiceId, outputPath);
    }

    const apiKey = process.env.VOICEAPI_KEY;
    if (!apiKey) throw new Error('[Survive Voice] VOICEAPI_KEY not set in .env');

    const VOISE_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';
    const headers = {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
    };

    const taskBody = {
        template: {
            model_id: 'eleven_multilingual_v2',
            voice_id: voiceId,
            voice_settings: {
                stability: 0.85,
                similarity_boost: 0.75,
                use_speaker_boost: true,
                style: 0.0,
                speed: 1.0
            }
        },
        text: text
    };

    let cr;
    try {
        console.log(`[Survive Voice] POST /tasks voice=${voiceId} lang=${language} text=${text.length}ch`);
        cr = await axios.post(`${VOISE_BASE}/tasks`, taskBody, { headers });
    } catch (err) {
        if (err.response && err.response.status === 402) {
            throw new Error('Недостаточно средств на балансе VoiceAPI (Ошибка 402). Пожалуйста, пополните баланс или выберите другой сервис.');
        }
        throw err;
    }

    const taskId = cr.data && (cr.data.task_id || cr.data.id);
    if (!taskId) {
        throw new Error('[Survive Voice] No task_id in response: ' + JSON.stringify(cr.data).slice(0, 200));
    }
    console.log(`[Survive Voice] Task created: id=${taskId}`);

    // Poll for completion
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await axios.get(`${VOISE_BASE}/tasks/${taskId}/status`, { headers });
        const t = sr.data;
        const st = ((t.status || '')).toLowerCase();
        console.log(`[Survive Voice] Task ${taskId}: status="${st}" (${i + 1}/60)`);

        if (st === 'error' || st === 'error_handled') {
            throw new Error('[Survive Voice] Task failed: ' + JSON.stringify(t).slice(0, 200));
        }

        if (st === 'ending' || st === 'ending_processed') {
            console.log(`[Survive Voice] Status "${st}" — downloading result`);
            const ar = await axios.get(
                `${VOISE_BASE}/tasks/${taskId}/result`,
                { responseType: 'arraybuffer', headers }
            );
            const buf = Buffer.from(ar.data);

            const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
            const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
            if (buf.length < 100) {
                throw new Error(`[Survive Voice] Result too small: ${buf.length}B`);
            }
            if (!isID3 && !isSync) {
                const preview = buf.slice(0, 200).toString('utf8');
                throw new Error(`[Survive Voice] Result is not MP3 (${buf.length}B): ${preview}`);
            }

            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, buf);
            console.log(`[Survive Voice] ✅ Saved: ${outputPath} (${buf.length}B)`);
            return outputPath;
        }
    }

    throw new Error('[Survive Voice] Task timeout after 3 minutes');
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers Registration
// ─────────────────────────────────────────────────────────────────────────────
function registerSurviveHandlers(ipcMain) {
    console.log('[Survive] Registering handlers...');

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Generate Survival Scenario Ideas (3 ideas)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-ideas', async (event, { language, aiModel }) => {
        const langName = LANG_NAMES[language] || 'English';
        const historyKey = `survive_${language}`;
        const completedTopics = historyManager.getTopics(historyKey);
        const exclusionClause = completedTopics.length > 0
            ? `\nEXCLUSION LIST — DO NOT repeat or rephrase any of these previously generated scenarios:\n${completedTopics.slice(-30).join('\n')}\n`
            : '';

        const systemPrompt = `Ты — эксперт по экстремальному выживанию и создатель вирусного образовательного контента для TikTok и YouTube Shorts.

ТВОЯ ЗАДАЧА: Сгенерировать 3 ЭКСТРЕМАЛЬНЫХ СЦЕНАРИЯ ВЫЖИВАНИЯ для 60-секундных видео.

════════════════════════════════════════════════
КАТЕГОРИИ СЦЕНАРИЕВ (выбирай разнообразно):
════════════════════════════════════════════════

🌊 ПРИРОДНЫЕ КАТАСТРОФЫ:
- Землетрясение в многоэтажном здании
- Цунами на побережье
- Лавина в горах
- Ураган/торнадо
- Наводнение
- Лесной пожар
- Оползень/сель

❄️ ЭКСТРЕМАЛЬНЫЕ УСЛОВИЯ:
- Открытый океан после кораблекрушения
- Пустыня без воды
- Арктика/снежная буря
- Джунгли (дикие животные, болезни)
- Высокогорье (нехватка кислорода)
- Болото/трясина

🏙️ ГОРОДСКИЕ ЧП:
- Пожар в высотном здании
- Застрял в лифте (падение)
- Обрушение моста
- Утечка газа
- Террористическая атака
- Давка в толпе
- Провалился под лёд

🩺 МЕДИЦИНСКИЕ ЭКСТРЕННЫЕ СИТУАЦИИ:
- Остановка сердца (СЛР)
- Сильное кровотечение
- Перелом/вывих в одиночестве
- Укус змеи/ядовитого насекомого
- Анафилактический шок
- Обморожение/переохлаждение
- Тепловой удар

🚗 ТРАНСПОРТНЫЕ АВАРИИ:
- Автомобиль упал в воду
- Авиакатастрофа (действия в первые секунды)
- Поезд сошёл с рельсов
- Мотоцикл/велосипед — серьёзная травма

════════════════════════════════════════════════
ТРЕБОВАНИЯ К КАЖДОЙ ИДЕЕ:
════════════════════════════════════════════════

1. МОЩНЫЙ ХУК (первая фраза):
   ✅ "У тебя 60 секунд чтобы узнать как выжить при землетрясении — это может спасти твою жизнь"
   ✅ "Твой автомобиль падает в воду — у тебя есть 30 секунд чтобы выбраться, вот что делать"
   ✅ "Ты один в открытом океане — эти 6 шагов решат выживешь ты или нет"

2. КОНКРЕТНЫЙ СЦЕНАРИЙ (не абстрактный):
   ✅ "Землетрясение магнитудой 7+ в 15-этажном здании"
   ❌ НЕ "Что делать при землетрясении" (слишком общо)

3. ПРАКТИЧЕСКАЯ ЦЕННОСТЬ:
   - Реальные шаги, которые можно запомнить
   - Без сложного оборудования (то что есть под рукой)
   - Проверенные методы (не мифы)

4. ЭМОЦИОНАЛЬНЫЙ ТРИГГЕР:
   - Страх + любопытство + практическая польза
   - "Это может случиться с тобой завтра"

5. ВИЗУАЛЬНАЯ ПРИВЛЕКАТЕЛЬНОСТЬ:
   - Сценарий должен быть визуально интересным для AI-генерации
   - Динамика, действие, драма

════════════════════════════════════════════════
ФОРМАТ ВЫВОДА:
════════════════════════════════════════════════

Выведи JSON:
{
  "ideas": [
    {
      "id": 1,
      "category": "природная катастрофа|экстремальные условия|городское ЧП|медицинская|транспортная",
      "scenario": "Краткое название сценария на ${langName}",
      "hook": "Мощная первая фраза на ${langName} (15-20 слов)",
      "description": "Полное описание сценария на ${langName} (2-3 предложения): что произошло, где ты находишься, какая опасность",
      "stepsCount": 6,
      "difficulty": "низкая|средняя|высокая",
      "translation_ru": "Полный перевод на русский (ТОЛЬКО если язык НЕ русский): scenario + hook + description"
    }
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- ВСЕ текстовые поля (scenario, hook, description, category) ДОЛЖНЫ быть на ${langName}
- translation_ru нужен ТОЛЬКО если ${langName} !== "Russian" (для дублирования на русский)
- Если ${langName} === "Russian", то translation_ru = пустая строка ""
- Все 3 идеи должны быть из РАЗНЫХ категорий
- Язык генерации: ${langName}
- Каждая идея = 6 шагов выживания (оптимально для 60-сек видео)
${exclusionClause}`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Сгенерируй 3 разнообразных сценария выживания на ${langName}. Выведи ТОЛЬКО JSON.` }
        ], true, aiModel);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const parsed = JSON.parse(jsonText);
            const ideas = parsed.ideas || [];

            // Save to history
            for (const idea of ideas) {
                if (idea.scenario) {
                    historyManager.addTopic(historyKey, idea.scenario);
                }
            }

            console.log(`[Survive] Generated ${ideas.length} ideas for ${langName}`);
            return ideas;
        } catch (e) {
            console.error('[Survive] Failed to parse ideas:', raw, e.message);
            throw new Error("Failed to generate survival ideas from AI.");
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Generate Survival Script (6 steps + prompts)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-script', async (event, { idea, language, projectFolder, aiModel }) => {
        const langName = LANG_NAMES[language] || 'English';

        const systemPrompt = `Ты — эксперт по экстремальному выживанию и мастер создания вирусного образовательного контента.

ФОРМАТ ВИДЕО:
60 секунд = 6 шагов по 10 секунд
Каждый шаг = 18-22 слова
Язык нарратива: ${langName}

════════════════════════════════════════════════
СТИЛЬ ПОВЕСТВОВАНИЯ:
════════════════════════════════════════════════

🎯 ДРАМАТИЧЕСКИЙ, СРОЧНЫЙ, ПРАКТИЧНЫЙ

НАЧИНАЙ с МОЩНОГО ХУКА:
  ✅ "У тебя 60 секунд чтобы узнать как выжить при землетрясении — запомни каждый шаг, это может спасти твою жизнь"
  ✅ "Твой автомобиль падает в воду — у тебя 30 секунд чтобы выбраться, слушай внимательно"
  ✅ "Ты один в открытом океане — эти 6 шагов решат выживешь ты или нет"

КАЖДЫЙ ШАГ:
  - Начинается со слова (БЕЗ ЦИФР!): "Шаг первый:", "Шаг второй:", "Шаг третий:" и т.д. Это критически важно для правильной озвучки (TTS).
  - КОНКРЕТНОЕ ДЕЙСТВИЕ (не абстракция)
  - ПОЧЕМУ это важно (краткое объяснение)
  - ИМПЕРАТИВ: "Делай X", "Не делай Y", "Запомни Z"

ПРИМЕРЫ ПРАВИЛЬНЫХ ШАГОВ:

✅ "Шаг первый: Не паникуй — контролируй дыхание, глубокий вдох на 4 счёта, выдох на 4, паника убивает быстрее опасности."

✅ "Шаг второй: Оцени ситуацию за 5 секунд — где выходы, есть ли укрытие, откуда идёт опасность, время решает всё."

✅ "Шаг третий: Защити голову и шею — присядь, закрой затылок руками, отойди от окон и тяжёлых предметов, это твой приоритет номер один."

❌ ПЛОХО: "Шаг 1: Сохраняй спокойствие" (НЕ ИСПОЛЬЗУЙ ЦИФРЫ В НОМЕРАХ ШАГОВ! Нет конкретики)

ФИНАЛЬНЫЙ ШАГ (Шаг 6):
  - Подведение итога
  - Призыв к действию: "Сохрани это видео — однажды оно может спасти твою жизнь"
  - Мотивация: "Теперь ты знаешь что делать — поделись этим с близкими"

════════════════════════════════════════════════
ВИЗУАЛЬНЫЙ СТИЛЬ (для imagePrompt и videoPrompt):
════════════════════════════════════════════════

ГРЯЗНАЯ ПЛАСТИЛИНОВАЯ СТОП-МОУШЕН АНИМАЦИЯ (GRITTY CLAYMATION STOP-MOTION):

ДЕЙСТВУЙ КАК ОПЫТНЫЙ СЦЕНАРИСТ И РЕЖИССЕР. Внимательно вчитывайся в текст озвучки (line) каждого шага и на его основании строй детальный сценарий происходящего. Визуальный ряд должен точно отражать драму, эмоции персонажа и конкретные действия выживания, о которых идет речь. 

IMAGE PROMPTS (ТОЛЬКО English):
Описывают стартовую точку сцены для конкретного шага.
"Gritty stop-motion claymation style, tactile physical materials, miniature diorama aesthetic.
SCENE: [Детальное описание стартовой сцены на основе текста озвучки. Что мы видим перед началом действия?]
PERSON: [Возраст, пол, одежда, яркая эмоция на лице (ужас, шок, концентрация, отчаяние)] sculpted from textured clay, performing [поза перед действием].
ENVIRONMENT: [Детальное описание окружения и видимой опасности], handmade miniature set, tangible textures (cardboard, wire, textured clay).
CAMERA & LIGHTING: Medium shot, vertical 9:16 format, macro photography depth of field. Studio miniature lighting, harsh dramatic shadows.
QUALITY: High-end stop-motion animation studio quality (like Laika), tactile, hyper-detailed."

VIDEO PROMPTS (ТОЛЬКО English):
Описывают ДИНАМИКУ, развитие событий и анимацию этого шага. Это должен быть связный кинематографичный мини-сценарий, полный действия и эмоций.
ВНИМАНИЕ (ДЛЯ ВИДЕОМОДЕЛЕЙ):
1. ИЗБЕГАЙТЕ отрицаний (не пишите "does not stand up", "tries to get up but fails"). Видео-нейросети игнорируют "not" и заставляют персонажа делать то, что запрещено.
2. ПИШИТЕ ТОЛЬКО ТО, ЧТО ПРОИСХОДИТ: Если человек должен лежать неподвижно, пишите "The person lies completely flat and motionless on their back, breathing heavily".
3. ИЗБЕГАЙТЕ сложных последовательностей (сделал А, потом Б, потом В). Описывайте одно главное, непрерывное действие или состояние сцены.
4. Вы должны написать ДВА ПРОМПТА для каждого шага: "videoPrompt" (первые 5 секунд действия) и "videoPrompt2" (следующие 5 секунд — логическое продолжение или развитие сцены).

ПРИМЕР ПРОМПТОВ ДЛЯ ВИДЕО:
videoPrompt: "CAMERA MOVEMENT: Stop-motion camera style. ACTION SCRIPT: The person walks on the frozen lake, suddenly the ice cracks and breaks under them. They plunge into the icy water, a grimace of pure horror and shock on their face. MOTION & PACING: High tension, dramatic. QUALITY: Masterpiece stop-motion animation, gritty, tactile."
videoPrompt2: "CAMERA MOVEMENT: Stop-motion camera style, tracking shot. ACTION SCRIPT: The person frantically grabs the edge of the broken ice and desperately tries to pull themselves out, slipping and sliding on the wet surface. MOTION & PACING: Frantic action, struggling. QUALITY: Masterpiece stop-motion animation, gritty, tactile."

ЗАПРЕЩЕНО в промптах:
❌ Гладкий 3D Pixar/Disney стиль
❌ Фотореализм, живые люди
❌ Графическое насилие, кровь, gore

════════════════════════════════════════════════
СТРУКТУРА 6 ШАГОВ:
════════════════════════════════════════════════

Шаг 0 (INTRO/HOOK): Мощный хук + описание сценария (18-22 слова)
Шаг первый: Первое критическое действие (18-22 слова)
Шаг второй: Второе действие (18-22 слова)
Шаг третий: Третье действие (18-22 слова)
Шаг четвертый: Четвёртое действие (18-22 слова)
Шаг пятый: Пятое действие + финальный призыв (18-22 слова)

ВАЖНО:
- Каждый шаг должен быть КОНКРЕТНЫМ и ВЫПОЛНИМЫМ
- Без специального оборудования (только то что под рукой)
- Проверенные методы (не мифы из интернета)
- Логическая последовательность (шаг 2 следует из шага 1)

════════════════════════════════════════════════
ФОРМАТ ВЫВОДА:
════════════════════════════════════════════════

Выведи JSON:
{
  "title": "Название сценария на ${langName}",
  "category": "категория",
  "hook": "Мощный хук на ${langName}",
  "characterPrompt": "Детальный промпт на English для создания главного героя во весь рост (full body character sheet) в нормальной одежде (соответствующей ситуации), на простом изолированном белом фоне (simple white background), в стиле gritty stop-motion claymation.",
  "steps": [
    {
      "id": 0,
      "stepNumber": "INTRO",
      "line": "Текст на ${langName} (18-22 слова)",
      "line_ru": "Перевод текста на русский (если ${langName} не Russian, иначе пусто)",
      "imagePrompt": "Детальный промпт на English для изображения",
      "videoPrompt": "Промпт для первых 5 секунд (Part 1)",
      "videoPrompt2": "Промпт для вторых 5 секунд (Part 2)"
    },
    {
      "id": 1,
      "stepNumber": "ШАГ 1",
      "line": "Шаг первый: [действие] на ${langName} (18-22 слова)",
      "line_ru": "...",
      "imagePrompt": "...",
      "videoPrompt": "...",
      "videoPrompt2": "..."
    }
    // ... всего 6 объектов (id: 0-5)
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- В тексте поля "line" ВООБЩЕ НЕ ИСПОЛЬЗУЙ цифры для нумерации шагов. Пиши только словами: "Шаг первый", "Шаг второй", "Шаг третий", "Шаг четвертый", "Шаг пятый".
- КОНСИСТЕНТНОСТЬ ОКРУЖЕНИЯ: Если действие происходит в одном и том же месте (например, в машине, лифте, комнате), ты ОБЯЗАН скопировать ТОЧНОЕ описание интерьера (цвета мебели, освещение, архитектуру) из Шага 0 во все последующие imagePrompt и videoPrompt, пока герой не сменит локацию. Иначе нейросеть будет рисовать разные комнаты каждый раз!
- ФИЗИКА И СРЕДА (КРИТИЧНО): Модели генерации картинок не понимают физику автоматически! Ты должен явно описывать взаимодействие тела со средой. Например, если герой в глубокой воде (океан, река), ОБЯЗАТЕЛЬНО пропиши, что он погружен в воду по плечи или по шею ("submerged up to the neck in deep water", "treading water with only the head visible", "water surface at chest level"). Не допускай, чтобы в океане герой стоял по колено в воде!
- Язык в поле "line": ${langName}
- Язык в imagePrompt и videoPrompt: ТОЛЬКО English
- Каждый imagePrompt и videoPrompt должен быть уникальным и детальным (100-150 слов), но с СОХРАНЕНИЕМ ОПИСАНИЯ ОКРУЖЕНИЯ и ФИЗИКИ.
- Визуализация должна ТОЧНО соответствовать шагу выживания`;

        const ideaTitle = idea?.scenario || (typeof idea === 'string' ? idea : '');
        const ideaHook = idea?.hook || '';
        const ideaDescription = idea?.description || '';
        const ideaCategory = idea?.category || '';

        const userPrompt = `СЦЕНАРИЙ ВЫЖИВАНИЯ:
Название: ${ideaTitle}
Категория: ${ideaCategory}
Хук: ${ideaHook}
Описание: ${ideaDescription}

Создай детальный скрипт с 6 шагами выживания (id: 0-5) на ${langName}.
Каждый шаг должен быть конкретным, практичным и визуально интересным.
Выведи ТОЛЬКО JSON.`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], true, aiModel);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const scriptData = JSON.parse(jsonText);

            if (projectFolder) {
                const scriptPath = path.join(SURVIVE_DIRS.base, projectFolder, 'script.json');
                const projectDir = path.join(SURVIVE_DIRS.base, projectFolder);
                if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
                fs.writeFileSync(scriptPath, JSON.stringify(scriptData, null, 2));
                console.log(`[Survive] Saved script.json to: ${scriptPath}`);
            }

            return scriptData;
        } catch (e) {
            console.error('[Survive] Failed to parse script:', raw, e.message);
            throw new Error("Failed to generate survival script from AI.");
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Generate Image
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder, referenceImageUrl, oldFileUrl }) => {
        try {
            if (oldFileUrl) {
                try {
                    const oldPath = oldFileUrl.replace('media:///', '').split('?')[0];
                    if (fs.existsSync(oldPath)) {
                        fs.unlinkSync(oldPath);
                        console.log(`[Survive] Deleted old image: ${oldPath}`);
                    }
                } catch (e) {
                    console.error(`[Survive] Failed to delete old image:`, e);
                }
            }

            const cleanModel = (imageModel || 'flux1.1').replace(/^glabs-/, '');
            const sectionDir = projectFolder ? path.join(SURVIVE_DIRS.base, projectFolder) : SURVIVE_DIRS.images;

            console.log(`[Survive] Generate image: scene=${sceneIndex} model=${cleanModel} folder=${projectFolder || 'default'} hasRef=${!!referenceImageUrl}`);

            // Build reference images for character consistency
            let referenceImages = [];
            if (referenceImageUrl) {
                const refPath = referenceImageUrl.replace('media:///', '').split('?')[0];
                if (fs.existsSync(refPath)) {
                    const ext = refPath.endsWith('.png') ? 'png' : 'jpeg';
                    const b64 = fs.readFileSync(refPath, { encoding: 'base64' });
                    referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
                    console.log(`[Survive] Using character reference image from scene 0: ${refPath}`);
                }
            }

            const savedPaths = await generateImageViaGLabs({
                prompt: imagePrompt,
                model: cleanModel,
                count: 1,
                sectionDir: SURVIVE_DIRS.base,
                subFolder: projectFolder,
                sceneIndex: sceneIndex,
                referenceImages
            });

            return `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;
        } catch (err) {
            console.error(`[Survive] Image generation failed:`, err.message);
            throw err;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Generate Audio (VoiceAPI)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-audio', async (event, { sceneIndex, narrationLine, language, projectFolder, ttsService }) => {
        const service = ttsService || 'voiceapi';
        console.log(`[Survive] Generate audio: scene=${sceneIndex} lang=${language} service=${service} folder=${projectFolder || 'default'}`);

        const audioDir = projectFolder
            ? path.join(SURVIVE_DIRS.base, projectFolder, 'Audio')
            : SURVIVE_DIRS.audio;

        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

        const audioPath = await surviveGenerateVoice(narrationLine, language, audioDir, sceneIndex, service);
        return `media:///${audioPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Generate Video (VEO3 / Meta with chaining)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-video', async (event, {
        sceneIndex, videoPrompt, videoPrompt2, sourceImageUrl, narrationLine, projectFolder, videoModel, oldFileUrl
    }) => {
        if (oldFileUrl) {
            try {
                const oldPath = oldFileUrl.replace('media:///', '').split('?')[0];
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                    console.log(`[Survive] Deleted old video: ${oldPath}`);
                }
            } catch (e) {
                console.error(`[Survive] Failed to delete old video:`, e);
            }
        }

        const model = videoModel || 'veo_31_lite';
        console.log(`[Survive] Generate video: scene=${sceneIndex} model=${model} folder=${projectFolder || 'default'} hasSourceImage=${!!sourceImageUrl}`);

        // Prepare reference image
        let referenceImages = [];
        if (sourceImageUrl && sourceImageUrl.startsWith('data:image')) {
            referenceImages.push({ data: sourceImageUrl });
        } else {
            const imagePath = sourceImageUrl ? sourceImageUrl.replace('media:///', '').split('?')[0] : null;
            if (imagePath && fs.existsSync(imagePath)) {
                const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
            } else {
                console.log(`[Survive] No reference image — using text-to-video mode`);
            }
        }

        const sectionDir = projectFolder ? path.join(SURVIVE_DIRS.base, projectFolder) : SURVIVE_DIRS.videos;

        // ═══════════════════════════════════════════════════════════════════
        // META MODEL: Chain two 5s generations into ~10s video
        // ═══════════════════════════════════════════════════════════════════
        if (model === 'meta') {
            console.log(`[Survive Meta] Starting two-part chained generation for scene ${sceneIndex}`);

            const metaPrompt = videoPrompt;

            // ── Part 1: Generate first 5s video ──
            const optionsPart1 = {
                prompt: metaPrompt,
                model: 'meta',
                aspectRatio: '9:16',
                generateAudio: false,
                sectionDir: SURVIVE_DIRS.base,
                subFolder: projectFolder,
                sceneIndex,
                referenceImages
            };

            console.log(`[Survive Meta] Part 1/2: Generating first 5s clip...`);
            const part1Path = await generateVideoViaGLabs(optionsPart1);
            console.log(`[Survive Meta] Part 1/2: Done → ${part1Path}`);

            // ── Extract last frame from part1 ──
            const baseDir = projectFolder ? path.join(SURVIVE_DIRS.base, projectFolder) : SURVIVE_DIRS.videos;
            if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

            const lastFramePath = path.join(baseDir, `scene_${sceneIndex + 1}_lastframe_${Date.now()}.jpg`);
            console.log(`[Survive Meta] Extracting last frame from part1...`);
            extractLastFrame(part1Path, lastFramePath);
            console.log(`[Survive Meta] Last frame saved → ${lastFramePath}`);

            // ── Part 2: Generate second 5s video from last frame ──
            const lastFrameB64 = fs.readFileSync(lastFramePath, { encoding: 'base64' });
            const part2RefImages = [{ data: `data:image/jpeg;base64,${lastFrameB64}` }];
            const metaPrompt2 = videoPrompt2 || metaPrompt; // Fallback to prompt 1 if 2 is missing

            const optionsPart2 = {
                prompt: metaPrompt2,
                model: 'meta',
                aspectRatio: '9:16',
                generateAudio: false,
                sectionDir: SURVIVE_DIRS.base,
                subFolder: projectFolder,
                sceneIndex: sceneIndex * 100 + 1, // unique index so filename doesn't collide
                referenceImages: part2RefImages
            };

            console.log(`[Survive Meta] Part 2/2: Generating second 5s clip from last frame...`);
            const part2Path = await generateVideoViaGLabs(optionsPart2);
            console.log(`[Survive Meta] Part 2/2: Done → ${part2Path}`);

            // ── Concatenate part1 + part2 ──
            const finalPath = path.join(baseDir, `scene_${sceneIndex + 1}_meta_${Date.now()}.mp4`);
            console.log(`[Survive Meta] Concatenating part1 + part2 → ${finalPath}`);
            await concatVideos(part1Path, part2Path, finalPath);
            console.log(`[Survive Meta] Final 10s video ready: ${finalPath}`);

            // Cleanup temp files
            try {
                fs.unlinkSync(lastFramePath);
            } catch (_) { /* ignore */ }

            return `media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        }

        // ═══════════════════════════════════════════════════════════════════
        // VEO / OMNI FLASH: Standard single generation
        // ═══════════════════════════════════════════════════════════════════
        // Build full prompt with audio instructions for VEO3
        const audioSection = `
AUDIO GENERATION:
NARRATOR VOICEOVER — professional male survival instructor voice, deep, calm but urgent tone.
NARRATOR SAYS (verbatim, sync to 10 seconds): "${narrationLine}"
AMBIENT SOUND: realistic environmental sounds matching the survival scenario (wind, water, fire, etc.).`;

        // Применение Veo 3.1 Cinematic 5-Element Formula
        const cinematicEnvelope = `[Cinematography: High-intensity GoPro/First-person POV, shaky cam, lens flares] [Subject: The survivor in the scene] [Action: ${videoPrompt}] [Context: Extreme survival environment, realistic physics] [Style: Gritty, raw footage, hyper-detailed, 4k]`;

        const fullPrompt = `${cinematicEnvelope}\n${audioSection}`;

        const options = {
            prompt: fullPrompt,
            model,
            aspectRatio: '9:16',
            generateAudio: true,
            sectionDir: SURVIVE_DIRS.base,
            subFolder: projectFolder,
            sceneIndex,
            referenceImages
        };

        try {
            const savedPath = await generateVideoViaGLabs(options);
            return `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        } catch (err) {
            // Fallback to the fast model if the selected model is unavailable.
            if (options.model !== 'veo_31_fast' && err.message && err.message.includes('model')) {
                console.warn(`[Survive] ${options.model} failed, trying veo_31_fast: ${err.message}`);
                options.model = 'veo_31_fast';
                const savedPath = await generateVideoViaGLabs(options);
                return `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
            }
            throw err;
        }
    });

    console.log('[Survive] Handlers registered ✅');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Extract the last frame from a video using ffmpeg
// ─────────────────────────────────────────────────────────────────────────────
function extractLastFrame(videoPath, outputPath) {
    // Get video duration first
    const durationStr = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    ).toString().trim();
    const duration = parseFloat(durationStr);
    // Seek to 0.2s before end to grab a clean last frame
    const seekTime = Math.max(0, duration - 0.2);
    execSync(
        `ffmpeg -ss ${seekTime} -i "${videoPath}" -frames:v 1 -q:v 2 -y "${outputPath}"`
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Concatenate two videos using ffmpeg concat demuxer
// ─────────────────────────────────────────────────────────────────────────────
function concatVideos(video1, video2, outputPath) {
    return new Promise((resolve, reject) => {
        const dir = path.dirname(outputPath);
        const listFile = path.join(dir, `concat_list_${Date.now()}.txt`);
        fs.writeFileSync(listFile, `file '${video1.replace(/\\/g, '/')}'\nfile '${video2.replace(/\\/g, '/')}'\n`);

        const ffmpeg = spawn('ffmpeg', [
            '-f', 'concat', '-safe', '0',
            '-i', listFile,
            '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
            '-y', outputPath
        ]);

        ffmpeg.stderr.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.log(`[Survive ffmpeg] ${line}`);
        });

        ffmpeg.on('close', (code) => {
            // Cleanup list file
            try { fs.unlinkSync(listFile); } catch (_) { /* ignore */ }

            if (code === 0) {
                resolve(outputPath);
            } else {
                reject(new Error(`ffmpeg concat failed with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            try { fs.unlinkSync(listFile); } catch (_) { /* ignore */ }
            reject(err);
        });
    });
}

module.exports = { registerSurviveHandlers };
