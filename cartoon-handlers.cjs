const path = require('path');
const fs = require('fs');

// Directories for Cartoons
const CARTOON_DIRS = {
    base: path.join(__dirname, 'Cartoons'),
    audio: path.join(__dirname, 'Cartoons', 'Audio'),
    images: path.join(__dirname, 'Cartoons', 'Images'),
    videos: path.join(__dirname, 'Cartoons', 'Videos'),
};

// Ensure directories exist
Object.values(CARTOON_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const { callPollinations } = require('./skeleton-handlers.cjs');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// VoiseAPI TTS — same pattern as story-handlers.cjs
// ─────────────────────────────────────────────────────────────────────────────
async function cartoonGenerateVoice(text, language, outputDir) {
    const apiKey = process.env.VOICEAPI_KEY;
    if (!apiKey) throw new Error('[CartoonVoice] VOICEAPI_KEY not set in .env');

    const voiceId = process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID;
    if (!voiceId) throw new Error('[CartoonVoice] Set STORY_VOICE_ID or TEST_VOICE_ID in .env');

    const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
    const filename = `voice_${hash}.mp3`;
    const dir = outputDir || CARTOON_DIRS.audio;
    const outputPath = path.join(dir, filename);

    // Cache check
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1000) {
            const fd = fs.openSync(outputPath, 'r');
            const hdr = Buffer.alloc(4);
            fs.readSync(fd, hdr, 0, 4, 0);
            fs.closeSync(fd);
            const isHtml = hdr.toString('ascii').startsWith('<');
            if (!isHtml) {
                console.log(`[CartoonVoice] Using cached: ${outputPath}`);
                return outputPath;
            }
            console.warn(`[CartoonVoice] Cached file is HTML (invalid). Regenerating...`);
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

    console.log(`[CartoonVoice] POST /tasks voice=${voiceId} lang=${language} text=${text.length}ch`);
    const cr = await axios.post(`${VOISE_BASE}/tasks`, taskBody, { headers });
    const taskId = cr.data && (cr.data.task_id || cr.data.id);
    if (!taskId) {
        throw new Error('[CartoonVoice] No task_id in response: ' + JSON.stringify(cr.data).slice(0, 200));
    }
    console.log(`[CartoonVoice] Task created: id=${taskId}`);

    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await axios.get(`${VOISE_BASE}/tasks/${taskId}/status`, { headers });
        const t = sr.data;
        const st = ((t.status || '')).toLowerCase();
        console.log(`[CartoonVoice] Task ${taskId}: status="${st}" (${i + 1}/60)`);

        if (st === 'error' || st === 'error_handled') {
            throw new Error('[CartoonVoice] Task failed: ' + JSON.stringify(t).slice(0, 200));
        }

        if (st === 'ending' || st === 'ending_processed') {
            console.log(`[CartoonVoice] Status "${st}" — downloading result from /tasks/${taskId}/result`);

            const ar = await axios.get(
                `${VOISE_BASE}/tasks/${taskId}/result`,
                { responseType: 'arraybuffer', headers }
            );
            const buf = Buffer.from(ar.data);

            const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
            const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
            if (buf.length < 100) {
                throw new Error(`[CartoonVoice] Result too small: ${buf.length}B`);
            }
            if (!isID3 && !isSync) {
                const preview = buf.slice(0, 200).toString('utf8');
                throw new Error(`[CartoonVoice] Result is not MP3 (${buf.length}B): ${preview}`);
            }

            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, buf);
            console.log(`[CartoonVoice] ✅ Saved: ${outputPath} (${buf.length}B, isID3=${isID3}, isSync=${isSync})`);
            return outputPath;
        }
    }
    throw new Error(`[CartoonVoice] Timeout: task ${taskId} did not complete in 3 minutes`);
}

// ── Preview re-encoding helper ──────────────────────────────────────────────
async function reencodeForPreview(inputPath, sceneIndex, projectFolder) {
    const previewDir = projectFolder
        ? path.join(CARTOON_DIRS.base, projectFolder, 'Videos')
        : CARTOON_DIRS.videos;
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}_preview.mp4`);
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', previewPath
        ]);
        ffmpeg.on('close', code => resolve(code === 0 ? previewPath : inputPath));
        ffmpeg.on('error', () => resolve(inputPath));
    });
}

// Helper: create a project folder with date/time stamp
function createCartoonProjectFolder() {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getFullYear()}`;
    const folderName = `Cartoon_${timestamp}`;
    const folderPath = path.join(CARTOON_DIRS.base, folderName);

    ['Images', 'Videos', 'Audio'].forEach(sub => {
        const subPath = path.join(folderPath, sub);
        if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
    });

    console.log(`[Cartoon] Created project folder: ${folderPath}`);
    return folderName;
}

