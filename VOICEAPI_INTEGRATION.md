# VoiseAPI Integration — Техническая документация

> Сервис: **https://voiceapi.csv666.ru**  
> OpenAPI Spec: **https://voiceapi.csv666.ru/openapi.json**  
> Docs: **https://voiceapi.csv666.ru/docs**

---

## ⚠️ КРИТИЧЕСКИЕ ПРАВИЛА — ОБЯЗАТЕЛЬНО К СОБЛЮДЕНИЮ

### 1. Авторизация — ТОЛЬКО `X-API-Key`

```
❌ НЕПРАВИЛЬНО: Authorization: Bearer {key}
❌ НЕПРАВИЛЬНО: Authorization: {key}
✅ ПРАВИЛЬНО:   X-API-Key: {key}
```

Согласно OpenAPI spec (`securitySchemes`):
```json
"APIKeyHeader": {
  "type": "apiKey",
  "in": "header",
  "name": "X-API-Key"
}
```

### 2. Переменная среды в `.env`

```env
VOICEAPI_KEY=866296891:6d5361454a6b525a52332b6173746332692f617a78513d3d
STORY_VOICE_ID=S3EMTLF63LOyQFQA2vOC
TEST_VOICE_ID=y1adqrqs4jNaANXsIZnD
VOISE_API_BASE=https://voiceapi.csv666.ru
```

---

## Правильный Flow (3 шага)

```
POST /tasks              ← создать задачу TTS
   ↓
GET /tasks/{id}/status   ← polling статуса (каждые 3 сек)
   ↓
GET /tasks/{id}/result   ← скачать бинарный MP3
```

### ❌ НЕПРАВИЛЬНЫЙ flow (старый, не работает):
```
POST /tasks → GET /tasks/{id}  ← ENDPOINT НЕ СУЩЕСТВУЕТ!
                                  API не возвращает audio_url в ответе!
```

---

## Статусы задачи

| Статус | Описание | Действие |
|--------|----------|----------|
| `waiting` | В очереди | Продолжаем polling |
| `processing` | Синтез выполняется | Продолжаем polling |
| `ending` | **Готово! Результат доступен** | → Скачиваем `/result` |
| `ending_processed` | Результат уже скачан | → Можно скачать снова |
| `error` | Ошибка | Кидаем исключение |
| `error_handled` | Ошибка (средства возвращены) | Кидаем исключение |

---

## Шаг 1: POST /tasks — Создать задачу

```javascript
const headers = {
  'X-API-Key': process.env.VOICEAPI_KEY,
  'Content-Type': 'application/json'
};

const body = {
  template: {
    model_id: 'eleven_multilingual_v2',
    voice_id: 'S3EMTLF63LOyQFQA2vOC',   // voice_id из .env
    voice_settings: {
      stability: 0.85,
      similarity_boost: 0.75,
      use_speaker_boost: true,
      style: 0.0,
      speed: 1.0
    },
    voice_result_type: 'default'
  },
  text: 'Текст для синтеза речи',
  task_type: 'default'
};

const response = await axios.post('https://voiceapi.csv666.ru/tasks', body, { headers });
const taskId = response.data.task_id;  // → число, например 12345
```

**Ответ:** `{ "task_id": 12345, "message": "Task created successfully. Cost: 45 characters" }`

---

## Шаг 2: GET /tasks/{id}/status — Polling статуса

```javascript
// Опрашиваем каждые 3 секунды, максимум 60 раз (3 минуты)
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 3000));
  
  const statusResp = await axios.get(
    `https://voiceapi.csv666.ru/tasks/${taskId}/status`,
    { headers }
  );
  
  const status = statusResp.data.status.toLowerCase();
  // status: 'waiting' | 'processing' | 'ending' | 'ending_processed' | 'error' | 'error_handled'
  
  if (status === 'error' || status === 'error_handled') {
    throw new Error('Task failed: ' + JSON.stringify(statusResp.data));
  }
  
  if (status === 'ending' || status === 'ending_processed') {
    // → Готово! Переходим к шагу 3
    break;
  }
  // 'waiting' / 'processing' — продолжаем ждать
}
```

**Ответ:** `{ "task_id": 12345, "status": "ending", "status_label": "Результат готов", "created_at": "..." }`

---

## Шаг 3: GET /tasks/{id}/result — Скачать MP3

```javascript
const audioResp = await axios.get(
  `https://voiceapi.csv666.ru/tasks/${taskId}/result`,
  { 
    responseType: 'arraybuffer',   // ← ОБЯЗАТЕЛЬНО! Бинарный файл
    headers 
  }
);

