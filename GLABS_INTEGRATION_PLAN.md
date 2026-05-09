# 🤖 G-Labs Integration — План реализации вкладки в Kimi

## Статус: ИССЛЕДОВАНИЕ ЗАВЕРШЕНО

---

## 📋 СУТЬ ЗАДАЧИ

Добавить в приложение **Kimi** новую вкладку **"G-Labs Studio"**, которая:
1. Управляет Google аккаунтами верифицированными на `labs.google/fx`
2. Запускает G-Labs Automation через **Webhook API** (`http://127.0.0.1:8765`)
3. Генерирует картинки и видео для всех разделов Kimi (Skeleton, HealthTalk, Timelapse и др.)
4. Получает результаты обратно в Kimi и сохраняет их локально

---

## 🏗️ АРХИТЕКТУРА РЕШЕНИЯ

```
┌─────────────────────────────────────────────────────┐
│                   KIMI (Electron)                    │
│                                                      │
│  ┌──────────────┐    ┌─────────────────────────────┐ │
│  │ G-Labs Tab   │───▶│   glabs-handlers.cjs        │ │
│  │ (React UI)   │◀───│   (IPC handlers)            │ │
│  └──────────────┘    └──────────────┬──────────────┘ │
└─────────────────────────────────────┼───────────────┘
                                      │ HTTP REST API
                                      ▼
┌─────────────────────────────────────────────────────┐
│         G-Labs Automation (отдельный процесс)       │
│                                                      │
│  Webhook Server: http://127.0.0.1:8765              │
│  ┌────────────────────────────────────────────────┐  │
│  │  POST /api/image/generate                      │  │
│  │  POST /api/video/generate                      │  │
│  │  GET  /api/status/{task_id}                    │  │
│  │  GET  /api/result/{task_id}                    │  │
│  │  GET  /api/files/{filename}                    │  │
│  │  GET  /api/health                              │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  G-LabsAutomation.exe                               │
│  D:\Open_Project\G-Labs-Automation-v2.0.0\          │
└─────────────────────────────────────────────────────┘
                          │
                          ▼ Chromium (Playwright)
                    labs.google/fx
                    Google Accounts
```

---

## 🔍 РЕЗУЛЬТАТЫ ИССЛЕДОВАНИЯ

### G-Labs Automation — Ключевые факты:

| Параметр | Значение |
|----------|----------|
| **Исполняемый файл** | `D:\Open_Project\G-Labs-Automation-v2.0.0\G-LabsAutomation.exe` |
| **Webhook URL** | `http://127.0.0.1:8765` |
| **Аутентификация** | `X-API-Key` header (генерируется в Settings → Webhook) |
| **Лицензия для Webhook** | MAX план (требуется) |
| **Технология браузера** | Playwright (Chromium) |
| **Язык приложения** | Python + PySide6 (Qt GUI) |

### Доступные модели изображений:
| Модель | Webhook значение | Лимит референсов |
|--------|-----------------|-----------------|
| Nano Banana | `nano_banana` | 5 (категоризированных) |
| **Imagen 4** | `imagen4` | 5 (категоризированных) |
| Nano Banana 2 | `nano_banana_2` | 10 (некатегоризированных) |
| Nano Banana Pro | `nano_banana_pro` | 10 (некатегоризированных) |

### Доступные модели видео:
| Модель | Webhook значение | Кредиты | Тип аккаунта |
|--------|-----------------|---------|-------------|
| Veo 3.1 Fast Relaxed | `veo_31_fast_relaxed` | 0 | ULTRA только |
| **Veo 3.1 Lite** | `veo_31_lite` | 10 | PRO/ULTRA |
| Veo 3.1 Fast | `veo_31_fast` | 20 | PRO/ULTRA |
| Veo 3.1 Quality | `veo_31_quality` | 100 | PRO/ULTRA |