function registerCartoonHandlers(ipcMain) {

    // 0. Create a new cartoon project folder
    ipcMain.handle('cartoon-create-folder', async () => {
        return createCartoonProjectFolder();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Generate exactly 2 Profession Ideas
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('cartoon-generate-ideas', async (event, { topic, language }) => {
        const systemPrompt = `Ты — сценарист образовательных мультяшных роликов для TikTok и YouTube Shorts.
Твоя задача — создавать идеи для коротких историй о ПРОФЕССИЯХ.

Каждая идея раскрывает одну профессию через призму того, что зритель НИКОГДА не видит снаружи:
скрытые трудности, неожиданные знания, смешные или грустные моменты рабочего дня.

ВРЕМЕННОЙ ДИАПАЗОН: профессия может существовать в любую эпоху — от 1000 до н.э. до наших дней.
Можно показать КАК профессия менялась сквозь время, или взять яркий исторический момент.

СТИЛЬ: мультяшный, немного юмористический, но с реальными фактами.
ТОНАЛЬНОСТЬ: "знаешь ли ты, что..." — удивительное рядом, наблюдательное, тёплое.

ВСЕ ТЕКСТЫ ИДЕЙ (title, hook, profession_fact, era, character) — НА РУССКОМ ЯЗЫКЕ.

ЗАПРЕЩЕНО:
- Банальные профессии без "фишки" (просто "врач лечит людей")
- Абстрактные хуки без конкретного примера
- Повторять профессии из очевидного списка без изюминки

КРИТЕРИЙ ХОРОШЕЙ ИДЕИ:
После прочтения хука зритель должен подумать: "Подождите, я этого не знал!"`;

        const userPrompt = `Тематический запрос: ${topic || 'Случайная профессия — выбери самую интересную и малоизвестную со своей "фишкой"'}

Сгенерируй РОВНО 2 идеи для мультяшных образовательных роликов о профессиях.

ТРЕБОВАНИЯ К КАЖДОЙ ИДЕЕ:
1. Конкретная профессия с временным периодом (не просто "повар" — а "корабельный кок XVII века" или "современный пчеловод")
2. Хук-вопрос или хук-факт: что зритель ТОЧНО не знал об этой профессии
3. Главный герой — конкретный персонаж (имя + откуда + кем работает)
4. Неожиданный факт или момент из рабочей жизни
5. Эмоциональная "фишка" — что делает эту профессию интересной/смешной/удивительной

ФОРМАТ JSON (строго):
{
  "ideas": [
    {
      "title": "Название на русском (3-5 слов, цепляющее)",
      "profession": "Конкретное название профессии + эпоха/место",
      "era": "Временной период и место (например: 'Лондон, 1887 год' или 'Современная Япония')",
      "character": "Имя и краткое описание главного героя",
      "hook": "Хук: 2-3 предложения. Что зритель не знал + конкретный пример + почему это важно/смешно/удивительно",
      "profession_fact": "Один самый неожиданный факт об этой профессии (1 предложение)"
    }
  ]
}

ВАЖНО: ровно 2 элемента в массиве ideas.`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], true);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            return JSON.parse(jsonText).ideas;
        } catch(e) {
            throw new Error("Failed to generate cartoon profession ideas from AI.");
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Generate 8-Scene Cartoon Script & Prompts
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('cartoon-generate-script', async (event, { idea, language, projectFolder }) => {
        const langName = language || 'English';

        const systemPrompt = `Ты — сценарист образовательных мультяшных роликов TikTok.

ФОРМАТ: 64 секунды = 8 частей по 8 секунд.
Каждая часть = 14-18 слов нарратива МАКСИМУМ.
Язык нарратива: ${langName}

════════════════════════════════════════════════
СТИЛЬ ПОВЕСТВОВАНИЯ:
════════════════════════════════════════════════
- Тёплый, наблюдательный, слегка юмористический
- Обращение на "ты" — зритель=наблюдатель, видит всё изнутри
- Конкретные детали ("в 4 утра", "37 ножей", "17 кг рыбы") > абстракции
- Каждая часть заканчивается незакрытым вопросом ИЛИ удивительным фактом
- Часть 8 — финальный вывод или неожиданная мораль

СТРУКТУРА 8 ЧАСТЕЙ:
1. ХУК: вопрос или факт который никто не знает о профессии
2. УТРО: как начинается рабочий день (конкретно)
3. ГЛАВНЫЙ ИНСТРУМЕНТ / НАВЫК: то, чему учатся годами
4. СКРЫТАЯ ТРУДНОСТЬ: то, чего не видно снаружи
5. СМЕШНОЙ / НЕОЖИДАННЫЙ МОМЕНТ: реальная история или типичная ситуация
6. ВЗАИМОДЕЙСТВИЕ с людьми или миром: самый запоминающийся момент
7. КОНЕЦ ДНЯ: что остаётся когда все уходят домой
8. ВЫВОД: почему эта профессия важна / неожиданная мораль для зрителя

ЗАПРЕЩЕНО:
- Банальные фразы ("эта профессия очень важна")
- Длинные предложения (> 10 слов без паузы)
- Пафос и морализаторство

════════════════════════════════════════════════
СТИЛЬ ИЗОБРАЖЕНИЙ (3D cartoon animated):
════════════════════════════════════════════════
Основа стиля для КАЖДОГО imagePrompt:
"stylized 3D animated [ПРОФЕССИЯ] worker, semi-realistic cartoon style, slightly exaggerated facial features,
natural relaxed facial expression, subtle micro-expressions, attentive eyes, light neutral mood, detailed skin texture,
worn work clothes, [КОНКРЕТНАЯ РАБОЧАЯ ОБСТАНОВКА], soft natural or overcast lighting, muted colors,
cinematic composition, shallow depth of field, ultra detailed textures, observational storytelling,
vertical TikTok framing, handheld camera feel, subtle realistic movement, grounded everyday mood, 4k render"

ВАЖНО для imagePrompt:
- Возраст персонажа соответствует сцене
- Детали костюма/инструментов ТОЧНО соответствуют эпохе и профессии
- Рабочая среда конкретная и узнаваемая
- Освещение рабочее (утро = мягкий свет, ночь = искусственный свет)
- Черты лица персонажа ОДИНАКОВЫ во всех 8 сценах (из characterProfile)

ВЫБОР LIGHTING по сцене:
- Сцена 1 (хук) → soft dramatic side lighting
- Сцена 2 (утро) → warm early morning golden light
- Сцена 3 (навык) → focused task lighting, close-up hands
- Сцена 4 (трудность) → overcast flat grey, tired mood
- Сцена 5 (смешной момент) → bright warm comedic lighting
- Сцена 6 (взаимодействие) → warm social ambient light
- Сцена 7 (конец дня) → blue hour, end-of-shift exhaustion
- Сцена 8 (вывод) → golden hour warm, reflective

════════════════════════════════════════════════
СТИЛЬ ВИДЕО (3D cartoon animated):
════════════════════════════════════════════════
Основа для КАЖДОГО videoPrompt:
"8-second stylized 3D animated video, vertical 9:16 TikTok format, semi-realistic cartoon style.
SCENE: [ДЕЙСТВИЕ]. CHARACTER: [ПЕРСОНАЖ + ДЕТАЛИ]. SETTING: [ОБСТАНОВКА].
OPENING: Start with close-up of [рука/инструмент/лицо] then reveal.
CAMERA: [ВЫБЕРИ]. LIGHTING: [ВЫБЕРИ]. ATMOSPHERE: [ДЕТАЛИ ОКРУЖЕНИЯ].
LAST FRAME: [НЕЗАКРЫТЫЙ ВИЗУАЛЬНЫЙ МОМЕНТ].
QUALITY: 4K render, cartoon stylized, no modern UI elements, period-accurate props."

CAMERA по сцене:
- Сцена 1 → slow zoom-in on surprised face
- Сцена 2 → handheld follow shot of morning routine
- Сцена 3 → close-up of skilled hands at work
- Сцена 4 → wide shot showing scale of problem
- Сцена 5 → fast comedic cut, reaction shot
- Сцена 6 → two-shot interaction
- Сцена 7 → slow pull-back reveal of empty workspace
- Сцена 8 → slow push-in to face, slight smile`;

        const ideaTitle     = idea?.title           || (typeof idea === 'string' ? idea : '');
        const ideaHook      = idea?.hook            || '';
        const ideaEra       = idea?.era             || '';
        const ideaCharacter = idea?.character       || '';
        const ideaProfession= idea?.profession      || '';
        const ideaFact      = idea?.profession_fact || '';

        const ideaContext = [
            ideaTitle      ? `Название: ${ideaTitle}`         : '',
            ideaProfession ? `Профессия: ${ideaProfession}`   : '',
            ideaEra        ? `Эпоха/место: ${ideaEra}`        : '',
            ideaCharacter  ? `Персонаж: ${ideaCharacter}`     : '',
            ideaHook       ? `Хук: ${ideaHook}`               : '',
            ideaFact       ? `Факт: ${ideaFact}`              : '',
        ].filter(Boolean).join('\n') || String(idea);

        const userPrompt = `ИДЕЯ ДЛЯ МУЛЬТЯШНОЙ ИСТОРИИ О ПРОФЕССИИ:
${ideaContext}

ТВОЯ ЗАДАЧА: Написать 8 нарративных строк (line) и промпты для изображений и видео.

ПРИМЕР СТИЛЯ (нарративные строки, профессия — корабельный кок XVII века, ${langName}):
Сцена 1: "Знаешь сколько ножей у корабельного кока? Тридцать семь. И каждый — для разного мяса."
Сцена 2: "Четыре утра. Огонь в камбузе уже горит. Шторм ещё идёт. Ты уже готовишь."
Сцена 3: "За год ты научился солить рыбу так чтобы она выжила дольше тебя."
Сцена 4: "Никто не скажет спасибо. Капитан заметит тебя только когда что-то не так."
Сцена 5: "Однажды ты приготовил акулу. Команда ела молча. Потом попросила добавку."
Сцена 6: "Больной матрос пришёл ночью. Горячий бульон. Он выжил. Ты не узнаешь об этом."
Сцена 7: "Все спят. Ты скребёшь котёл. За иллюминатором Атлантика. Тишина."
Сцена 8: "Ты накормил двести человек. Они не знают твоего имени. И это нормально."

ТРЕБОВАНИЯ:
- Язык нарратива: СТРОГО ${langName}
- 14-18 слов на строку
- Юмор и удивление > пафос
- Конкретные детали из реальной профессии

Выведи JSON:
{
  "title": "поэтичное название на ${langName}",
  "profession": "название профессии",
  "era": "эпоха и место",
  "characterProfile": {
    "faceShape": "round",
    "nose": "broad flat nose",
    "lips": "thick expressive lips",
    "ears": "large rounded ears",
    "eyes": "warm brown wide eyes",
    "hair": "short curly dark hair",
    "skinTone": "warm tan complexion",
    "distinguishingFeature": "flour dust on cheek",
    "cartoonStyle": "slightly exaggerated, semi-realistic 3D cartoon, friendly expression"
  },
  "scenes": [
    {
      "id": 1,
      "stage": "ХУК",
      "line": "нарратив на ${langName} — 14-18 слов, факт + удивление",
      "imagePrompt": "stylized 3D animated [профессия] worker, semi-realistic cartoon style, slightly exaggerated facial features, natural relaxed facial expression, [ОПИСАНИЕ СЦЕНЫ — возраст, действие, детали]. Soft dramatic side lighting. Muted colors, cinematic composition, shallow depth of field, vertical TikTok framing, handheld camera feel, 4k render. warm brown wide eyes, flour dust on cheek.",
      "videoPrompt": "8-second stylized 3D animated video, vertical 9:16 TikTok format, semi-realistic cartoon style. SCENE: [ДЕЙСТВИЕ]. CHARACTER: [ОПИСАНИЕ]. SETTING: [МЕСТО]. OPENING: close-up of [деталь] then reveal. CAMERA: slow zoom-in on surprised face. LIGHTING: soft dramatic side lighting. ATMOSPHERE: [детали]. LAST FRAME: character looks at camera with surprised expression. QUALITY: 4K cartoon render, period-accurate props."
    }
  ]
}

ВАЖНО: в JSON выведи ВСЕ 8 сцен с реальным нарративом в поле "line".`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], true);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const scriptData = JSON.parse(jsonText);

            if (projectFolder) {
                const scriptPath = path.join(CARTOON_DIRS.base, projectFolder, 'script.json');
                fs.writeFileSync(scriptPath, JSON.stringify(scriptData, null, 2));
                console.log(`[Cartoon] Saved script.json to: ${scriptPath}`);
            }

            return scriptData;
        } catch(e) {
            throw new Error("Failed to generate cartoon script from AI.");
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Generate Image (3D cartoon style via G-Labs)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('cartoon-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder }) => {
        try {
            const model = (imageModel || 'imagen4').replace('freepik-', '');
            const sectionDir = projectFolder
                ? path.join(CARTOON_DIRS.base, projectFolder)
                : CARTOON_DIRS.images;

            console.log(`[Cartoon] Generate image: scene=${sceneIndex} model=${model} folder=${projectFolder || 'default'}`);

            const savedPaths = await generateImageViaGLabs({
                prompt: imagePrompt,
                model,
                aspectRatio: '9:16',
                count: 1,
                sectionDir,
                subFolder: 'Images',
                sceneIndex,
                onProgress: (p) => {
                    event.sender.send('cartoon-image-progress', { sceneIndex, status: p.status, attempt: p.attempt });
                }
            });

            if (!savedPaths || savedPaths.length === 0) {
                throw new Error("No image paths returned from G-Labs generation");
            }

            return `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;
        } catch (error) {
            console.error(`[Cartoon] Image generation failed for scene ${sceneIndex}:`, error);
            throw error;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Generate Audio (voice for a single scene)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('cartoon-generate-audio', async (event, { sceneIndex, text, language, projectFolder }) => {
        console.log(`[Cartoon] Voice: scene=${sceneIndex} lang=${language} folder=${projectFolder || 'default'} text="${text.substring(0, 60)}..."`);
        try {
            const customDir = projectFolder
                ? path.join(CARTOON_DIRS.base, projectFolder, 'Audio')
                : CARTOON_DIRS.audio;
            const audioPath = await cartoonGenerateVoice(text, language, customDir);
            return audioPath;
        } catch (e) {
            console.error(`[Cartoon] Audio generation failed for scene ${sceneIndex}:`, e.message);
            throw e;
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Generate Video (image-to-video via G-Labs)
    // ─────────────────────────────────────────────────────────────────────────
    ipcMain.handle('cartoon-generate-video', async (event, { sceneIndex, videoPrompt, sourceImageUrl, narrationLine, projectFolder }) => {
        console.log(`[Cartoon] Generate video: scene=${sceneIndex} folder=${projectFolder || 'default'} hasSourceImage=${!!sourceImageUrl}`);

        const imagePath = sourceImageUrl ? sourceImageUrl.replace('media:///', '').split('?')[0] : null;

        let referenceImages = [];
        if (imagePath && fs.existsSync(imagePath)) {
            const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
            const imageBase64 = fs.readFileSync(imagePath).toString('base64');
            referenceImages.push({ data: `data:image/${ext};base64,${imageBase64}` });
            console.log(`[Cartoon] Using reference image: ${imagePath}`);
        } else {
            console.log(`[Cartoon] No reference image found, using text-to-video mode`);
        }

        const sectionDir = projectFolder
            ? path.join(CARTOON_DIRS.base, projectFolder)
            : CARTOON_DIRS.videos;

        const options = {
            prompt: videoPrompt,
            model: 'veo_31_fast',
            aspectRatio: '9:16',
            sectionDir,
            subFolder: 'Videos',
            sceneIndex,
            mode: referenceImages.length > 0 ? 'start_image' : 'text_to_video',
            referenceImages,
            onProgress: (p) => {
                event.sender.send('cartoon-video-progress', { sceneIndex, status: p.status, attempt: p.attempt });
            }
        };

        const savedPath = await generateVideoViaGLabs(options);
        const previewPath = await reencodeForPreview(savedPath, sceneIndex, projectFolder);
        return `media:///${previewPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    console.log('[Cartoon] Profession Story Handlers registered ✅');
}

module.exports = { registerCartoonHandlers };