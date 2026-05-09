# 📚 CODEBASE DOCUMENTATION — AI Studio App
> Справочник для быстрой работы с кодом без необходимости перечитывать все файлы.
> Обновлён: 09.05.2026

---

## 🗂️ СТРУКТУРА ПРОЕКТА

```
d:/Open_Project/kimi/
├── electron.cjs              # Главный процесс Electron (точка входа)
├── preload.js                # Bridge: IPC-мост между main и renderer
├── story-handlers.cjs        # [AI Stories] IPC-обработчики для раздела историй
├── skeleton-handlers.cjs     # [Skeleton] IPC-обработчики + VoiceAPI + изображения/видео
├── glabs-handlers.cjs        # [G-Labs] API для генерации изображений и видео
├── timelapse-handlers.cjs    # [Timelapse] IPC-обработчики таймлапсов
├── export-handlers.cjs       # Экспорт и сборка видео через ffmpeg
├── glabs-handlers.cjs        # G-Labs AI: imagen4, nano_banana_2/pro
├── queue-manager.cjs         # Очередь задач генерации
├── src/
│   ├── App.tsx               # Корневой компонент, роутинг вкладок
│   ├── StoryTab.tsx          # [UI] Раздел AI Stories
│   ├── SkeletonTab.tsx       # [UI] Раздел Skeleton Viral Shorts
│   ├── StudioTab.tsx         # [UI] Раздел HealthTalk / ObjectWars Studio
│   ├── TimelapseTab.tsx      # [UI] Раздел AI Timelapse Creator
│   ├── GLabsTab.tsx          # [UI] Раздел G-Labs прямой доступ
│   └── electron.d.ts         # TypeScript типы для window.electronAPI
├── Stories/                  # Выходные файлы AI Stories
│   ├── Story_HHMMSS_DDMMYYYY/
│   │   ├── Images/           # Сгенерированные изображения
│   │   ├── Videos/           # Сгенерированные видео
│   │   ├── Audio/            # Синтезированная озвучка (voice_HASH.mp3)
│   │   ├── FinalOutput/      # Финальная сборка
│   │   └── script.json       # JSON сценарий со сценами
│   ├── Audio/                # Глобальный аудио-каш
│   ├── Images/
│   └── Videos/
├── SkeletonShorts/           # Выходные файлы Skeleton
│   └── Task_HHMMSS_DDMMYYYY/
│       ├── Images/
│       ├── Videos/
│       └── preview/
├── CinematicTimelapse/       # Выходные файлы Timelapse
└── .env                      # Ключи API (не в git)
```

---

## 🔑 ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ (.env)