### Webhook API — Полное описание:
```
Base URL: http://127.0.0.1:8765
Auth: X-API-Key header

GET  /api/health              — проверка работоспособности
POST /api/image/generate      — генерация изображения
POST /api/video/generate      — генерация видео
GET  /api/status/{task_id}   — статус задачи
GET  /api/result/{task_id}   — результаты задачи
GET  /api/files/{filename}   — скачивание файла
GET  /api/tasks              — список всех задач
```

### Статусы задач:
```
pending → running → completed / failed
```

---

## 📁 ФАЙЛЫ ДЛЯ СОЗДАНИЯ В KIMI

```
kimi/
├── src/
│   └── GLabsTab.tsx              ← Новая вкладка (React UI)
├── glabs-handlers.cjs            ← IPC handlers для Electron
└── GLABS_INTEGRATION_PLAN.md     ← Этот документ
```

### Изменения в существующих файлах:
```
electron.cjs          ← Регистрация glabs-handlers + запуск G-Labs.exe
src/App.tsx           ← Добавить вкладку G-Labs в навигацию
src/electron.d.ts     ← TypeScript типы для новых IPC методов
preload.cjs           ← Expose новых electronAPI методов
```

---

## 🖥️ ПЛАН UI (GLabsTab.tsx)

### Левая панель (настройки):
```
┌─────────────────────────┐
│ 🤖 G-Labs Studio        │
│                         │
│ ● Статус G-Labs:        │
│   [🟢 Запущен / 🔴 Нет] │
│   [▶ Запустить G-Labs]  │
│                         │
│ ● API Key:              │
│   [________________]    │
│   [💾 Сохранить]        │
│                         │
│ ● Модель изображений:   │
│   ○ Imagen 4            │
│   ○ Nano Banana         │
│   ○ Nano Banana Pro     │
│                         │
│ ● Модель видео:         │
│   ○ Veo 3.1 Fast (10cr) │
│   ○ Veo 3.1 Quality     │
│                         │
│ ● Аспект:               │
│   ○ 9:16  ○ 16:9  ○ 1:1 │
│                         │
│ ● Кол-во:  [1] [2] [4] │
│                         │
│ ─────────────────────── │
│ 🎯 Быстрая генерация    │
│                         │
│ [Промпт для картинки]   │
│                         │
│ [🖼️ Генерировать img]   │
│ [🎬 Генерировать video] │
└─────────────────────────┘
```

### Правая панель (аккаунты + очередь задач):
```
┌──────────────────────────────────────────────────────┐
│ 👤 Google Аккаунты (из G-Labs)  [🔄 Обновить]       │
│                                                      │
│ # │ Email           │ Тип  │ Кредиты │ Статус        │
│ 1 │ user@gmail.com  │ PRO  │ 1000    │ ✅ ACTIVE      │
│ 2 │ user2@gmail.com │ FREE │ 130     │ ✅ ACTIVE      │
│                                                      │
│ ════════════════════════════════════════════════════ │
│                                                      │
│ 📋 Очередь задач          [🗑️ Очистить]             │
│                                                      │
│ Task ID    │ Тип   │ Промпт     │ Статус  │ Действие  │
│ a1b2c3d4   │ image │ skeleton.. │ ✅ Done │ [💾 Сохр] │
│ e5f6g7h8   │ video │ walking..  │ 🔄 Run  │ [👁️ View] │
│ i9j0k1l2   │ image │ portrait.. │ ⏳ Wait │ [❌ Отм.] │
│                                                      │
│ ════════════════════════════════════════════════════ │
│                                                      │
│ 🖼️ Результаты (последние)                           │
│                                                      │
│ [img1] [img2] [img3] [img4]                         │
│ [vid1] [vid2]                                       │
└──────────────────────────────────────────────────────┘
```

---

## ⚙️ ПЛАН HANDLERS (glabs-handlers.cjs)

### IPC методы для реализации:

