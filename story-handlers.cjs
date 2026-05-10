const path = require('path');
const fs = require('fs');

// Directories for Stories
const STORY_DIRS = {
    base: path.join(__dirname, 'Stories'),
    audio: path.join(__dirname, 'Stories', 'Audio'),
    images: path.join(__dirname, 'Stories', 'Images'),
    videos: path.join(__dirname, 'Stories', 'Videos'),
};

// Ensure directories exist
Object.values(STORY_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const { callPollinations, synthesizeUnifiedSpeech } = require('./skeleton-handlers.cjs');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');

// ─────────────────────────────────────────────────────────────────────────────
// VoiseAPI (https://voiceapi.csv666.ru) — CORRECT ASYNC TASK FLOW
// POST /tasks → {task_id} → poll GET /tasks/{id} → download binary MP3
// ─────────────────────────────────────────────────────────────────────────────
async function storyGenerateVoice(text, language, outputDir, sceneIndex = null) {
    const apiKey = process.env.VOICEAPI_KEY;
    if (!apiKey) throw new Error('[Voice] VOICEAPI_KEY not set in .env');

    // Voice ID: configure STORY_VOICE_ID in .env (or falls back to TEST_VOICE_ID)
    const voiceId = process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID;
    if (!voiceId) throw new Error('[Voice] Set STORY_VOICE_ID or TEST_VOICE_ID in .env');

    // Prefer scene-indexed filename (scene_N.mp3) so assembly can find it reliably.
    // Fallback to hash-based name for backward compat (no sceneIndex provided).
    let filename;
    if (sceneIndex !== null && sceneIndex !== undefined) {
        filename = `scene_${sceneIndex + 1}.mp3`;
    } else {
        const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
        filename = `voice_${hash}.mp3`;
    }
    const dir = outputDir || STORY_DIRS.audio;
    const outputPath = path.join(dir, filename);

    // Cache check — skip if valid file exists
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1000) {
            // Read first 4 bytes to verify it's real audio (ID3 tag or MPEG sync)
            const fd = fs.openSync(outputPath, 'r');
            const hdr = Buffer.alloc(4);
            fs.readSync(fd, hdr, 0, 4, 0);
            fs.closeSync(fd);
            const isID3  = hdr[0] === 0x49 && hdr[1] === 0x44 && hdr[2] === 0x33;
            const isSync = hdr[0] === 0xFF && (hdr[1] & 0xE0) === 0xE0;
            const isHtml = hdr.toString('ascii').startsWith('<');
            if (isID3 || isSync) {
                console.log(`[Voice] Using cached: ${outputPath} (${stat.size}B)`);
                return outputPath;
            }
            // File is not valid audio (HTML, JSON error, truncated) — delete and regenerate
            console.warn(`[Voice] Cached file invalid (isHtml=${isHtml}, size=${stat.size}B). Deleting and regenerating...`);
            fs.unlinkSync(outputPath);
        } else {
            // File too small — definitely invalid, delete it
            console.warn(`[Voice] Cached file too small (${stat.size}B). Deleting and regenerating...`);
            fs.unlinkSync(outputPath);
        }
    }

    const VOISE_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';

    // ✅ CORRECT AUTH per API docs: X-API-Key header (not Bearer!)
    // Source: securitySchemes.APIKeyHeader → in: header, name: X-API-Key
    const headers = {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
    };

    // Step 1: POST /tasks — create TTS task
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

    console.log(`[Voice] POST /tasks voice=${voiceId} lang=${language} text=${text.length}ch`);
    const cr = await axios.post(`${VOISE_BASE}/tasks`, taskBody, { headers });
    const taskId = cr.data && (cr.data.task_id || cr.data.id);
    if (!taskId) {
        throw new Error('[Voice] No task_id in response: ' + JSON.stringify(cr.data).slice(0, 200));
    }
    console.log(`[Voice] Task created: id=${taskId}`);

    // Step 2: Poll GET /tasks/{id}/status  (NOT /tasks/{id}!)
    // Statuses: waiting → processing → ending (ready!) → ending_processed
    // Source: /tasks/{task_id}/status endpoint in OpenAPI spec
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await axios.get(`${VOISE_BASE}/tasks/${taskId}/status`, { headers });
        const t = sr.data;
        const st = ((t.status || '')).toLowerCase();
        console.log(`[Voice] Task ${taskId}: status="${st}" (${i + 1}/60)`);

        if (st === 'error' || st === 'error_handled') {
            throw new Error('[Voice] Task failed: ' + JSON.stringify(t).slice(0, 200));
        }

        // "ending" = result ready for download
        if (st === 'ending' || st === 'ending_processed') {
            console.log(`[Voice] Status "${st}" — downloading result from /tasks/${taskId}/result`);

            // Step 3: GET /tasks/{id}/result — binary MP3 download
            const ar = await axios.get(
                `${VOISE_BASE}/tasks/${taskId}/result`,
                { responseType: 'arraybuffer', headers }
            );
            const buf = Buffer.from(ar.data);

            // Verify it's actually audio (ID3 or MPEG sync)
            const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
            const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
            if (buf.length < 100) {
                throw new Error(`[Voice] Result too small: ${buf.length}B`);
            }
            if (!isID3 && !isSync) {
                // Might be an error JSON — log it
                const preview = buf.slice(0, 200).toString('utf8');
                throw new Error(`[Voice] Result is not MP3 (${buf.length}B): ${preview}`);
            }

            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(outputPath, buf);
            console.log(`[Voice] ✅ Saved: ${outputPath} (${buf.length}B, isID3=${isID3}, isSync=${isSync})`);
            return outputPath;
        }
        // waiting / processing — keep polling
    }
    throw new Error(`[Voice] Timeout: task ${taskId} did not complete in 3 minutes`);
}

