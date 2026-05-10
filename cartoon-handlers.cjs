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
- Брать только современные или только средневековые профессии — нужно МАКСИМАЛЬНОЕ разнообразие эпох и культур.

КРИТЕРИЙ ХОРОШЕЙ ИДЕИ:
После прочтения хука зритель должен подумать: "Подождите, я этого не знал!"
Идеи должны быть УНИКАЛЬНЫМИ и не повторяться в разных генерациях.
Для обеспечения разнообразия, если тема не задана, выбирай из широкого спектра: от древних цивилизаций (Майя, Индия, Египет) до необычных профессий XIX-XX веков.`;

        const userPrompt = `Тематический запрос: ${topic || 'Случайная УНИКАЛЬНАЯ профессия из любого уголка истории — выбери самую интересную и малоизвестную'}

Сгенерируй РОВНО 2 РАЗНЫЕ идеи для мультяшных образовательных роликов о профессиях.
Используй случайное зерно креативности, чтобы не повторять предыдущие темы.

ТРЕБОВАНИЯ К КАЖДОЙ ИДЕЕ:
1. Конкретная профессия с временным периодом (например: "Ловец медицинских пиявок XIX века", "Чистильщик слонов в древней Индии", "Оператор пневмопочты 1920-х")
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
      "hook": "Хук: 2-3 предложения. Что зритель не знал + почему это важно/смешно/удивительно",
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
Каждая часть = СТРОГО 17-20 слов нарратива.
Язык нарратива: ${langName}

════════════════════════════════════════════════
СТИЛЬ ПОВЕСТВОВАНИЯ:
════════════════════════════════════════════════
- Тёплый, наблюдательный, СИЛЬНО вовлекающий, динамичный
- Обращение на "ты" — зритель=наблюдатель, видит всё изнутри
- Конкретные детали ("в 4 утра", "37 ножей", "17 кг рыбы") > абстракции
- Сцена 1: Мощный ХУК и обещание раскрыть секрет в конце ("Досмотри до конца, чтобы узнать, почему...")
- Сцена 8: Финальный вывод с призывом к действию или вопросом зрителю
- Каждая сцена должна заканчиваться на интригующей ноте

СТРУКТУРА 8 ЧАСТЕЙ:
1. ХУК + ОБЕЩАНИЕ: вопрос или факт, который никто не знает + призыв досмотреть до конца.
2. УТРО: как начинается рабочий день (конкретно, детали, атмосфера).
3. ГЛАВНЫЙ ИНСТРУМЕНТ: то, чему учатся годами, описание процесса.
4. СКРЫТАЯ ТРУДНОСТЬ: то, чего не видно снаружи, эмоциональный накал.
5. СМЕШНОЙ / НЕОЖИДАННЫЙ МОМЕНТ: реальная история или типичный случай.
6. ВЗАИМОДЕЙСТВИЕ: самый запоминающийся момент с миром/людьми.
7. КОНЕЦ ДНЯ: что остаётся, когда все уходят, момент тишины.
8. ФИНАЛ: обещанный секрет + неожиданная мораль + подпишись/вопрос.

ЗАПРЕЩЕНО:
- Банальные фразы ("эта профессия очень важна")
- Короткие предложения (< 15 слов)
- Пафос и морализаторство

════════════════════════════════════════════════
СТИЛЬ ИЗОБРАЖЕНИЙ (3D cartoon animated):
════════════════════════════════════════════════
Основа стиля для КАЖДОГО imagePrompt:
"highly detailed stylized 3D animated [ПРОФЕССИЯ] worker, semi-realistic Pixar-style masterpiece, 
EXTREMELY VIBRANT SATURATED COLORS, high contrast, rich color palette, expressive facial features, 
natural relaxed facial expression, subtle micro-expressions, attentive eyes, detailed skin texture,
worn work clothes, [КОНКРЕТНАЯ РАБОЧАЯ ОБСТАНОВКА], 
BOLD DOMINANT LARGE OBJECTS in the composition to ground the scene, monumental scale elements,
cinematic dramatic lighting, sharp focus, ultra detailed textures, observational storytelling,
vertical TikTok framing, professional camera work, 8k render, breathtaking visuals"

ВАЖНО для imagePrompt:
- Возраст персонажа соответствует сцене
- Детали костюма/инструментов ТОЧНО соответствуют эпохе и профессии
- Рабочая среда конкретная и узнаваемая, с КРУПНЫМИ объектами на переднем или заднем плане
- Освещение максимально яркое и насыщенное (утро = пылающее золото, ночь = глубокий неоновый индиго)
- Черты лица персонажа ОДИНАКОВЫ во всех 8 сценах (из characterProfile)

ВЫБОР LIGHTING по сцене:
- Сцена 1 (хук) → vibrant dramatic side lighting with rich shadows
- Сцена 2 (утро) → intense golden hour glow, high saturation
- Сцена 3 (навык) → bright cinematic task lighting, vibrant highlights
- Сцена 4 (трудность) → rich moody overcast with deep blues and textures
- Сцена 5 (смешной момент) → vibrant high-key comedic lighting, saturated colors
- Сцена 6 (взаимодействие) → rich warm social atmosphere, glowing colors
- Сцена 7 (конец дня) → deep cinematic blue hour, neon-like highlights
- Сцена 8 (вывод) → vibrant sunset glow, long saturated shadows