```javascript
// 1. Проверка работоспособности G-Labs
ipcMain.handle('glabs-health-check', async () => {
  // GET http://127.0.0.1:8765/api/health
  // Возвращает: { running: bool, tasks_pending, tasks_running }
})

// 2. Запуск G-LabsAutomation.exe
ipcMain.handle('glabs-launch', async () => {
  // spawn('D:\\...\\G-LabsAutomation.exe')
})

// 3. Получение списка аккаунтов
ipcMain.handle('glabs-get-accounts', async () => {
  // Читает файл accounts из папки G-Labs или через UI automation
  // Возвращает: [{ email, tier, credits, status }]
})

// 4. Генерация изображения
ipcMain.handle('glabs-generate-image', async (event, { prompt, model, aspectRatio, count }) => {
  // POST /api/image/generate
  // Polling /api/status/{task_id}
  // GET /api/files/{filename} → сохранить локально
  // Возвращает: [localFilePaths]
})

// 5. Генерация видео
ipcMain.handle('glabs-generate-video', async (event, { prompt, model, aspectRatio }) => {
  // POST /api/video/generate
  // Polling с прогрессом через event.sender.send()
  // Возвращает: localFilePath
})

// 6. Статус задачи
ipcMain.handle('glabs-task-status', async (event, { taskId }) => {
  // GET /api/status/{task_id}
})

// 7. Список всех задач
ipcMain.handle('glabs-list-tasks', async () => {
  // GET /api/tasks
})

// 8. Использование для конкретного раздела Kimi
ipcMain.handle('glabs-generate-for-section', async (event, {
  section,    // 'skeleton' | 'timelapse' | 'healthtalk'
  sceneIndex,
  prompt,
  type        // 'image' | 'video'
}) => {
  // Генерирует и сохраняет в нужную папку
  // skeleton → SkeletonShorts/scene_X.jpg
  // timelapse → Images/image_X.jpg
})
```

---

## 🔗 ИНТЕГРАЦИЯ С РАЗДЕЛАМИ KIMI

### Skeleton Shorts:
```
G-Labs → SkeletonShorts/scene_1.jpg ... scene_6.jpg
       → SkeletonShorts/scene_1.mp4 ... scene_6.mp4
```

### AI Timelapse:
```
G-Labs → Images/image_1.jpg ... image_N.jpg
```

### AI HealthTalk / ObjectWars:
```
G-Labs → SkeletonShorts/scene_1.jpg ... scene_5.jpg
```

---

## 📊 FLOWCHART РАБОТЫ

```
Пользователь нажимает "Генерировать"
           │
           ▼
   glabs-health-check
           │
     ┌─────┴─────┐
     │ Запущен?  │
     └─────┬─────┘
        Нет│              Да│
           ▼              ▼
    glabs-launch    Отправить задачу
           │        POST /api/image/generate
           │              │
           ▼              ▼
    Ждать 5 сек    Получить task_id
           │              │
           └──────┬────────┘
                  │
                  ▼
          Polling каждые 3 сек
          GET /api/status/{id}
                  │
            ┌─────┴─────┐
            │ completed?│
            └─────┬─────┘
              Нет │               Да│
                  ▼               ▼
             Ждать 3с    GET /api/files/{name}
                  │               │
                  └──────┬─────────┘
                         │
                         ▼
                   Сохранить файл
                   Показать превью
```

---

## 🗂️ СТРУКТУРА ДАННЫХ ACCOUNTS

G-Labs хранит аккаунты в JSON файле:
```
D:\Open_Project\G-Labs-Automation-v2.0.0\
  └── (profile data в папке playwright browsers)
```

Аккаунты читаем через:
1. **Вариант A**: Webhook API (если G-Labs добавит endpoint `/api/accounts`)
2. **Вариант B**: Чтение JSON файла напрямую из папки G-Labs
3. **Вариант C**: Kimi хранит свой список аккаунтов независимо

**Рекомендуем Вариант C** — Kimi хранит отдельный `glabs-accounts.json`:
```json
[
  {
    "email": "user@gmail.com",
    "tier": "PRO",
    "credits": 1000,
    "status": "active",
    "addedAt": "2024-01-01"
  }
]
```
Синхронизация статуса — через `/api/health` (косвенно).

---

## 📝 НАСТРОЙКИ В .ENV