const buf = Buffer.from(audioResp.data);

// Проверка валидности MP3
const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;  // 'ID3'
const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;             // MPEG sync

fs.writeFileSync('/path/to/output.mp3', buf);
```

---

## Важные поля шаблона

| Поле | Обязательное | По умолчанию | Описание |
|------|-------------|--------------|----------|
| `voice_id` | **ДА** | — | ID голоса ElevenLabs |
| `public_owner_id` | Нет (для стандартных) | `null` | Нужен только для нестандартных голосов |
| `model_id` | Нет | `eleven_multilingual_v2` | Модель TTS |
| `stability` | Нет | `0.85` | 0.0–1.0 |
| `similarity_boost` | Нет | `0.75` | 0.0–1.0 |
| `speed` | Нет | `1.0` | 0.25–2.0 |
| `voice_result_type` | Нет | `default` | `default`, `paragraph`, `chunks` |

---

## Поиск голосов и public_owner_id

```bash
# Поиск голоса по имени
node list_voices.cjs "Rachel"

# Список всех голосов
node list_voices.cjs

# Результат включает voice_id и public_owner_id
```

Или через API:
```
GET /shared-voices?page=0&page_size=30&search={voice_id}
Headers: X-API-Key: {key}
```

---

## Тестирование

```bash
# Быстрый тест через debug_voice.cjs
node debug_voice.cjs

# Убедитесь что в .env есть:
# VOICEAPI_KEY=...
# TEST_VOICE_ID=...
```

---

## Реализация в проекте

### `story-handlers.cjs` — функция `storyGenerateVoice()`
- Использует `VOICEAPI_KEY` + `STORY_VOICE_ID` (или `TEST_VOICE_ID`)
- Сохраняет в `Stories/{projectFolder}/Audio/voice_{md5hash}.mp3`
- Имеет кэширование — если файл уже существует и валиден, не делает повторных запросов
- Проверяет что сохранённый файл — настоящий MP3 (не HTML страница ошибки)

### `skeleton-handlers.cjs` — функция `synthesizeCsv666Speech()`
- Использует `VOICEAPI_KEY` (fallback: `VOICE_AI_KEY`)
- Та же логика polling и скачивания

---

## Частые ошибки и решения

### `{ "detail": "API key is missing" }` (HTTP 401)
**Причина:** Неправильный заголовок авторизации  
**Решение:** Используй `X-API-Key: {key}`, не `Authorization: Bearer {key}`

### Файл сохраняется но не воспроизводится
**Причина:** В файле сохранена HTML страница ошибки (не MP3)  
**Решение:** Проверь первые байты файла — если начинается с `<`, это HTML. Код автоматически удаляет такие файлы и делает повторный запрос.

### `[Voice] Done but no audio`
**Причина:** Старый код опрашивал `/tasks/{id}` (не существует) или искал `audio_url` в ответе  
**Решение:** Использовать `/tasks/{id}/status` для polling, затем `/tasks/{id}/result` для скачивания

### `[Voice] Timeout`
**Причина:** Задача не завершилась за 3 минуты (60 попыток × 3 сек)  
**Решение:** Увеличить `maxAttempts` или проверить баланс аккаунта

---

## Дополнительные эндпоинты

```
GET  /balance                    — текущий баланс
GET  /tasks                      — список задач (limit, offset)
GET  /templates                  — список сохранённых шаблонов голосов
GET  /shared-voices              — публичная библиотека голосов
```

Все эндпоинты требуют `X-API-Key: {key}`.