// ── Preview re-encoding helper (same as skeleton-handlers) ──────────────────
async function reencodeForPreview(inputPath, sceneIndex, projectFolder) {
    const previewDir = projectFolder
        ? path.join(STORY_DIRS.base, projectFolder, 'Videos')
        : STORY_DIRS.videos;
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}_preview.mp4`);
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', previewPath
        ]);
        ffmpeg.on('close', code => {
            const resultPath = code === 0 ? previewPath : inputPath;
            resolve(resultPath);
        });
        ffmpeg.on('error', () => {
            resolve(inputPath);
        });
    });
}

// Helper: create a project folder with date/time stamp
function createStoryProjectFolder() {
    const now = new Date();
    const timestamp = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getFullYear()}`;
    const folderName = `Story_${timestamp}`;
    const folderPath = path.join(STORY_DIRS.base, folderName);

    // Create subfolders
    const subDirs = ['Images', 'Videos', 'Audio'];
    subDirs.forEach(sub => {
        const subPath = path.join(folderPath, sub);
        if (!fs.existsSync(subPath)) fs.mkdirSync(subPath, { recursive: true });
    });

    console.log(`[Stories] Created project folder: ${folderPath}`);
    return folderName;
}

function registerStoryHandlers(ipcMain) {
    // 0. Create a new story project folder
    ipcMain.handle('story-create-folder', async () => {
        return createStoryProjectFolder();
    });

    // 1. Generate Life Journey Story Ideas
    ipcMain.handle('story-generate-ideas', async (event, { topic, language }) => {

        // Country/culture context based on selected language
        const CULTURE_MAP = {
            'French': {
                country: 'Франция',
                label: 'французской истории и культуры',
                epochs: `
- Галльские вожди (50 до н.э., Галлия — сопротивление Риму, Верцингеториг)
- Рыцари-тамплиеры (1118-1312, Париж/Иерусалим)
- Столетняя война (1337-1453, Нормандия, Жанна д'Арк)
- Кардинал Ришелье и мушкетёры (1620-1642, Париж)
- Версальский двор Людовика XIV (1643-1715, Версаль)
- Французская революция (1789-1799, Париж, Гильотина)
- Наполеоновские войны (1799-1815, Европа)
- Парижская Коммуна (1871, Париж)
- Французский Иностранный легион (1831+, Алжир/Индокитай)
- Belle Époque — художники Монмартра (1880-1914, Париж)
- Первая мировая: окопы Вердена (1916, Франция)
- Французское Сопротивление (1940-1944, оккупированный Париж)
- Профессии: булочник в Лионе, виноградарь Бургундии, ткач Лиона, матрос Марселя, угольщик Нор-Па-де-Кале`,
            },
            'Russian': {
                country: 'Россия',
                label: 'российской и русской истории',
                epochs: `
- Киевская Русь (882-1240, Киев/Новгород)
- Монгольское иго (1237-1480, Русские княжества)
- Иван Грозный и опричнина (1565-1572, Москва)
- Смутное время (1598-1613, Москва)
- Пётр I и строительство Петербурга (1703, Санкт-Петербург)
- Екатерина Великая (1762-1796, Петербург/Крым)
- Война с Наполеоном (1812, Москва, Бородино)
- Декабристы (1825, Петербург)
- Освобождение крестьян (1861, Центральная Россия)
- Революция 1917 года (Петроград)
- Советская индустриализация (1930-е, Урал/Сибирь)
- Блокада Ленинграда (1941-1944)
- Космическая гонка (1957-1969, Байконур/Москва)
- Профессии: кузнец Тулы, рыбак Волги, шахтёр Донбасса, казак, монах Соловецкого монастыря`,
            },
            'German': {
                country: 'Германия',
                label: 'германской истории и культуры',
                epochs: `
- Племена германцев и Рим (9 н.э., битва в Тевтобургском лесу)
- Священная Римская империя (962-1806, Аахен/Вена)
- Тевтонский орден (1190-1525, Пруссия/Прибалтика)
- Мартин Лютер и Реформация (1517, Виттенберг)
- Тридцатилетняя война (1618-1648, Германия)
- Пруссия Фридриха Великого (1740-1786, Берлин/Потсдам)
- Гёте и веймарский классицизм (1775-1832, Веймар)
- Объединение Германии под Бисмарком (1871, Берлин)
- Первая мировая: окопы на Западном фронте (1914-1918)
- Веймарская республика (1919-1933, Берлин)
- Вторая мировая война (1939-1945)
- Берлинская стена (1961-1989, Берлин)
- Профессии: шахтёр Рура, стеклодув Тюрингии, пивовар Баварии, купец Ганзы, печатник Майнца`,
            },
            'Spanish': {
                country: 'Испания',
                label: 'испанской истории и культуры',
                epochs: `
- Аль-Андалус (711-1492, Кордова/Гранада — мавританская Испания)
- Реконкиста (718-1492, Кастилия/Арагон)
- Инквизиция (1478-1834, Толедо/Севилья)
- Конкистадоры (1492-1600, Мексика/Перу/Куба)
- Золотой век Испании (1492-1659, Мадрид)
- Непобедимая Армада (1588, Атлантика)
- Испанские художники (Веласкес, Гойя — Мадрид, 1600-1800)
- Наполеоновская оккупация (1808-1813, Испания)
- Потеря колоний (1898, Куба/Филиппины)
- Гражданская война (1936-1939, Мадрид/Барселона)
- Франкистская Испания (1939-1975)
- Профессии: рыбак Галисии, пастух Кастилии, шёлкоткач Гранады, тореадор, матрос из Кадиса, шахтёр Астурии`,
            },
            'English': {
                country: 'Великобритания / США',
                label: 'британской и американской истории',
                epochs: `
- Римская Британия (43-410 н.э., Лондиний)
- Англосаксы и викинги (793-1066, Нортумбрия/Йорк)
- Нормандское завоевание (1066, Гастингс)
- Magna Carta и бароны (1215, Раннимид)
- Война Роз (1455-1485, Англия)
- Елизаветинская эпоха (1558-1603, Лондон — Шекспир, пираты)
- Пуритане и Новый Свет (1620, Mayflower, Плимут)
- Английская гражданская война (1642-1651, Кромвель)
- Промышленная революция (1760-1840, Манчестер/Бирмингем)
- Британская империя (1815-1914, Индия/Африка)
- Американский Дикий Запад (1865-1890)
- Первая мировая: окопы Фландрии (1914-1918)
- Вторая мировая: битва за Британию (1940, Лондон)
- Профессии: шахтёр Уэльса, ткач Ланкашира, докер Ливерпуля, золотоискатель Клондайка, ковбой Техаса`,
            },
        };

        const cultureCtx = CULTURE_MAP[language] || CULTURE_MAP['English'];

        // Ideas are ALWAYS displayed in Russian for selection, regardless of narration language
        const systemPrompt = `Ты — мастер исторического сторителлинга для TikTok и YouTube Shorts.
Создаёшь идеи историй где зритель ПРОЖИВАЕТ чужую жизнь сам, от второго лица ("ты").

ВСЕ ТЕКСТЫ — СТРОГО НА РУССКОМ ЯЗЫКЕ.

ВАЖНО: Язык нарратива — ${language}. Истории должны быть культурно привязаны к ${cultureCtx.country}.
Персонажи, профессии, места и эпохи должны в ПЕРВУЮ ОЧЕРЕДЬ отражать ${cultureCtx.label}.

════════════════════════════════════════════════
ОБРАЗЕЦ КАЧЕСТВЕННОГО ХУКА (учись у этого примера):
════════════════════════════════════════════════

ПЛОХОЙ хук (слабый, абстрактный):
"Ты — воин. Тебя ждут великие испытания и битвы."

ХОРОШИЙ хук (конкретный, физический, с предзнаменованием):
"Ты родился тамплиером — в каменном замке зимой 1072 года. Твой отец — рыцарь ордена Храма. Твоя судьба была решена ещё до твоего первого крика. Не ты выбирал этот путь — путь выбрал тебя."

ЧТО ДЕЛАЕТ ХОРОШИЙ ХУК:
- Конкретный год и место (1072, Бургундия, Франция — НЕ "средневековье")
- Конкретный социальный статус (тамплиер, сын кузнеца, рыбак)
- Физическая деталь ("каменный замок зимой", "в разгар шторма")
- Контраст или парадокс ("не ты выбирал путь — путь выбрал тебя")
- Предзнаменование ("твоя судьба была решена ещё до первого крика")

════════════════════════════════════════════════
ПРИОРИТЕТНЫЕ ЭПОХИ И ПРОФЕССИИ ДЛЯ ${cultureCtx.country.toUpperCase()}:
════════════════════════════════════════════════
${cultureCtx.epochs}

ИЗБЕГАЙ: общих слов "воин", "герой", "великий". Всегда конкретная роль в конкретном месте и году.
Минимум 4 из 5 идей должны быть привязаны к ${cultureCtx.country} — её городам, профессиям, историческим событиям.`;

        const userPrompt = `Тематический запрос: ${topic || `Случайная эпоха из истории ${cultureCtx.country} — выбери самую кинематографическую и малоизвестную`}

Сгенерируй 5 идей для POV-историй. Большинство должны отражать историю, культуру и профессии ${cultureCtx.country}.

ТРЕБОВАНИЯ К КАЖДОЙ ИДЕЕ:
1. Конкретный год и место (не "средневековье" — а "1147 год, Антиохия, Крестовый поход")
2. Конкретная социальная роль (не "воин" — а "оруженосец, несущий щит барона")
3. Хук — 2-3 предложения которые НЕМЕДЛЕННО погружают в жизнь
4. Предзнаменование — намёк на драму которая ждёт впереди
5. Эмоциональный вопрос который будет мучить зрителя весь ролик

ФОРМАТ ХУКА: "Ты родился/лась [КТО] — в [КОНКРЕТНОЕ МЕСТО] в [ГОД]. [ФИЗИЧЕСКАЯ ДЕТАЛЬ которая сразу создаёт атмосферу]. [КОНТРАСТ или ПАРАДОКС]. [ПРЕДЗНАМЕНОВАНИЕ]."

Выведи JSON строго по структуре:
{
   "ideas": [
      {
         "title": "Название на русском (поэтичное, 3-5 слов)",
         "hook": "Хук на русском: 2-3 предложения. Конкретный год + место + физическая деталь + парадокс + предзнаменование",
         "era": "Точная историческая эпоха/место/год на русском",
         "character": "Конкретная социальная роль героя на русском (не 'воин' — а 'сын кузнеца при дворе Саладина')"
      }
   ]
}`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], true);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            return JSON.parse(jsonText).ideas;
        } catch(e) {
            throw new Error("Failed to generate story ideas from AI.");
        }
    });

    // 2. Generate Life Journey Script & Prompts (8 scenes with character consistency)
    ipcMain.handle('story-generate-script', async (event, { idea, language, projectFolder }) => {
        const langName = language || 'English';
        const systemPrompt = `Ты мастер короткого захватывающего текста для TikTok видео в жанре исторического погружения от второго лица.

ФОРМАТ ВИДЕО:
64 секунды = 8 частей по 8 секунд
Каждая часть = 16-18 слов МАКСИМУМ
Язык нарратива: ${langName}

════════════════════════════════════════════════
СТИЛЬ — СТРОГО СОБЛЮДАЙ:
════════════════════════════════════════════════

НАЧИНАЙ с вызова или провокации:
  "Ты не представляешь каково это..."
  "Никто не говорит тебе что будет..."
  "Ты думаешь знаешь что такое страх?"
  "Представь — тебе семь лет и ты уже знаешь как умирать"

ГОВОРИ "ты" — зритель проживает это сам

КОНКРЕТНЫЕ ФИЗИЧЕСКИЕ ДЕТАЛИ:
  НЕ "было больно" → "кровавые мозоли на ладонях"
  НЕ "было холодно" → "камень под босыми ногами в январе"
  НЕ "ты боялся" → "колени не слушались но ты шёл"

НАРАСТАЮЩЕЕ НАПРЯЖЕНИЕ:
  Часть 1 → интрига и вызов зрителю
  Части 2-4 → физическая и эмоциональная боль
  Части 5-6 → момент невозврата
  Часть 7 → максимальное напряжение
  Часть 8 → финальный удар ОДНОЙ фразой

ЗАКАНЧИВАЙ каждую часть НЕЗАКРЫТОЙ мыслью — зритель физически не может остановиться.

ИСПОЛЬЗУЙ КОРОТКИЕ РУБЛЕНЫЕ ФРАЗЫ:
  "Боль? Забудь это слово."
  "Страх? Не твоя роскошь."
  "Выбор? Его никогда не было."

ОДИН КОНКРЕТНЫЙ ОБРАЗ на каждую часть:
  меч / мозоль / кровь / холод / огонь / взгляд отца / рука друга / пустое поле

════════════════════════════════════════════════
ЗАПРЕЩЕНО АБСОЛЮТНО:
════════════════════════════════════════════════
- Абстрактные слова без образа (не "тяжело" — а что именно тяжело)
- Предложения длиннее 10 слов (исключение: только если разбиты тире/паузой)
- Пафосные штампы: "великий воин", "славная смерть", "судьба", "навсегда", "во веки веков"
- Объяснять — ТОЛЬКО ПОКАЗЫВАТЬ
- Слабые финалы — последняя фраза должна бить как удар

════════════════════════════════════════════════
ОБЯЗАТЕЛЬНАЯ СТРУКТУРА 8 ЧАСТЕЙ:
════════════════════════════════════════════════
Часть 1 — ВЫЗОВ зрителю + место + время (конкретный год)
Часть 2 — ДЕТСТВО. Первая физическая боль
Часть 3 — ПЕРВАЯ СМЕРТЬ которую ты видел своими глазами
Часть 4 — МОМЕНТ когда ты понял кто ты есть
Часть 5 — ПЕРВЫЙ НАСТОЯЩИЙ БОЙ или испытание
Часть 6 — ПОТЕРЯ того кто был важен
Часть 7 — ВЫБОР между честью и жизнью
Часть 8 — ФИНАЛ. Одна фраза которую зритель запомнит навсегда

ТЕСТ: Прочитай каждую часть вслух. Если можно остановиться — перепиши. Зритель должен ФИЗИЧЕСКИ хотеть следующую часть.

════════════════════════════════════════════════
ПРИМЕР ПРАВИЛЬНОГО СТИЛЯ:
════════════════════════════════════════════════
"Ты не представляешь каково это — родиться в семье самурая.
С семи лет меч. Каждый день. На ладонях кровь — всем плевать.
Придёт день — ты умрёшь за честь хозяина.
И это не страшно. Это единственное для чего ты рождён."

════════════════════════════════════════════════
ЭТНИЧЕСКАЯ ТОЧНОСТЬ (ОБЯЗАТЕЛЬНО для characterProfile и imagePrompt):
════════════════════════════════════════════════
Внешность персонажа СТРОГО соответствует его происхождению:

АЗИЯ (Япония, Китай, Корея, Монголия, Юго-Восточная Азия):
→ Asian features: epicanthic fold, dark almond-shaped eyes, straight black hair,
  warm golden-olive skin, flat nose bridge, high cheekbones
→ Costume: kimono/hanfu/deel/ao dai, topknot or loose bun, sandals or cloth shoes

БЛИЖНИЙ ВОСТОК (Персия, Аравия, Османская империя, Крестовые походы — мусульмане):
→ Middle Eastern features: dark olive to tan skin, deep-set dark brown or black eyes,
  prominent nose, thick dark eyebrows, dark wavy hair
→ Costume: thobe/kaftan/turban/chainmail for warriors, long robes, leather sandals

ЕВРОПА (Рим, Греция, Средневековье, Ренессанс, Викинги, Крестоносцы):
→ European features: fair to olive skin, light to dark hair (blonde/brown/black/red),
  blue/green/grey/brown eyes, varied nose shapes
→ Costume: togas/tunics/chainmail/plate armor/doublet based on exact century and region

АФРИКА (Египет, Нубия, Западная Африка, Суб-Сахарская Африка):
→ African features: dark brown to deep ebony skin, wide nose, full lips,
  tightly coiled black hair (or shaved), strong jaw
→ Costume: linen wraps/kente cloth/leather/beads — specific to region and era

СКАНДИНАВИЯ / ВИКИНГИ (793-1066, Норвегия, Исландия, Дания):
→ Nordic features: fair to ruddy skin, blonde/red/light brown hair, blue or grey eyes,
  strong jaw, tall build
→ Costume: wool tunic, leather breeches, fur cloak, iron helmet (NO horns!), seax dagger

ИНДИЯ (Индская цивилизация, Империя Гуптов, Великие Моголы):
→ South Asian features: warm brown to dark brown skin, dark eyes with long lashes,
  black hair, strong eyebrows, defined features
→ Costume: dhoti/sari/kurta/chainmail for warriors — specific to dynasty and era

ДОКОЛУМБОВА АМЕРИКА (Ацтеки, Майя, Инки):
→ Indigenous American features: warm copper-brown skin, straight black hair,
  prominent cheekbones, epicanthic fold, dark eyes
→ Costume: cotton manta/feathered headdress/jaguar pelt — specific to culture

ОРУЖИЕ — СТРОГО ПО ЭПОХЕ И РЕГИОНУ:
→ Японские самураи (794-1868): katana, wakizashi, yumi (longbow), naginata, tanto
→ Китайские воины (Хань/Тан/Сун/Мин): jian (прямой меч), dao (кривой меч), guandao, crossbow, ji (алебарда)
→ Монгольские воины (1206-1368): composite recurve bow, sabre (шабля), lance, мongolian dagger
→ Викинги (793-1066): seax (нож), scramасax, dane axe, round shield, spear (копьё), longsword
→ Рыцари-крестоносцы (1096-1291): longsword, kite shield, mace, crossbow, plate armor lance
→ Рыцари (Средневековье, 1200-1400): arming sword, heater shield, pollaxe, war hammer
→ Рыцари (позднее Средневековье, 1400-1550): two-handed greatsword, plate armor, halberd
→ Древний Рим (Республика/Империя): gladius (короткий меч), pilum (дротик), scutum (прямоугольный щит), pugio
→ Древняя Греция: xiphos (меч), aspis (круглый щит), dory (копьё), hoplon
→ Османская империя (1299-1922): kilij (сабля), composite bow, janissary musket (после 1400), yatagan
→ Арабские воины: scimitar (кривой меч), lance, composite bow, round shield
→ Египет (Древний): khopesh (серповидный меч), spear, composite bow, sickle sword
→ Персия (Ахемениды): akinakes (короткий меч), spear, wicker shield, composite bow
→ Японские ниндзя: tanto, shuriken, kusarigama, ninjato — НЕ katana
→ Пираты (1650-1730): flintlock pistol, cutlass, boarding axe, musket
→ Гражданская война США (1861-1865): Springfield rifle-musket, Colt revolver, bayonet, cavalry sabre
→ Вторая мировая война: конкретная страна → конкретная винтовка (Mosin-Nagant/К-98/M1 Garand)
→ Доколумбова Америка: obsidian macuahuitl (ацтеки), atlatl, stone-tipped spear, wooden club

ЗАПРЕЩЕНО: мечи в Китае вместо dao/jian, европейские мечи у самураев, огнестрельное оружие до его изобретения в регионе, "generic sword" без названия

ВАЖНО — В КАЖДОМ imagePrompt ОБЯЗАТЕЛЬНО УКАЗЫВАЙ:
1. Конкретный год и место → соответствующая одежда, доспехи и оружие
2. Этнические черты лица → из characterProfile
3. Период-аккуратные детали костюма (ткань, металл, орнамент)
4. Конкретное оружие эпохи → из списка выше
5. Запрещено: современные элементы, смешение эпох, евроцентричная внешность для неевропейских персонажей, неправильное оружие

════════════════════════════════════════════════
CHARACTER CONSISTENCY (ОБЯЗАТЕЛЬНО):
════════════════════════════════════════════════
Сгенерируй "characterProfile" — НЕИЗМЕННЫЕ черты лица для всех 8 сцен.
Персонаж стареет, но структура лица остаётся.
ЭТНИЧЕСКИЕ ЧЕРТЫ ЛИЦА должны строго соответствовать региону истории (см. выше).
Включи: faceShape, nose, lips, ears, eyes (цвет+форма), hair, skinTone, ethnicity (Asian/European/African/Middle Eastern/etc.), distinguishingFeature (шрам/родинка)

════════════════════════════════════════════════
ПРОМПТЫ ДЛЯ ИЗОБРАЖЕНИЙ (imagePrompt — ТОЛЬКО English):
════════════════════════════════════════════════
Используй СТРОГО этот шаблон для каждого imagePrompt:

"Cinematic historical scene, photorealistic: [ОПИСАНИЕ СЦЕНЫ 1-2 предложения — возраст персонажа + действие + конкретная физическая деталь из characterProfile].

Style: epic historical drama, Ridley Scott aesthetic, 35mm film grain, anamorphic lens.

Lighting: [ВЫБЕРИ ПО ЭМОЦИИ СЦЕНЫ: dramatic torchlight / golden hour / cold moonlight / harsh single source].

Composition: rule of thirds, [extreme close-up OR wide cinematic shot], 70% shadow 30% light, sharp foreground blurred epic background.

Atmosphere: [dust particles / fog / snow / embers floating in air — ВСЕГДА ПРИСУТСТВУЕТ].

Subject details: weathered skin, dirt, period-accurate costume, scars, no clean perfect faces. [ЧЕРТЫ ИЗ characterProfile: eyes, distinguishingFeature].

Color grade: desaturated + [amber for hope/birth / cold blue for pain/loss / red for war / grey for loss/death].

Forbidden: no modern elements, no studio lighting, no symmetrical composition, no clean backgrounds.

Quality: ultra-detailed, 8K, RAW, photorealistic, depth of field, anamorphic lens flare, vertical 9:16 composition."

ВЫБОР LIGHTING ПО СЦЕНЕ:
- Сцена 1 (рождение/вызов) → warm amber torchlight
- Сцена 2 (детство/боль) → cold blue, harsh single source
- Сцена 3 (первая смерть) → cold moonlight, deep shadows
- Сцена 4 (осознание) → dramatic torchlight
- Сцена 5 (бой) → high contrast, dust and smoke, red/orange fire
- Сцена 6 (потеря) → overcast flat grey
- Сцена 7 (выбор) → single candle, 90% darkness
- Сцена 8 (финал) → golden hour warm amber

════════════════════════════════════════════════
ПРОМПТЫ ДЛЯ ВИДЕО (videoPrompt — ТОЛЬКО English):
════════════════════════════════════════════════
Используй СТРОГО этот шаблон для каждого videoPrompt:

"8-second cinematic historical video clip, vertical 9:16 TikTok format.

SCENE: [ОПИСАНИЕ ДЕЙСТВИЯ].
EPOCH: [ИСТОРИЧЕСКАЯ ЭПОХА].
LOCATION: [КОНКРЕТНОЕ МЕСТО].

OPENING (first 2 seconds): Start with extreme close-up of [eye / hand / weapon / flame] — then slowly reveal the full scene. Never start static or empty.

CAMERA: [ВЫБЕРИ ОДНО]:
Slow cinematic push-in toward face / Handheld shaky close-up of hands in action / Sweeping pull-back reveal / Locked static with subject moving through frame / Extreme slow motion 200% on emotional peak.

LIGHTING: [ВЫБЕРИ ПО ЭМОЦИИ: warm amber torchlight / cold blue single source / high contrast dust smoke / overcast grey / single candle 90% darkness].

ATMOSPHERE: Floating [dust / snow / embers / fog]. Fabric and hair moving in wind. Breath visible in cold air. Fire with real physics.

SOUND (diegetic): Seconds 1-4 → [wind / fire crackle / distant horses / metal clinking specific to epoch]. Seconds 5-6 → orchestral swell. Seconds 7-8 → sound cuts leaving tension.

LAST FRAME: End on unresolved visual tension — [subject looks off-screen / door closes / flame goes out / hand reaches but doesn't touch]. Viewer MUST want next clip.

QUALITY: Photorealistic, cinematic 8K, historical epic, natural motion blur, anamorphic lens, film grain, no modern elements, period-accurate only. FORBIDDEN: no talking heads facing camera, no static shots over 2 seconds, no studio lighting, no clean skin."

ВЫБОР CAMERA ПО СЦЕНЕ:
- Сцена 1 → Slow cinematic push-in toward face
- Сцена 2 → Handheld shaky close-up of hands
- Сцена 3 → Locked static, subject moving through frame
- Сцена 4 → Slow push-in on face (micro-expressions)
- Сцена 5 → Handheld shaky, fast action
- Сцена 6 → Sweeping pull-back reveal of emptiness
- Сцена 7 → Extreme slow motion 200% on peak moment
- Сцена 8 → Slow cinematic push-in, end on unresolved tension`;

        // Handle idea as object or string
        const ideaTitle    = idea?.title    || (typeof idea === 'string' ? idea : '');
        const ideaHook     = idea?.hook     || '';
        const ideaEra      = idea?.era      || '';
        const ideaCharacter= idea?.character|| '';
        const ideaContext  = [
            ideaTitle    ? `Название: ${ideaTitle}`       : '',
            ideaHook     ? `Хук: ${ideaHook}`             : '',
            ideaEra      ? `Эпоха/место: ${ideaEra}`      : '',
            ideaCharacter? `Персонаж: ${ideaCharacter}`   : '',
        ].filter(Boolean).join('\n') || String(idea);

        const userPrompt = `ИДЕЯ ДЛЯ ИСТОРИИ:
${ideaContext}

ТВОЯ ЗАДАЧА: Написать 8 нарративных строк (line) для этой истории.
Каждая строка озвучивается голосом за кадром — 8 секунд на сцену.

════════════════════════════════════════════════
ПРАВИЛО "НЕЛЬЗЯ ОСТАНОВИТЬСЯ":
════════════════════════════════════════════════
После каждой строки зритель должен ФИЗИЧЕСКИ хотеть следующую.
Прочитай каждую строку вслух. Если после неё можно закрыть видео — перепиши.

ПРИМЕР ИДЕАЛЬНЫХ СТРОК (история самурая, ${langName}):
Сцена 1: "Ты не выбирал эту жизнь. Япония, 1186 год. Меч в руке раньше чем слова."
Сцена 2: "Семь лет. Деревянный меч. На ладонях кровь — отец смотрит молча. Плакать? Не здесь."
Сцена 3: "Первый труп ты увидел в восемь. Это был твой учитель. Никто не объяснял."
Сцена 4: "Боль? Забудь это слово. Страх? Не твоя роскошь. Ты — оружие. И всё."
Сцена 5: "Первый бой. Руки не дрожали. Это напугало тебя больше чем враг."
Сцена 6: "Брат упал рядом. Ты не остановился. Это был приказ. Ты слышишь это до сих пор."
Сцена 7: "Хозяин мёртв. Ты можешь уйти. Или остаться умереть за того кого уже нет."
Сцена 8: "Ты остался. Не из страха. Потому что некоторые вещи важнее жизни. Ты это знал всегда."

СТРУКТУРА (каждая строка):
1 — вызов + место + год
2 — первая физическая боль детства
3 — первая смерть которую ты видел
4 — момент когда понял кто ты
5 — первый настоящий бой
6 — потеря близкого человека
7 — выбор между честью и жизнью
8 — финальная фраза-удар (соединяет ту эпоху с сегодняшним зрителем)

════════════════════════════════════════════════
ПРАВИЛА ДЛЯ КАЖДОЙ СТРОКИ (line):
════════════════════════════════════════════════
- Язык: СТРОГО ${langName}
- Длина: 12-18 слов
- Говори "ты" — зритель = герой
- Один конкретный образ — НО ВСЕГДА внутренний, эмоциональный (взгляд / тишина / тяжесть / холод внутри)
- Короткие рубленые фразы через точку или тире
- Заканчивай незакрытой мыслью (кроме сцены 8 — та бьёт как удар)
- ЗАПРЕЩЕНО: кровь / кишки / хруст / физиология / "великий" / "судьба" / абстракции без образа
- ЗАПРЕЩЕНО: описывать что происходит с телом — ТОЛЬКО что происходит внутри человека

Выведи JSON:
{
  "title": "поэтичное название на ${langName}",
  "characterProfile": {
    "faceShape": "oval",
    "nose": "straight narrow nose",
    "lips": "thin firm lips",
    "ears": "medium close-set ears",
    "eyes": "dark brown almond-shaped eyes",
    "hair": "black straight thick hair",
    "skinTone": "warm olive complexion",
    "distinguishingFeature": "small scar on left cheek"
  },
  "scenes": [
    {
      "id": 1,
      "stage": "ВЫЗОВ",
      "line": "реальный нарратив на ${langName} — 12-18 слов, образ + вызов + незакрытая мысль",
      "imagePrompt": "Cinematic historical scene, photorealistic: [конкретное описание сцены на English — возраст персонажа, действие, деталь из characterProfile]. Style: epic historical drama, Ridley Scott aesthetic, 35mm film grain, anamorphic lens. Lighting: warm amber torchlight. Composition: rule of thirds, extreme close-up, 70% shadow 30% light. Atmosphere: dust particles floating in air. Subject details: weathered skin, dirt, period-accurate costume, dark brown almond-shaped eyes, small scar on left cheek. Color grade: desaturated + warm amber. Quality: ultra-detailed, 8K, RAW, photorealistic, anamorphic lens flare, vertical 9:16.",
      "videoPrompt": "8-second cinematic historical video clip, vertical 9:16. SCENE: [action description]. EPOCH: [era]. LOCATION: [place]. OPENING: extreme close-up of eye then slow reveal. CAMERA: Slow cinematic push-in toward face. LIGHTING: warm amber torchlight, golden particles. ATMOSPHERE: floating dust, fabric moving in wind, breath visible. SOUND: seconds 1-4 fire crackle distant horses, seconds 7-8 sound cuts to silence. LAST FRAME: subject looks toward something off-screen. QUALITY: 8K photorealistic, anamorphic lens, no modern elements, period-accurate only."
    }
  ]
}

ВАЖНО: в JSON выведи ВСЕ 8 сцен с реальным нарративом в поле "line". Не описание — а сам текст.`;

        const raw = await callPollinations([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ], true);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const scriptData = JSON.parse(jsonText);

            // Save script to project folder if provided
            if (projectFolder) {
                const scriptPath = path.join(STORY_DIRS.base, projectFolder, 'script.json');
                fs.writeFileSync(scriptPath, JSON.stringify(scriptData, null, 2));
                console.log(`[Stories] Saved script.json to: ${scriptPath}`);
            }

            return scriptData;
        } catch(e) {
            throw new Error("Failed to generate story script from AI.");
        }
    });

    // 3. Generate Image
    ipcMain.handle('story-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder }) => {
        try {
            const prompt = imagePrompt;
            const model = imageModel || 'imagen4';

            // Clean up model name if needed
            const cleanModel = model.replace('freepik-', '');

            // Use project subfolder if provided
            const sectionDir = projectFolder
                ? path.join(STORY_DIRS.base, projectFolder)
                : STORY_DIRS.images;

            console.log(`[Stories] Generate image via G-Labs: scene=${sceneIndex} model=${cleanModel} folder=${projectFolder || 'default'} prompt="${prompt.substring(0, 80)}..."`);

            const savedPaths = await generateImageViaGLabs({
                prompt,
                model: cleanModel,
                aspectRatio: '9:16',
                count: 1,
                sectionDir,
                subFolder: 'Images',
                sceneIndex,
                onProgress: (p) => {
                    event.sender.send('story-image-progress', { sceneIndex, status: p.status, attempt: p.attempt });
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
            console.error(`[Stories] Image generation failed for scene ${sceneIndex}:`, error);
            throw error;
        }
    });

    // 4. Generate Audio (voiceover for a single scene)
    ipcMain.handle('story-generate-audio', async (event, { sceneIndex, text, language, projectFolder }) => {
        console.log(`[Stories] storyGenerateVoice: scene=${sceneIndex} lang=${language} folder=${projectFolder || 'default'} text="${text.substring(0, 60)}..."`);
        try {
            const customDir = projectFolder ? path.join(STORY_DIRS.base, projectFolder, 'Audio') : STORY_DIRS.audio;
            const filePath = await storyGenerateVoice(text, language, customDir, sceneIndex);
            
            // Return as base64 data URL to bypass protocol issues on Windows
            const audioBuffer = fs.readFileSync(filePath);
            return `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
        } catch (e) {
            console.error(`[Stories] Audio generation failed for scene ${sceneIndex}:`, e.message);
            throw e;
        }
    });

    // 5. Generate Video with cinematic prompts
    ipcMain.handle('story-generate-video', async (event, { sceneIndex, videoPrompt, sourceImageUrl, narrationLine, projectFolder }) => {
        console.log(`[Stories] Generate video: scene=${sceneIndex} folder=${projectFolder || 'default'} hasSourceImage=${!!sourceImageUrl}`);

        // Build enhanced prompt — cinematic visual direction only, no audio instructions
        const enhancedPrompt = videoPrompt;

        // Convert media:// URL to real file path (same pattern as skeleton-handlers)
        const imagePath = sourceImageUrl ? sourceImageUrl.replace('media:///', '').split('?')[0] : null;

        // Build reference images array from the generated scene image
        let referenceImages = [];
        if (imagePath && fs.existsSync(imagePath)) {
            const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
            const imageBase64 = fs.readFileSync(imagePath).toString('base64');
            referenceImages.push({ data: `data:image/${ext};base64,${imageBase64}` });
            console.log(`[Stories] Using reference image: ${imagePath}`);
        } else {
            console.log(`[Stories] No reference image found, using text-to-video mode`);
        }

        // Use project subfolder if provided
        const sectionDir = projectFolder
            ? path.join(STORY_DIRS.base, projectFolder)
            : STORY_DIRS.videos;

        const options = {
            prompt: enhancedPrompt,
            model: 'veo_31_fast',
            aspectRatio: '9:16',
            sectionDir,
            subFolder: 'Videos',
            sceneIndex,
            mode: referenceImages.length > 0 ? 'start_image' : 'text_to_video',
            referenceImages: referenceImages,
            onProgress: (p) => {
                event.sender.send('story-video-progress', { sceneIndex, status: p.status, attempt: p.attempt });
            }
        };

        const savedPath = await generateVideoViaGLabs(options);

        // Re-encode for browser preview (H.264/AAC + faststart)
        console.log(`[Stories] Re-encoding video for preview: ${savedPath}`);
        const previewPath = await reencodeForPreview(savedPath, sceneIndex, projectFolder);

        // Return media:// URL like skeleton-handlers does
        return `media:///${previewPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    console.log('[Stories] Life Journey Handlers registered ✅');
    ipcMain.handle('story-assemble', async (event, data) => {
        const { projectFolder } = data;
        try {
            if (!projectFolder) throw new Error("No projectFolder provided for assembly");

            const folderPath = path.join(STORY_DIRS.base, projectFolder);
            const videosDir  = path.join(folderPath, 'Videos');
            const audioDir   = path.join(folderPath, 'Audio');

            if (!fs.existsSync(videosDir)) throw new Error(`Videos directory not found: ${videosDir}`);

            const scriptPath = path.join(folderPath, 'script.json');
            if (!fs.existsSync(scriptPath)) throw new Error("script.json missing — cannot assemble");

            const scriptData  = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
            const scenes      = scriptData.scenes || [];
            const scenesCount = scenes.length;
            if (scenesCount === 0) throw new Error("No scenes found in script.json");

            const finalDir = path.join(folderPath, 'FinalOutput');
            if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

            // Locate ffmpeg binary
            const FFMPEG_PATH = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
            const ffmpegBin   = fs.existsSync(FFMPEG_PATH) ? FFMPEG_PATH : 'ffmpeg';

            console.log(`[Stories] Assembling ${scenesCount} scenes in: ${folderPath}`);

            const muxedFiles = [];

            // ── Step 1: Mux audio + video for every scene ─────────────────────
            for (let i = 0; i < scenesCount; i++) {
                const sceneNum = i + 1;

                // Find preview video (scene_N_preview.mp4)
                const videoFiles = fs.existsSync(videosDir)
                    ? fs.readdirSync(videosDir).filter(f => f.startsWith(`scene_${sceneNum}_preview`))
                    : [];
                if (videoFiles.length === 0) throw new Error(`Missing video for scene ${sceneNum}`);
                const videoPath = path.join(videosDir, videoFiles[0]);

                // Find audio: prefer scene_N.mp3, fallback to voice_HASH.mp3 (computed from scene line)
                let audioPath = null;
                const directAudio = path.join(audioDir, `scene_${sceneNum}.mp3`);
                if (fs.existsSync(directAudio)) {
                    audioPath = directAudio;
                } else if (scenes[i]?.line && fs.existsSync(audioDir)) {
                    const hash      = crypto.createHash('md5').update(scenes[i].line).digest('hex').substring(0, 12);
                    const hashAudio = path.join(audioDir, `voice_${hash}.mp3`);
                    if (fs.existsSync(hashAudio)) audioPath = hashAudio;
                }

                const muxedPath = path.join(finalDir, `muxed_scene_${sceneNum}.mp4`);

                await new Promise((resolve, reject) => {
                    const args = ['-y', '-i', videoPath];
                    if (audioPath) {
                        args.push('-i', audioPath);
                        args.push('-map', '0:v:0', '-map', '1:a:0');
                        args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest');
                        console.log(`[Stories] Muxing scene ${sceneNum}: video + audio`);
                    } else {
                        args.push('-c:v', 'copy', '-an');
                        console.warn(`[Stories] Scene ${sceneNum}: no audio found, video only`);
                    }
                    args.push('-movflags', '+faststart', muxedPath);

                    const proc = spawn(ffmpegBin, args);
                    proc.stderr.on('data', d => {
                        const line = d.toString().split('\n').find(l => l.includes('time=') || l.includes('Error')) || '';
                        if (line.trim()) console.log(`[ffmpeg mux sc${sceneNum}] ${line.trim()}`);
                    });
                    proc.on('close', code => {
                        if (code === 0) { muxedFiles.push(muxedPath); resolve(); }
                        else reject(new Error(`ffmpeg mux failed for scene ${sceneNum} (exit ${code})`));
                    });
                    proc.on('error', reject);
                });

                event.sender.send('story-video-progress', {
                    sceneIndex: i,
                    status: `Muxed scene ${sceneNum}/${scenesCount}`
                });
            }

            // ── Step 2: Concat all muxed scenes ───────────────────────────────
            const concatListPath = path.join(finalDir, 'concat_list.txt');
            fs.writeFileSync(
                concatListPath,
                muxedFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n')
            );

            const finalOutputPath = path.join(finalDir, 'Final_Story.mp4');

            await new Promise((resolve, reject) => {
                const args = [
                    '-y',
                    '-f', 'concat', '-safe', '0',
                    '-i', concatListPath,
                    // High quality re-encode for final output (near-lossless)
                    '-c:v', 'libx264', '-crf', '15', '-preset', 'slow',
                    '-c:a', 'aac', '-b:a', '256k',
                    '-pix_fmt', 'yuv420p',
                    '-movflags', '+faststart',
                    finalOutputPath
                ];

                const proc = spawn(ffmpegBin, args);
                proc.stderr.on('data', d => {
                    const line = d.toString().split('\n').find(l => l.includes('time=') || l.includes('Error')) || '';
                    if (line.trim()) {
                        console.log(`[ffmpeg concat] ${line.trim()}`);
                        event.sender.send('story-video-progress', { sceneIndex: -1, status: line.trim() });
                    }
                });
                proc.on('close', code => {
                    if (code === 0) resolve();
                    else reject(new Error(`ffmpeg concat failed (exit ${code})`));
                });
                proc.on('error', reject);
            });

            // ── Cleanup temp muxed files ───────────────────────────────────────
            muxedFiles.forEach(f => { try { fs.unlinkSync(f); } catch(e) {} });
            try { fs.unlinkSync(concatListPath); } catch(e) {}

            const stat = fs.statSync(finalOutputPath);
            console.log(`[Stories] ✅ Final Story assembled: ${finalOutputPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);

            return `media:///${finalOutputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

        } catch (error) {
            console.error("[Stories] Assembly Error:", error);
            throw error;
        }
    });

    console.log('[Stories] Life Journey Handlers registered ✅');
}

module.exports = { registerStoryHandlers };