Добавить в `.env`:
```
GLABS_WEBHOOK_URL=http://127.0.0.1:8765
GLABS_API_KEY=your_webhook_api_key_here
GLABS_EXE_PATH=D:\Open_Project\G-Labs-Automation-v2.0.0\G-LabsAutomation.exe
```

---

## ⚡ ПОЭТАПНЫЙ ПЛАН РЕАЛИЗАЦИИ

### Этап 1 — Инфраструктура (handlers + .env)
- [ ] Добавить переменные в `.env`
- [ ] Создать `glabs-handlers.cjs`
- [ ] Реализовать `glabs-health-check` и `glabs-launch`
- [ ] Зарегистрировать handlers в `electron.cjs`
- [ ] Добавить типы в `electron.d.ts`
- [ ] Expose методы в `preload.cjs`

### Этап 2 — UI (GLabsTab.tsx)
- [ ] Создать `src/GLabsTab.tsx`
- [ ] Панель статуса + кнопка запуска G-Labs
- [ ] Поле API Key + сохранение в .env
- [ ] Таблица аккаунтов
- [ ] Конфигуратор модели/аспекта/количества
- [ ] Быстрая генерация с промптом

### Этап 3 — Генерация + Polling
- [ ] `glabs-generate-image` с polling
- [ ] `glabs-generate-video` с прогрессом
- [ ] Очередь задач в UI
- [ ] Превью результатов

### Этап 4 — Интеграция с разделами
- [ ] Добавить кнопку "Generate via G-Labs" в Skeleton Shorts
- [ ] Добавить кнопку "Generate via G-Labs" в AI Timelapse
- [ ] Маршрутизация файлов в нужные папки

### Этап 5 — Управление аккаунтами
- [ ] Форма добавления аккаунта вручную
- [ ] Сохранение в `glabs-accounts.json`
- [ ] Индикатор онлайн/офлайн статуса
- [ ] Кнопка запуска G-Labs для авторизации нового аккаунта

---

## ⚠️ ОГРАНИЧЕНИЯ И РИСКИ

| Риск | Описание | Решение |
|------|----------|---------|
| **MAX лицензия** | Webhook требует MAX план G-Labs | Приобрести MAX план |
| **G-Labs не запущен** | Webhook недоступен | Auto-launch exe + retry |
| **Кредиты закончились** | Задача упадёт с ошибкой | Ротация аккаунтов |
| **Нет PRO аккаунта** | Видео не генерируется | Предупреждение в UI |
| **API Key не настроен** | 401 ошибки | Проверка при старте |

---

## 🔑 УТОЧНЕНИЯ — ПОЛУЧЕНЫ ОТВЕТЫ

1. ✅ **MAX план** — будет приобретен скоро. Реализуем заранее.
2. ✅ **API Key**: `bR6yWXzNrvHDJmvPKzn9WqZ1c0sUFDEeUf83jxhDj5o`
3. ✅ **Авто-запуск**: НЕТ. Кнопка ручного запуска в UI.
4. ✅ **Приоритет**: Skeleton Shorts → затем остальные по образцу.

---

## 📅 ОЦЕНКА ВРЕМЕНИ

| Этап | Сложность | Файлы |
|------|-----------|-------|
| Этап 1 (Инфраструктура) | Низкая | `glabs-handlers.cjs`, `.env`, `electron.cjs` |
| Этап 2 (UI) | Средняя | `GLabsTab.tsx`, `App.tsx` |
| Этап 3 (Polling) | Средняя | `glabs-handlers.cjs` |
| Этап 4 (Интеграция) | Средняя | `SkeletonTab.tsx`, etc. |
| Этап 5 (Аккаунты) | Низкая | `glabs-accounts.json`, UI |

---

*Документ создан на основе:*
- *Исследования https://github.com/duckmartians/G-Labs-Automation*
- *Изучения WEBHOOK_API_GUIDE.md*
- *Анализа структуры D:\Open_Project\G-Labs-Automation-v2.0.0*
- *Анализа архитектуры текущего приложения Kimi*