| Переменная | Описание | Используется в |
|---|---|---|
| `VOICEAPI_KEY` | ⚠️ API ключ VoiseAPI (csv666.ru) — **точное имя в .env** | story-handlers (`storyGenerateVoice`) |
| `STORY_VOICE_ID` | ElevenLabs voice ID для Stories | story-handlers (storyGenerateVoice) |
| `VOISE_API_BASE` | Базовый URL VoiseAPI (default: https://voiceapi.csv666.ru) | skeleton-handlers |
| `GLABS_API_KEY` | Ключ G-Labs API для изображений/видео | glabs-handlers |
| `GLABS_WEBHOOK_URL` | URL вебхука G-Labs (default: http://127.0.0.1:8765) | glabs-handlers |
| `FREEPIK_API_KEY` | Ключ Freepik (для WAN видео) | skeleton-handlers |
| `POLLINATIONS_API_KEY` | Ключ Pollinations для генерации текста | skeleton-handlers |
| `CUSTOM_AI_API_KEY` | Ключ локального AI (http://127.0.0.1:8045) | skeleton-handlers |
| `CUSTOM_AI_URL` | URL локального AI сервера | skeleton-handlers |
| `QWEN_API_KEY` | Ключ Qwen/NVIDIA для генерации текста | skeleton-handlers |
| `KIMI_API_KEY` | Ключ Kimi/NVIDIA | skeleton-handlers |
| `MIMO_API_KEY` | Ключ MiMo | skeleton-handlers |
| `DEFAULT_AI_PROVIDER` | Провайдер текста: `custom`/`qwen`/`kimi`/`mimo` | skeleton-handlers |

---

## 📡 IPC API — ПОЛНАЯ КАРТА КАНАЛОВ

### window.electronAPI (preload.js → renderer)

#### AI Stories
```typescript
storyCreateFolder()                          // → string (folderName)
storyGenerateIdeas(topic, language)          // → Idea[]
storyGenerateScript({ idea, language, projectFolder }) // → Script (title + scenes[])
storyGenerateImage({ sceneIndex, imagePrompt, imageModel, projectFolder }) // → string (media:// URL)
storyGenerateAudio({ sceneIndex, text, language, projectFolder })          // → string (file path)
storyGenerateVideo({ sceneIndex, videoPrompt, sourceImageUrl, narrationLine, projectFolder }) // → string (media:// URL)
storyAssemble({ projectFolder, language })   // → string (media:// URL финального видео)

// Events (listeners)
onStoryImageProgress(callback)   // { sceneIndex, status, attempt }
onStoryVideoProgress(callback)   // { sceneIndex, status, attempt }
```

#### Skeleton Shorts
```typescript
skeletonGenerateIdeas(language)              // → string (raw text с идеями)
skeletonGenerateScript(ideaTitle, language, videoModel) // → { script, scenes[] }
skeletonGenerateImage({ sceneIndex, imagePrompt, imageModel, projectFolder }) // → string (media:// URL)
skeletonGenerateVideo({ sceneIndex, videoPrompt, ltxVideoPrompt, scriptLine, fullScript, language, videoModel, projectFolder }) // → string (media:// URL)
skeletonAssembleVideo({ useKaraoke, ideaTitle, language }) // → string (media:// URL)

onSkeletonVideoProgress(callback)  // { sceneIndex, state, attempt, maxAttempts }
```

#### Studio (HealthTalk / ObjectWars)
```typescript
studioGenerateIdeas(mode, lang)              // → { original, translation }[]
studioGenerateScript(mode, topic, lang)      // → StudioScript { intro, scenes[] }
studioAssembleVideo({ useKaraoke, ideaTitle, language }) // → string (media:// URL)
```

#### Timelapse
```typescript
timelapseGetEnvironments()                   // → string[] (10 сред)
timelapseGeneratePrompts(envIndex, envName)  // → CinematicPromptData
timelapseGenerateImage(imgIndex, prompt, model, timelapseID) // → string (media:// URL)
timelapseGenerateVideo(videoIndex, prompt, timelapseID)      // → string (media:// URL)
timelapseAssemble(timelapseID)               // → string (media:// URL)
```

#### Общие
```typescript
saveTextFiles(files[])                       // → { success, error? }
```

---

## 🎬 РАЗДЕЛ: AI STORIES (Life Journey)

### Файлы
- **Frontend:** `src/StoryTab.tsx`
- **Backend:** `story-handlers.cjs`

### Концепция
8-сценная история жизни в историческую эпоху, рассказанная от второго лица ("ты"). Каждая сцена = 8 секунд, итого 64 секунды видео. Полный pipeline: идеи → сценарий → изображение → видео → озвучка.

### State машина (Frontend)
```typescript
// Ключевые состояния:
language: string              // 'English' | 'Russian' | 'French' | 'German' | 'Spanish'
imageModel: 'imagen4' | 'nano_banana_2' | 'nano_banana_pro'
topic: string                 // Тема/эпоха (опционально)
ideas: Idea[]                 // Результат step 1
selectedIdea: Idea | null     // Выбранная идея
script: Script | null         // Результат step 2 (title + scenes[8])
sceneStates: Record<number, SceneState>  // Per-scene: imgUrl, vidUrl, audioUrl, loading...
projectFolder: string         // 'Story_HHMMSS_DDMMYYYY'
```

### Workflow (пошагово)
```
1. handleGenerateIdeas()
   → window.electronAPI.storyGenerateIdeas(topic, language)
   → [backend] callPollinations([system, user], true)
   → JSON { ideas: [{title, hook, era, character}] }
   → setIdeas(result)

2. handleSelectIdea(idea)
   → storyCreateFolder()           // создаёт Stories/Story_HHMMSS/
   → storyGenerateScript({idea, language, projectFolder})
   → [backend] callPollinations → JSON {title, characterProfile, scenes[8]}
   → Сохраняет в Stories/Story_HHMMSS/script.json
   → setScript(result)

3. handleGenerateImage(sceneId, prompt)
   → storyGenerateImage({sceneIndex, imagePrompt, imageModel, projectFolder})
   → [backend] generateImageViaGLabs → сохраняет в Stories/Story.../Images/
   → Возвращает media:///path?t=timestamp

4. handleGenerateAudio(sceneId, text)
   → storyGenerateAudio({sceneIndex, text, language, projectFolder})
   → [backend] storyGenerateVoice(text, language, outputDir)
   → POST voiceapi.csv666.ru/tasks → task_id
   → Polling GET /tasks/{id} каждые 3 секунды
   → Скачивает binary MP3 → сохраняет voice_HASH.mp3
   → Возвращает абсолютный путь к файлу

5. handleGenerateVideo(sceneId, prompt)
   → storyGenerateVideo({sceneIndex, videoPrompt, sourceImageUrl, projectFolder})
   → [backend] generateVideoViaGLabs (model: veo_31_fast, режим I2V)
   → reencodeForPreview (ffmpeg H.264)
   → Возвращает media:///path?t=timestamp
```

### Ключевые промпты (story-handlers.cjs)

#### System prompt для идей:
- Генерация в РУССКОМ языке (идеи всегда на русском)
- Хук: прямое обращение "Ты — ..." с WHO + WHERE/WHEN + foreshadowing
- Исторические эпохи: Рим, Викинги, Средневековье, Самураи, Ренессанс и др.

#### User prompt для идей:
```
Topic context: {topic || 'Random epic era'}
Generate 5 ideas.
Output JSON: { "ideas": [{title, hook, era, character}] }
```

#### System prompt для сценария:
- Язык нарратива: `${langName}` (выбранный пользователем)
- 8 сцен × 8 секунд = 64 сек
- 18-22 слова на сцену
- characterProfile: постоянные черты лица (faceShape, nose, lips, ears, eyes, hair, skinTone, distinguishingFeature)
- imagePrompt: возраст + черты + физическое описание + style suffix
- videoPrompt: aggressive camera + micro-expressions + diegetic sound

#### Output JSON сценария:
```json
{
  "title": "...",
  "characterProfile": { "faceShape": "...", ... },
  "scenes": [
    {
      "id": 1, "stage": "THE HOOK — Birth",
      "line": "...",         // нарратив 18-22 слова
      "imagePrompt": "...",  // на английском
      "videoPrompt": "..."   // на английском
    }
  ]
}
```

### storyGenerateVoice — VoiseAPI Flow (КРИТИЧНО)
```javascript
// В story-handlers.cjs
async function storyGenerateVoice(text, language, outputDir)
// Алгоритм:
// 1. Проверяет VOICE_AI_KEY и STORY_VOICE_ID (или TEST_VOICE_ID) в .env
// 2. Имя файла: voice_{MD5(text)[0:12]}.mp3
// 3. Cache: если файл существует и НЕ HTML — возвращает сразу
// 4. Если файл HTML (старый баг) — удаляет и перегенерирует
// 5. POST {VOISE_BASE}/tasks с body:
//    { template: { model_id, voice_id, voice_settings }, text, task_type }
// 6. Polling GET {VOISE_BASE}/tasks/{taskId} каждые 3 сек (макс 60 попыток = 3 мин)
// 7. При получении audio_url → axios.get(url, {responseType: 'arraybuffer'})
//    ИЛИ base64 → Buffer.from(b64, 'base64')
// 8. Сохраняет Buffer в outputDir/voice_HASH.mp3

// Env vars required:
// VOICE_AI_KEY=...
// STORY_VOICE_ID=... (или TEST_VOICE_ID=...)
// VOISE_API_BASE=https://voiceapi.csv666.ru (default)
```

### Структура scene (Script)
```typescript
type Scene = {
  id: number;           // 1-8
  stage?: string;       // "THE HOOK — Birth"
  line: string;         // нарратив для озвучки
  imagePrompt: string;  // промпт для изображения
  videoPrompt: string;  // промпт для видео
};
```

### Жизненные этапы (LIFE_STAGE_ICONS)
```
Scene 1: 👶 Baby/newborn
Scene 2: 🧒 Child (6-8 лет)
Scene 3: 🧑 Youth/Teen (14-16)
Scene 4: 💪 Young Adult (20-25)
Scene 5: ⚔️ Prime (30-35)
Scene 6: 🏛️ Maturity (45-50)
Scene 7: 🧙 Elder (65-70)
Scene 8: 👑 Legacy (80+)
```

### Директории (story-handlers.cjs)
```javascript
STORY_DIRS = {
  base:   'Stories/',
  audio:  'Stories/Audio/',
  images: 'Stories/Images/',
  videos: 'Stories/Videos/',
}
// Проект: Stories/Story_HHMMSS_DDMMYYYY/Images|Videos|Audio|FinalOutput
```

### imageModel — доступные модели
| Value | Описание |
|---|---|
| `imagen4` | Google Imagen 4, высокое качество |
| `nano_banana_2` | Улучшенная генерация |
| `nano_banana_pro` | 4K, Thinking model |
> ⚠️ `nano_banana` (v1) удалён

---

## 💀 РАЗДЕЛ: SKELETON VIRAL SHORTS

### Файлы
- **Frontend:** `src/SkeletonTab.tsx`
- **Backend:** `skeleton-handlers.cjs`

### Концепция
Генерация коротких вирусных видео (Shorts/Reels) с персонажем-скелетом. 5 AI-идей → выбор → сценарий + N сцен → изображения → видео → сборка.

### State машина (Frontend)
```typescript
language: Language    // 'en' | 'fr' | 'de' | 'es' | 'it'
imageModel: 'imagen4' | 'nano_banana_2' | 'nano_banana_pro'
videoModel: 'veo_31_fast' | 'freepik-wan' | 'pollinations-ltx2' | 'pixverse-v5' | 'grok-video'
parsedIdeas: { num, title, desc, ru? }[]
selectedIdea: string
script: string          // текстовый сценарий
scenes: SkeletonScene[] // массив сцен
sceneStates: SceneState[]  // per-scene imageUrl, videoUrl, loading...
projectFolder: string   // 'Task_HHMMSS_DDMMYYYY'
```

### Workflow
```
1. handleGenerateIdeas()
   → skeletonGenerateIdeas(language)
   → [backend] Grok/Pollinations → 5 идей в формате:
     "1. Title | Русский перевод | Описание"
   → parseIdeas() → parsedIdeas[]

2. handleIdeaClick(title) / handleGenerateScriptFor(title)
   → skeletonGenerateScript(ideaTitle, language, videoModel)
   → [backend] → { script: string, scenes: SkeletonScene[] }
   → Создаёт папку Task_HHMMSS/

3. handleGenerateImage(i)
   → skeletonGenerateImage({sceneIndex, imagePrompt, imageModel, projectFolder})
   → [backend] generateImageViaGLabs
   → Сохраняет в SkeletonShorts/Task_HHMMSS/Images/

4. handleGenerateVideo(i)
   → skeletonGenerateVideo({sceneIndex, videoPrompt, ltxVideoPrompt, ...})
   → [backend] В зависимости от videoModel:
     - veo_31_fast: Google Veo через G-Labs
     - freepik-wan: Freepik WAN v2.6
     - pollinations-ltx2: LTX-2 text-to-video (без изображения)
     - pixverse-v5: Pixverse
     - grok-video: xAI Grok video

5. handleAssemble()
   → skeletonAssembleVideo({ useKaraoke, ideaTitle, language })
   → [backend] ffmpeg: конкатенация видео + добавление аудио
```

### Тип SkeletonScene
```typescript
type SkeletonScene = {
  scene: number;
  checkpoint: string;    // "Opening Hook"
  environment: string;   // "Haunted Mansion"
  script_line: string;   // текст озвучки
  image_prompt: string;  // для изображения
  video_prompt: string;  // для видео (WAN/Veo)
  ltx_video_prompt?: string;  // оптимизированный для LTX-2
};
```

### LTX-2 режим (pollinations-ltx2)
- Не требует изображения
- Использует `ltx_video_prompt` (специально оптимизированный)
- В UI скрывается кнопка "🖼️ Картинка" для каждой сцены
- `allImagesReady` = true автоматически в LTX-2 режиме

### Парсинг идей (parseIdeas)
```javascript
// Формат ответа AI:
"1. Title | Russian Translation | Description"
// Парсер извлекает: { num, title, ru, desc }
```

### Директории
```javascript
// SkeletonShorts/Task_HHMMSS_DDMMYYYY/Images|Videos
// preview/ — перекодированные файлы для браузера
```

---

## 🏥 РАЗДЕЛ: STUDIO (HealthTalk / ObjectWars)

### Файлы
- **Frontend:** `src/StudioTab.tsx`
- **Backend:** `skeleton-handlers.cjs` (переиспользует handleры skeleton)

### Концепция
Два режима (`mode: 'health' | 'objects'`):
- **HealthTalk** — медицинские short-видео с персонажем-врачом
- **ObjectWars** — драматические истории с говорящими объектами

### State машина (Frontend)
```typescript
mode: 'health' | 'objects'  // передаётся как prop
topic: string
lang: string                 // Russian | English | Polish | German | French | Spanish
imageModel: string           // default 'freepik-mystic'
videoModel: string           // default 'veo_31_fast'
script: StudioScript | null
projectFolder: string        // 'Studio_HHMMSS_DDMMYYYY'
```

### Workflow
```
1. fetchViralIdeas()
   → studioGenerateIdeas(mode, lang)
   → [{original, translation}]  // оригинал + перевод на русский

2. generateScript()
   → studioGenerateScript(mode, topic, lang)
   → StudioScript { intro, scenes[] }
   → projectFolder = 'Studio_HHMMSS'

3. generateImage(sceneId)
   → skeletonGenerateImage({..., imageModel: 'STRICT VERTICAL 9:16 PORTRAIT...'})
   → Добавляет Disney Pixar стиль к промпту

4. animateScene(sceneId)
   → skeletonGenerateVideo({sceneIndex, videoPrompt, scriptLine, language, videoModel})

5. handleAssemble()
   → studioAssembleVideo({ useKaraoke, ideaTitle, language })
```

### IMAGE_MODELS (StudioTab)
```javascript
{ value: 'imagen4', label: 'Imagen 4', desc: 'Google High Quality (Safe/Detailed)' },
{ value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Improved Versatility' },
{ value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'Professional High Output' },
```

### Тип StudioScript / StudioScene
```typescript
// Из electron.d.ts:
type StudioScript = {
  intro: string;
  scenes: StudioScene[];
};
type StudioScene = {
  id: number;
  line: string;
  imagePrompt: string;
  videoPrompt: string;
  status: 'idle' | 'generating_images' | 'generating_video' | 'ready';
  selectedImage?: string;
  generatedImages?: string[];
  generatedVideoUrl?: string;
  audio_url?: string;
};
```

### Промпт для изображения (особенность Studio)
```javascript
`STRICT VERTICAL 9:16 PORTRAIT. ${scene.imagePrompt}. 3D Disney Pixar style. 
ABSOLUTE RULES: NO MUSIC. STERNLY FOLLOW text for lip-sync. NO independent translations.`
```

---

## 🎥 РАЗДЕЛ: AI TIMELAPSE CREATOR

### Файлы
- **Frontend:** `src/TimelapseTab.tsx`
- **Backend:** `timelapse-handlers.cjs`

### Концепция
Кинематографический таймлапс трансформации среды. 3 состояния: IDLE → SELECTION → EXECUTION.

### State машина (Frontend)
```typescript
pipelineState: 'IDLE' | 'SELECTION' | 'EXECUTION'
selectedImageModel: string  // default 'imagen4'
environments: string[]      // 10 сред от AI
promptData: CinematicPromptData | null
generatedImages: (string|null)[]  // [4 изображения]
generatedVideos: (string|null)[]  // [3 видео]
timelapseID: string         // 'Timelapse_HHMMSS_DDMMYYYY'
```

### Workflow
```
STATE 1: IDLE
  Пользователь вводит "start" → handleStart()
  → timelapseGetEnvironments()
  → [backend] AI генерирует 10 уникальных сред
  → перейти в SELECTION

STATE 2: SELECTION
  Пользователь кликает среду → handleSelectEnvironment(idx)
  → timelapseGeneratePrompts(index+1, environments[index])
  → CinematicPromptData { contextConfirmation, images[4], videos[3] }
  → timelapseID = 'Timelapse_...'
  → перейти в EXECUTION

STATE 3: EXECUTION
  generateImage(i) → timelapseGenerateImage(i, prompt, model, timelapseID)
  generateVideo(i) → timelapseGenerateVideo(i, prompt, timelapseID)
    [Видео требует сначала соответствующее изображение]
  assembleFinal() → timelapseAssemble(timelapseID)
```

### IMAGE_MODELS (TimelapseTab)
```javascript
{ value: 'imagen4', label: 'Imagen 4', desc: 'Google High Quality' },
{ value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Versatile' },
{ value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'Pro Output' },
```

### Тип CinematicPromptData
```typescript
type CinematicPromptData = {
  contextConfirmation: string;  // Описание выбранной среды
  images: { id, title, prompt, platform }[];  // 4 изображения
  videos: { id, title, prompt, platform }[];  // 3 видео-перехода
};
```

### Зависимости Video от Image
```
Image[0] → Video[0] (переход 1→2)
Image[1] → Video[1] (переход 2→3)
Image[2] → Video[2] (переход 3→4)
Image[3] → (только финальный кадр)
```

---

## 🤖 BACKEND: skeleton-handlers.cjs

### Экспортируемые функции
```javascript
const { callPollinations, synthesizeUnifiedSpeech } = require('./skeleton-handlers.cjs');
```

### callPollinations(messages, jsonMode)
- Вызывает AI (Grok/Pollinations) для генерации текста
- `messages`: массив `{role, content}`
- `jsonMode`: true = ожидаем JSON ответ
- Используется во всех handlers для генерации промптов и сценариев

### synthesizeUnifiedSpeech(text, language, voiceId, model, customDir)
- ⚠️ **УСТАРЕВШИЙ** для Stories — используйте `storyGenerateVoice` в story-handlers.cjs
- Синтез речи через VoiseAPI
- `customDir`: папка для сохранения (по умолчанию Stories/Audio)
- Файл: `voice_{hash}.mp3`

### synthesizeCsv666Speech(text, voiceId, outputPath)
- Внутренняя функция VoiseAPI async flow
- VOISE_BASE: `process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru'`
- Алгоритм: POST /tasks → polling GET /tasks/{id} → скачивание binary

### IPC обработчики (skeleton)
```javascript
ipcMain.handle('skeleton-generate-image', ...)  // generateImageViaGLabs
ipcMain.handle('skeleton-generate-video', ...)  // generateVideoViaGLabs по модели
ipcMain.handle('skeleton-generate-ideas', ...)  // callPollinations → 5 идей
ipcMain.handle('skeleton-generate-script', ...) // callPollinations → scenes[]
ipcMain.handle('skeleton-assemble-video', ...)  // ffmpeg сборка
```

---

## 🖼️ BACKEND: glabs-handlers.cjs

### Функции
```javascript
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
```

### generateImageViaGLabs({ prompt, model, aspectRatio, count, sectionDir, subFolder, sceneIndex, onProgress })
- Генерация изображений через G-Labs API
- `model`: `'imagen4'` | `'nano_banana_2'` | `'nano_banana_pro'`
- `aspectRatio`: `'9:16'` для вертикальных
- `sectionDir`: папка проекта (например `Stories/Story_.../`)
- `subFolder`: `'Images'`
- Возвращает `string[]` — массив абсолютных путей к файлам

### generateVideoViaGLabs({ prompt, model, aspectRatio, sectionDir, subFolder, sceneIndex, mode, referenceImages, onProgress })
- Генерация видео через G-Labs API
- `model`: `'veo_31_fast'` | etc.
- `mode`: `'start_image'` (I2V) | `'text_to_video'` (T2V)
- `referenceImages`: `[{ data: 'data:image/jpeg;base64,...' }]`
- Возвращает `string` — абсолютный путь к видеофайлу

---

## ⚡ VOISEAPI — ДЕТАЛИ ИНТЕГРАЦИИ

### Endpoint
```
Base: https://voiceapi.csv666.ru  (или VOISE_API_BASE в .env)
Auth: Authorization: Bearer {VOICE_AI_KEY}
```

### Flow (правильный)
```
1. POST /tasks
   Body: {
     template: {
       model_id: "eleven_multilingual_v2",
       voice_id: "{voiceId}",
       voice_settings: {
         stability: 0.85,
         similarity_boost: 0.75,
         use_speaker_boost: true,
         style: 0.0,
         speed: 1.0
       },
       voice_result_type: "default"
     },
     text: "...",
     task_type: "default"
   }
   Response: { task_id: N }

2. GET /tasks/{task_id}  (каждые 3 сек, до 60 раз)
   Response варианты:
   - { status: "processing" }  → ждём
   - { status: "completed", audio_url: "https://..." } → скачиваем
   - { audio_base64: "..." } → декодируем
   - { status: "failed" } → ошибка

3. GET audio_url (responseType: 'arraybuffer')
   → Buffer.from(response.data)
   → fs.writeFileSync(outputPath, buffer)
```

### Имя файла
```javascript
const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
const filename = `voice_${hash}.mp3`;
// Пример: voice_b1cbe8610c51.mp3
```

### Переменные окружения
```
VOICEAPI_KEY=...           # Bearer токен (⚠️ именно VOICEAPI_KEY, не VOICE_AI_KEY!)
STORY_VOICE_ID=...         # voice_id для Stories (из .env)
VOISE_API_BASE=...         # если нестандартный URL (опционально)
```

---

## 🔧 ELECTRON MAIN PROCESS (electron.cjs)

### Протокол media://
- Electron регистрирует протокол `media://`
- Преобразует `media:///D:/path/to/file.mp4` → реальный файл
- Используется для отображения медиа в renderer без CORS

### Регистрация handlers
```javascript
// В electron.cjs:
registerStoryHandlers(ipcMain);
registerSkeletonHandlers(ipcMain);
registerTimeLapseHandlers(ipcMain);
// + export handlers, G-Labs handlers, etc.
```

### ffmpeg
- Путь: `./ffmpeg/bin/ffmpeg.exe`
- Используется для: перекодирования превью (H.264/AAC), сборки финального видео
- В `reencodeForPreview()`:
  ```
  ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset fast
         -c:a aac -b:a 128k -pix_fmt yuv420p -movflags +faststart
         -y output_preview.mp4
  ```

---

## 📁 NAMING CONVENTIONS

### Папки проектов
```
Stories:    Story_HHMMSS_DDMMYYYY   (например Story_212720_05072026)
Skeleton:   Task_HHMMSS_DDMMYYYY    (например Task_114654_04192026)
Studio:     Studio_HHMMSS_DDMMYYYY
Timelapse:  Timelapse_HHMMSS_DDMMYYYY
```

### Медиа файлы
```
Images:  scene_N.jpg / image_N.png
Videos:  scene_N.mp4 / scene_N_preview.mp4
Audio:   voice_{MD5(text)[0:12]}.mp3
Final:   Final_Story.mp4 / final.mp4
```

---

## ⚠️ ИЗВЕСТНЫЕ БАГИ И ОГРАНИЧЕНИЯ

### Audio (ИСПРАВЛЕНО в story-handlers.cjs)
- **Баг:** `synthesizeUnifiedSpeech` сохранял HTML-страницу ошибки вместо MP3
- **Симптом:** Файлы `voice_*.mp3` = невоспроизводимый HTML
- **Решение:** `storyGenerateVoice()` в story-handlers.cjs с правильным async polling
- **Кэш-защита:** При загрузке проверяет первые 4 байта — если `<` → удаляет и перегенерирует

### Nano Banana v1
- Удалён из всех 4 UI файлов (StoryTab, SkeletonTab, StudioTab, TimelapseTab)
- `nano_banana_2` и `nano_banana_pro` оставлены

### story-assemble (TODO)
- Handler `story-assemble` является заглушкой
- Не реализует реальную сборку (mux audio+video для каждой сцены + concat)
- Нужна маппинг scene_index → voice_hash для сопоставления аудио с видео

---

## 🛠️ ТИПИЧНЫЕ ОПЕРАЦИИ (Быстрый справочник)

### Добавить новую модель изображения
1. `src/StoryTab.tsx` — добавить в массив `as const`
2. `src/SkeletonTab.tsx` — добавить в массив `as const` (строка ~285)
3. `src/StudioTab.tsx` — добавить в `IMAGE_MODELS` (строка ~47)
4. `src/TimelapseTab.tsx` — добавить в `IMAGE_MODELS` (строка ~54)
5. `skeleton-handlers.cjs` — убедиться что модель поддерживается в `skeletonGenerateImage`
6. TypeScript типы: обновить `useState<'imagen4' | ...>` в StoryTab и SkeletonTab

### Изменить voice settings (VoiseAPI)
В `story-handlers.cjs`, функция `storyGenerateVoice`:
```javascript
voice_settings: {
  stability: 0.85,       // 0-1, стабильность голоса
  similarity_boost: 0.75, // 0-1, схожесть с оригиналом
  use_speaker_boost: true,
  style: 0.0,            // 0-1, стиль
  speed: 1.0             // скорость речи
}
```

### Изменить AI модель для текста
В `skeleton-handlers.cjs`, функция `callPollinations`:
- Grok API: `process.env.GROK_API_KEY`
- Pollinations: бесплатный fallback

### Добавить новую вкладку
1. Создать `src/NewTab.tsx`
2. Создать `new-handlers.cjs`
3. Зарегистрировать в `electron.cjs`: `registerNewHandlers(ipcMain)`
4. Добавить IPC методы в `preload.js`
5. Добавить типы в `src/electron.d.ts`
6. Добавить роутинг в `src/App.tsx`

### Изменить промпт для сценария Stories
В `story-handlers.cjs`, handler `story-generate-script`:
- System prompt: строка ~170 (СТИЛЬ, STRUCTURE, TIMING, CHARACTER CONSISTENCY)
- User prompt: строка ~290 (задание, структура JSON)

### Изменить промпт для идей Stories
В `story-handlers.cjs`, handler `story-generate-ideas`:
- System prompt: строка ~55 (HOOK STYLE, ERA SETTINGS)
- User prompt: строка ~100

---

## 📦 ЗАВИСИМОСТИ (package.json)

### Ключевые
```json
"electron": "...",
"axios": "...",          // HTTP запросы к API
"express": "...",        // Если нужен локальный сервер
"ffmpeg": "bundle"       // в ./ffmpeg/bin/
```

### Dev
```json
"vite": "...",           // bundler для renderer
"typescript": "...",
"react": "..."
```

---

## 🔍 ПОИСК ПО КОДУ — ПОЛЕЗНЫЕ ПАТТЕРНЫ

```bash
# Найти все IPC каналы
grep -r "ipcMain.handle" . --include="*.cjs"

# Найти все вызовы electronAPI
grep -r "electronAPI\." src/ --include="*.tsx"

# Найти использование конкретного API
grep -r "VOISE_BASE\|voiceapi" . --include="*.cjs"

# Найти все generateImageViaGLabs вызовы
grep -r "generateImageViaGLabs" . --include="*.cjs"