════════════════════════════════════════════════
СТИЛЬ ВИДЕО (3D cartoon animated):
════════════════════════════════════════════════
Основа для КАЖДОГО videoPrompt:
"8-second cinematic stylized 3D animated video, vertical 9:16 TikTok format, semi-realistic EXTREMELY VIBRANT cartoon style.
SCENE: [ДЕЙСТВИЕ]. CHARACTER: [ПЕРСОНАЖ + ДЕТАЛИ]. SETTING: [ОБСТАНОВКА].
BOLD VISUALS: Include prominent LARGE DOMINANT OBJECTS in the composition for better AI understanding.
OPENING: Start with close-up of [рука/инструмент/лицо] then reveal.
CAMERA: [ВЫБЕРИ — CINEMATIC WORK]. LIGHTING: [ВЫБЕРИ — ULTRA VIBRANT]. ATMOSPHERE: [RICH, DEEP, SATURATED].
LAST FRAME: [ИНТРИГУЮЩИЙ ВИЗУАЛЬНЫЙ МОМЕНТ].
QUALITY: 8K masterpiece render, high saturation, vivid colors, period-accurate props, fluid professional movement."

CAMERA по сцене (CINEMATIC MOVEMENTS):
- Сцена 1 → Cinematic slow-motion zoom-in, focusing on expressive eyes
- Сцена 2 → Smooth tracking shot (dolly move) following the character
- Сцена 3 → Dynamic macro close-up with shallow depth-of-field parallax
- Сцена 4 → Wide cinematic sweep showing the monumental scale of the task
- Сцена 5 → Fast whip-pan to reaction, comedic timing, vibrant motion
- Сцена 6 → Rotating gimbal shot around the characters for depth
- Сцена 7 → Atmospheric pull-back with cinematic fog/particles, wide angle
- Сцена 8 → Heroic low-angle push-in, bright sunset flare, epic feel`;

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
- СТРОГО 17-20 слов на строку
- Юмор, удивление и МОЩНЫЙ ИНТРИГУЮЩИЙ ХУК > пафос
- Обязательно в Сцене 1: призыв смотреть до конца ("Досмотри до конца, чтобы узнать..."). 
- Обязательно в Сцене 8: обещанный секрет/финал + призыв к подписке/вопрос.
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
    "cartoonStyle": "vibrant, highly detailed, semi-realistic 3D Pixar-style"
  },
  "scenes": [
    {
      "id": 1,
      "stage": "ХУК",
      "line": "нарратив на ${langName} — СТРОГО 17-20 слов, мощный хук + призыв смотреть до конца",
      "imagePrompt": "highly detailed stylized 3D animated [профессия] worker, semi-realistic Pixar-style masterpiece, vibrant saturated colors, [ОПИСАНИЕ СЦЕНЫ — возраст, действие, детали]. BOLD LARGE OBJECTS in the background. Vibrant dramatic side lighting. Cinematic composition, vertical TikTok framing, 8k render. warm brown wide eyes, flour dust on cheek.",
      "videoPrompt": "8-second cinematic stylized 3D animated video, vertical 9:16 TikTok format, semi-realistic vibrant cartoon style. SCENE: [ДЕЙСТВИЕ]. CHARACTER: [ОПИСАНИЕ]. SETTING: [МЕСТО]. BOLD VISUALS: Large [объект] in focus. OPENING: close-up then reveal. CAMERA: cinematic slow-motion zoom-in. LIGHTING: vibrant dramatic lighting. ATMOSPHERE: rich and saturated. LAST FRAME: character looks at camera with mysterious smile. QUALITY: 8K masterpiece render."
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

            const imgPath = savedPaths[0];
            const imgBuffer = fs.readFileSync(imgPath);
            const imgExt = path.extname(imgPath).toLowerCase();
            const imgMime = imgExt === '.png' ? 'image/png' : imgExt === '.webp' ? 'image/webp' : 'image/jpeg';
            return `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
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
            
            // Return as base64 data URL to bypass protocol issues on Windows
            const audioBuffer = fs.readFileSync(audioPath);
            return `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
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

        let referenceImages = [];
        if (sourceImageUrl && sourceImageUrl.startsWith('data:image')) {
            referenceImages.push({ data: sourceImageUrl });
            console.log(`[Cartoon] Using base64 reference image for scene ${sceneIndex}`);
        } else {
            const imagePath = sourceImageUrl ? sourceImageUrl.replace('media:///', '').split('?')[0] : null;
            if (imagePath && fs.existsSync(imagePath)) {
                const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
                const imageBase64 = fs.readFileSync(imagePath).toString('base64');
                referenceImages.push({ data: `data:image/${ext};base64,${imageBase64}` });
                console.log(`[Cartoon] Using file reference image: ${imagePath}`);
            } else {
                console.log(`[Cartoon] No reference image found for scene ${sceneIndex}, using text-to-video mode`);
            }
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