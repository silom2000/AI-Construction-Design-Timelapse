# TikTok Video Localizer — Complete Implementation Record

> **Сессия:** 2025-06-25 (v1 — базовая), 2025-06-25 (v2 — диалоговая диаризация + сегменты)
> **Архитектура:** Electron + React/TypeScript + Node.js (CJS handlers)
> **Модели:** gemini-3.1-pro-high (анализ), omni_flash (видео-сегменты), scribe (STT), imagen4 (референсы)

---

## Цель раздела

Новая вкладка «🌍 Localize», которая получает видео с диалогом двух участников на вход:
1. Извлекает аудио и транскрибирует (scribe, verbose_json с таймкодами)
2. Определяет спикеров через Gemini (кадры + транскрипт → кто когда говорит)
3. Разбивает диалог на сегменты ≤8 секунд (лимит Veo 3 / Omni Flash)
4. Переводит каждый сегмент на немецкий и французский - это выбирает пользователь кнопкой
5. Генерирует talking-head видео-клипы для каждого сегмента ( Omni Flash с встроенным липсинком актеров
6. Пользователь скачивает клипы и собирает в монтажной программе

---

## Созданные файлы

### 1. `localize-handlers.cjs` — Backend-модуль (~610 строк)

**Расположение:** `d:\Open_Project\AISTUDIO\localize-handlers.cjs`

**Импорты/зависимости:**
- `callPollinations()` из `skeleton-handlers.cjs` — LLM через цепочку провайдеров (custom→pollinations)
- `synthesizeUnifiedSpeech()` из `skeleton-handlers.cjs` — TTS (eleven_multilingual_v2)
- `generateImageViaGLabs()` из `glabs-handlers.cjs` — референсные изображения персонажей
- `generateVideoViaGLabs()` из `glabs-handlers.cjs` — видео-клипы через Omni Flash
- `request` из `undici` — HTTP для STT
- fs, path, os, child_process (execSync для ffmpeg/ffprobe, spawn для mux)

**Константы:**
- `MAX_SEGMENT_DURATION = 8.0` — лимит Omni Flash
- `PAUSE_THRESHOLD = 0.8` — пауза для разделения реплик
- `MIN_SEGMENT_DURATION = 1.0` — минимум для сегмента
- `KEY_FRAME_COUNT = 6`

**Системные промпты:**
- `SPEAKER_DIARIZATION_PROMPT` — Gemini: идентификация 2 спикеров, привязка реплик к таймкодам через корреляцию с кадрами
- `ANALYSIS_SYSTEM_PROMPT` — Gemini: анализ персонажей, внешность, image prompts
- `TRANSLATION_DE_PROMPT` — перевод на немецкий (casual TikTok-стиль)
- `TRANSLATION_FR_PROMPT` — перевод на французский (casual TikTok-стиль)

**7 IPC-обработчиков:**

| Канал | Назначение |
|---|---|
| `localize-analyze-dialogue` | Полный анализ: аудио→STT→паузы→диаризация→сегменты→персонажи→референсы |
| `localize-translate-segments` | Батчевый перевод сегментов (по 3 за вызов) |
| `localize-generate-segment-video` | Генерация 1 клипа: TTS + Omni Flash + mux |
| `localize-batch-generate-segments` | Последовательная генерация всех клипов для языка |
| `localize-regenerate-character-image` | Перегенерация референса персонажа |
| `localize-retranslate` | Повторный перевод текста |
| `localize-extract-frames` | Извлечение кадров по таймкодам |

**Внутренние хелперы:**
- `splitTranscriptIntoUtterances(words)` — разбивка по паузам >0.8s
- `splitIntoSegments(timeline, speakers)` — группировка по спикерам, split если >8s (по предложениям), слияние коротких <1s
- `muxAudioIntoVideo(videoPath, audioPath, outputPath)` — ffmpeg mux
- `generateTTS(text, outputPath, languageLabel)` — обёртка над synthesizeUnifiedSpeech
- `transcribeAudio(audioPath)` — STT через Pollinations scribe

**Поток `localize-analyze-dialogue`:**
1. Сохранение видео → `source_video.mp4`
2. Извлечение аудио: `ffmpeg -i video -vn -acodec libmp3lame`
3. Транскрибация: multipart POST на `https://gen.pollinations.ai/v1/audio/transcriptions` (scribe, verbose_json)
4. Извлечение 6 ключевых кадров с таймкодами
5. Паузная сегментация транскрипта на utterance'ы
6. Gemini диаризация: system prompt + транскрипт + кадры → `{ speakers[], timeline[] }`
7. `splitIntoSegments()` → сегменты ≤8s
8. Gemini анализ персонажей: внешность, image prompts
9. Генерация reference-изображений через G-Labs (imagen4, 9:16)
10. Сохранение всех результатов в файлы проекта
11. Возврат `DialogueResult`

---

### 2. `src/LocalizeTab.tsx` — React-компонент (~350 строк)

**Расположение:** `d:\Open_Project\AISTUDIO\src\LocalizeTab.tsx`

**Стейт-машина:** `IDLE → PROCESSING → RESULTS`

**RESULTS имеет два режима:**
- **Overview** — сводка: видео, метаданные, спикеры, сцена, транскрипт, персонажи, кадры
- **Segments** — детальная работа с сегментами

**IDLE state:**
- Круг с иконкой Globe
- Заголовок «TikTok Video Localizer»
- Drag-and-drop + click загрузка видео
- Превью загруженного видео
- Индикаторы языков 🇩🇪 German + 🇫🇷 French
- Кнопка «ANALYZE & LOCALIZE»

**PROCESSING state:**
- Спиннер + текст с поэтапным описанием

**RESULTS — Overview mode:**
- Видеоплеер
- Сетка метаданных (Speakers, Segments, Words, Duration)
- Карточки спикеров (цветовое кодирование)
- Описание сцены
- Оригинальный транскрипт с Copy
- Карточки персонажей: фото/референс, описание, prompt (Copy), Regenerate
- Лента ключевых кадров
- Быстрый превью сегментов с кнопкой «View All →»

**RESULTS — Segments mode:**
- Языковые табы 🇩🇪 German / 🇫🇷 French
- Action bar: Translate All / Generate All с прогрессом (X/N)
- Таблица сегментов: #, Speaker, Text, Duration, Actions
- Раскрытие строки: оригинал + перевод + видеоплеер + Download
- Per-segment генерация видео
- Batch-генерация всех сегментов

**Вспомогательные функции:**
- `copyToClipboard()` — копирование с индикацией ✓
- `formatDuration()` — формат M:SS
- `handleAnalyze()`, `handleTranslate()`, `handleGenerateVideo()`, `handleBatchGenerate()`, `handleRegenerateImage()`, `resetWorkflow()`

---

## Изменённые файлы

### 3. `src/electron.d.ts` — Типы TypeScript

**Интерфейсы:**
```typescript
DialogueSpeaker { id: number; name: string; description: string; }
DialogueSegment { speakerId, speakerName, text, translatedText?, startTime, endTime, duration, videoUrl?, audioUrl? }
DialogueResult { projectFolder, transcript, transcriptWords, sceneDescription, speakers, segments, characters, frames, videoUrl }
LocalizeCharacter { name, description, appearance, imagePrompt, generatedImageUrl?, bestFrameUrl? }
```

**API методы в IElectronAPI:**
```typescript
localizeAnalyzeDialogue(videoBase64) → DialogueResult
localizeTranslateSegments(projectFolder, segments, targetLanguage) → DialogueSegment[]
localizeGenerateSegmentVideo({projectFolder, segmentIndex, segments, targetLanguage, characterImages}) → {videoUrl, audioUrl}
localizeBatchGenerateSegments({projectFolder, segments, targetLanguage, characterImages}) → Array<{segmentIndex, videoUrl, audioUrl, status, error}>
localizeRegenerateCharacterImage(projectFolder, characterIndex, customPrompt?) → string
localizeRetranslate(projectFolder, transcript, targetLanguage) → {translatedText}
localizeExtractFrames(videoBase64, timestamps, projectFolder?) → (string|null)[]
```

---

### 4. `preload.js` — IPC Bridge

7 каналов через `contextBridge.exposeInMainWorld('electronAPI', ...)`

---

### 5. `electron.cjs` — Main Process

3 изменения (без изменений от v1):
1. `const { registerLocalizeHandlers } = require('./localize-handlers.cjs');`
2. MEDIA_ROOTS: `'TikTokLocalizer'`
3. `registerLocalizeHandlers(ipcMain);`

---

### 6. `src/App.tsx` — Навигация

4 изменения:
1. `import LocalizeTab from './LocalizeTab';`
2. Тип `AppTab` расширен с `'localize'`
3. Кнопка: `🌍 Localize`
4. Контент: `<LocalizeTab />`

---

## Поток данных (end-to-end)

```
Пользователь загружает видео (FileReader → base64)
    │
    ▼
LocalizeTab.handleAnalyze()
    │
    ▼
window.electronAPI.localizeAnalyzeDialogue(videoBase64)
    │
    ▼
preload.js → ipcRenderer.invoke('localize-analyze-dialogue')
    │
    ▼
localize-handlers.cjs:
  ├─ Сохранение video.mp4
  ├─ ffmpeg: audio.mp3
  ├─ STT (Pollinations scribe) → transcript + words[{start,end,word}]
  ├─ Паузная сегментация → utterances
  ├─ ffmpeg: 6 frame_N.jpg с таймкодами
  ├─ Gemini multimodal (диаризация):
  │   system: SPEAKER_DIARIZATION_PROMPT
  │   user: text + 6 image_url parts
  │   → JSON { speakers[], timeline[{speakerId, text, start, end}] }
  ├─ splitIntoSegments() → сегменты ≤8s
  ├─ Gemini multimodal (персонажи):
  │   system: ANALYSIS_SYSTEM_PROMPT
  │   → JSON { characters[], sceneDescription }
  ├─ G-Labs: generateImageViaGLabs() для каждого персонажа
  ├─ Сохранение всех .json/.txt в папку проекта
  └─ return DialogueResult
    │
    ▼
LocalizeTab: setResult(data) → pipelineState='RESULTS'
    │
    ▼
Пользователь:
  ├─ Нажимает «Translate All» → localizeTranslateSegments (батчами по 3)
  ├─ Нажимает «Generate All» → localizeBatchGenerateSegments
  │   └─ Для каждого сегмента:
  │       ├─ TTS (eleven_multilingual_v2): synthesizeUnifiedSpeech()
  │       ├─ Omni Flash (start_image): generateVideoViaGLabs()
  │       └─ ffmpeg mux: видео + аудио → clip_de_NN.mp4
  └─ Скачивает клипы → собирает в монтажной программе
```

---

## Файловая структура проекта

```
TikTokLocalizer/TikTokLocalize_HHMMSS_MMDDYYYY/
  source_video.mp4
  audio.mp3
  frame_1.jpg ... frame_6.jpg
  transcript_original.txt
  speaker_timeline.json          # { speakers[], timeline[] }
  dialogue_segments.json         # Финальные ≤8s сегменты
  segments_german.json           # Переведённые сегменты (DE)
  segments_french.json           # Переведённые сегменты (FR)
  scene_description.txt
  characters.json
  char_N_*.jpg                   # Сгенерированные референсы персонажей
  clip_audio_de_01.mp3 ...       # TTS аудио
  clip_de_01.mp4 ...             # Готовые видео-клипы (DE)
  clip_fr_01.mp4 ...             # Готовые видео-клипы (FR)
  batch_results_de.json          # Результаты батч-генерации
```

---

## Сборка

```bash
npm run build   # tsc && vite build — проходит без ошибок ✓
```

Файлы на выходе:
- `dist/index.html` (0.48 kB)
- `dist/assets/index-BjFFbhpr.css` (29.23 kB)
- `dist/assets/index-15tKhT3N.js` (279.15 kB)

---

## Запуск для тестирования

```bash
npm run dev
```
1. Открыть вкладку «🌍 Localize»
2. Загрузить `Monky.mp4` (click или drag-and-drop)
3. Нажать «ANALYZE & LOCALIZE»
4. Дождаться анализа (зависит от длительности видео и скорости LLM)
5. В режиме Segments: выбрать язык (🇩🇪/🇫🇷)
6. Нажать «Translate All» для перевода сегментов
7. Нажать «Generate All» для генерации видео-клипов
8. Раскрыть сегменты — просмотреть и скачать клипы

---

## Модели

| Назначение | Модель |
|---|---|
| Анализ (диаризация + персонажи) | gemini-3.1-pro-high (через custom proxy) |
| STT (транскрибация) | scribe (Pollinations) |
| TTS (озвучка) | eleven_multilingual_v2 (VoiceAPI) |
| Референсы персонажей | imagen4 (G-Labs) |
| Видео-клипы | omni_flash (G-Labs, start_image, 9:16, 720p) |

---

## Возможные доработки

- Прогресс-бар с поэтапным статусом в реальном времени
- Поддержка дополнительных языков
- Экспорт всех результатов одним архивом
- Прямая интеграция с TikTok API для публикации
- Ручной выбор кадров для анализа (слайдер по таймлайну)
- Очередь генерации с отменой/паузой
