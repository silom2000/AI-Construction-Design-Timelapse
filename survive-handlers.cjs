const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');

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

const { callPollinations } = require('./skeleton-handlers.cjs');
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
async function surviveGenerateVoice(text, language, outputDir, sceneIndex = null) {
    const apiKey = process.env.VOICEAPI_KEY;
    if (!apiKey) throw new Error('[Survive Voice] VOICEAPI_KEY not set in .env');

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
            },
            voice_result_type: 'default'
        },
        text: text,
        task_type: 'default'
    };

    console.log(`[Survive Voice] POST /tasks voice=${voiceId} lang=${language} text=${text.length}ch`);
    const cr = await axios.post(`${VOISE_BASE}/tasks`, taskBody, { headers });
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
    // 1. Generate Survival Scenario Ideas (5 ideas)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-ideas', async (event, { language }) => {
        const langName = LANG_NAMES[language] || 'English';
        const historyKey = `survive_${language}`;
        const completedTopics = historyManager.getTopics(historyKey);
        const exclusionClause = completedTopics.length > 0
            ? `\nEXCLUSION LIST — DO NOT repeat or rephrase any of these previously generated scenarios:\n${completedTopics.slice(-30).join('\n')}\n`
            : '';

        const systemPrompt = `Ты — эксперт по экстремальному выживанию и создатель вирусного образовательного контента для TikTok и YouTube Shorts.

ТВОЯ ЗАДАЧА: Сгенерировать 5 ЭКСТРЕМАЛЬНЫХ СЦЕНАРИЕВ ВЫЖИВАНИЯ для 60-секундных видео.

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
- Все 5 идей должны быть из РАЗНЫХ категорий
- Язык генерации: ${langName}
- Каждая идея = 6 шагов выживания (оптимально для 60-сек видео)
${exclusionClause}`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Сгенерируй 5 разнообразных сценариев выживания на ${langName}. Выведи ТОЛЬКО JSON.` }
        ], true);

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
    ipcMain.handle('survive-generate-script', async (event, { idea, language, projectFolder }) => {
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
  - Начинается с номера: "Шаг 1:", "Шаг 2:", и т.д.
  - КОНКРЕТНОЕ ДЕЙСТВИЕ (не абстракция)
  - ПОЧЕМУ это важно (краткое объяснение)
  - ИМПЕРАТИВ: "Делай X", "Не делай Y", "Запомни Z"

ПРИМЕРЫ ПРАВИЛЬНЫХ ШАГОВ:

✅ "Шаг 1: Не паникуй — контролируй дыхание, глубокий вдох на 4 счёта, выдох на 4, паника убивает быстрее опасности."

✅ "Шаг 2: Оцени ситуацию за 5 секунд — где выходы, есть ли укрытие, откуда идёт опасность, время решает всё."

✅ "Шаг 3: Защити голову и шею — присядь, закрой затылок руками, отойди от окон и тяжёлых предметов, это твой приоритет номер один."

❌ ПЛОХО: "Шаг 1: Сохраняй спокойствие" (слишком абстрактно, нет конкретики)

ФИНАЛЬНЫЙ ШАГ (Шаг 6):
  - Подведение итога
  - Призыв к действию: "Сохрани это видео — однажды оно может спасти твою жизнь"
  - Мотивация: "Теперь ты знаешь что делать — поделись этим с близкими"

════════════════════════════════════════════════
ВИЗУАЛЬНЫЙ СТИЛЬ (для imagePrompt и videoPrompt):
════════════════════════════════════════════════

ГРЯЗНАЯ ПЛАСТИЛИНОВАЯ СТОП-МОУШЕН АНИМАЦИЯ (GRITTY CLAYMATION STOP-MOTION):

IMAGE PROMPTS (ТОЛЬКО English):
"Gritty stop-motion claymation style, tactile physical materials, miniature diorama aesthetic.
SCENE: [конкретное описание сцены и действия].
PERSON: [возраст, пол, одежда, эмоция на лице] sculpted from textured clay, slightly exaggerated proportions, performing [конкретное действие выживания].
ENVIRONMENT: [детальное описание окружения — опасность видна], handmade miniature set, tangible textures (cardboard, wire, textured clay, painted plastic).
CAMERA: Medium shot, eye-level, vertical 9:16 format, macro photography depth of field.
MOOD: High tension, gritty urban or rugged outdoor feel.
LIGHTING: Studio miniature lighting, harsh dramatic shadows, practical light effects.
DETAILS: Fingerprints on clay, slightly rough textures, handmade imperfections, gritty details like dirt and grime.
QUALITY: High-end stop-motion animation studio quality (like Laika), distinct from clean 3D Pixar styles, tactile, hyper-detailed."

VIDEO PROMPTS (ТОЛЬКО English):
"CAMERA MOVEMENT: Stop-motion camera style, slight jitter, dynamic miniature framing.
ACTION: [конкретное действие персонажа — шаг выживания].
MOTION: Stop-motion animation feel, slightly lower frame rate effect, distinct poses.
ENVIRONMENT: [окружение и опасность] made of tangible miniature materials.
PACING: High tension, dramatic action.
ENDING: Freeze on determined clay face.
QUALITY: Masterpiece stop-motion animation, gritty, textured, non-CGI feel, tactile."

ЗАПРЕЩЕНО в промптах:
❌ Гладкий 3D Pixar/Disney стиль
❌ Фотореализм, живые люди
❌ Графическое насилие, кровь, gore

════════════════════════════════════════════════
СТРУКТУРА 6 ШАГОВ:
════════════════════════════════════════════════

Шаг 0 (INTRO/HOOK): Мощный хук + описание сценария (18-22 слова)
Шаг 1: Первое критическое действие (18-22 слова)
Шаг 2: Второе действие (18-22 слова)
Шаг 3: Третье действие (18-22 слова)
Шаг 4: Четвёртое действие (18-22 слова)
Шаг 5: Пятое действие + финальный призыв (18-22 слова)

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
  "steps": [
    {
      "id": 0,
      "stepNumber": "INTRO",
      "line": "Текст на ${langName} (18-22 слова)",
      "imagePrompt": "Детальный промпт на English для изображения",
      "videoPrompt": "Детальный промпт на English для видео"
    },
    {
      "id": 1,
      "stepNumber": "ШАГ 1",
      "line": "Шаг 1: [действие] на ${langName} (18-22 слова)",
      "imagePrompt": "...",
      "videoPrompt": "..."
    }
    // ... всего 6 объектов (id: 0-5)
  ]
}

КРИТИЧЕСКИ ВАЖНО:
- Язык в поле "line": ${langName}
- Язык в imagePrompt и videoPrompt: ТОЛЬКО English
- Каждый imagePrompt и videoPrompt должен быть уникальным и детальным (100-150 слов)
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
        ], true);

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
    ipcMain.handle('survive-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder, referenceImageUrl }) => {
        try {
            const cleanModel = (imageModel || 'flux1.1').replace(/^glabs-/, '');
            const sectionDir = projectFolder ? path.join(SURVIVE_DIRS.base, projectFolder) : SURVIVE_DIRS.images;

            console.log(`[Survive] Generate image: scene=${sceneIndex} model=${cleanModel} folder=${projectFolder || 'default'} hasRef=${!!referenceImageUrl}`);

            // Build reference images for character consistency (scenes 1-5 use scene 0 as reference)
            let referenceImages = [];
            if (referenceImageUrl && sceneIndex > 0) {
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
    ipcMain.handle('survive-generate-audio', async (event, { sceneIndex, narrationLine, language, projectFolder }) => {
        console.log(`[Survive] Generate audio: scene=${sceneIndex} lang=${language} folder=${projectFolder || 'default'}`);

        const audioDir = projectFolder
            ? path.join(SURVIVE_DIRS.base, projectFolder, 'Audio')
            : SURVIVE_DIRS.audio;

        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

        const audioPath = await surviveGenerateVoice(narrationLine, language, audioDir, sceneIndex);
        return `media:///${audioPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Generate Video (VEO3 with native audio)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('survive-generate-video', async (event, {
        sceneIndex, videoPrompt, sourceImageUrl, narrationLine, projectFolder
    }) => {
        console.log(`[Survive] Generate video: scene=${sceneIndex} folder=${projectFolder || 'default'} hasSourceImage=${!!sourceImageUrl}`);

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

        // Build full prompt with audio instructions for VEO3
        const audioSection = `
AUDIO GENERATION:
NARRATOR VOICEOVER — professional survival instructor voice, calm but urgent tone.
NARRATOR SAYS (verbatim, sync to 10 seconds): "${narrationLine}"
AMBIENT SOUND: realistic environmental sounds matching the survival scenario (wind, water, fire, etc.).`;

        const fullPrompt = `${videoPrompt}\n${audioSection}`;

        const options = {
            prompt: fullPrompt,
            model: 'veo3',
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
            // Fallback to veo3_fast if veo3 fails
            if (err.message && (err.message.includes('veo3') || err.message.includes('model'))) {
                console.warn(`[Survive] veo3 failed, trying veo3_fast: ${err.message}`);
                options.model = 'veo3_fast';
                const savedPath = await generateVideoViaGLabs(options);
                return `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
            }
            throw err;
        }
    });

    console.log('[Survive] Handlers registered ✅');
}

module.exports = { registerSurviveHandlers };
