# VoiceAPI — Документация

**Base URL:** `https://voiceapi.csv666.ru`  
**Аутентификация:** заголовок `X-API-Key: <VOICEAPI_KEY>`  
**Ключ из `.env`:** `VOICEAPI_KEY=866296891:6d5361454a6b525a52332b6173746332692f617a78513d3d`  
**Голос по умолчанию (STORY_VOICE_ID):** `S3EMTLF63LOyQFQA2vOC`

---

## Workflow

```
POST /tasks  →  GET /tasks/{task_id}/status  →  GET /tasks/{task_id}/result
```

---

## Эндпоинты

---

### `POST /tasks` — Создать задачу синтеза речи

Создаёт новую задачу на синтез речи из текста.

**Настройки голоса (взаимоисключающие):**

| Способ | Описание |
|--------|----------|
| `template_uuid` | UUID сохранённого шаблона |
| `template` | Инлайн-шаблон с произвольными настройками (без сохранения) |
| *(не указан)* | Используются настройки по умолчанию |

#### Поля инлайн-шаблона (`template`)

| Поле | Тип | Обязательное | По умолчанию | Описание |
|------|-----|:---:|:---:|----------|
| `model_id` | string | нет | `eleven_multilingual_v2` | ID модели TTS |
| `voice_id` | string | **да** | — | ID голоса ElevenLabs |
| `public_owner_id` | string\|null | нет | `null` | Public Owner ID голоса |
| `voice_settings.stability` | float | нет | `0.85` | Стабильность (0.0–1.0) |
| `voice_settings.similarity_boost` | float | нет | `0.75` | Сходство с оригиналом (0.0–1.0) |
| `voice_settings.use_speaker_boost` | bool | нет | `true` | Усиление голоса спикера |
| `voice_settings.style` | float | нет | `0.0` | Стиль речи (0.0–1.0) |
| `voice_settings.speed` | float | нет | `1.0` | Скорость речи (0.25–2.0) |
| `voice_result_type` | string | нет | `default` | Тип результата: `paragraph`, `chunks` или `default` |
| `settings` | object\|null | нет | `null` | Доп. настройки (см. ниже) |

#### Поля `settings` (внутри `template`)

| Поле | Тип | Описание |
|------|-----|----------|
| `chunk_size` | string | Размер чанка (например `"2000"`) |
| `chunk_pause` | bool | Пауза между чанками |
| `watermark_remove` | bool | Удаление водяного знака (−100 символов за каждый чанк) |

> **public_owner_id:**  
> Для голосов из стандартной библиотеки — `null`. Для нестандартных голосов — обязателен.  
> Найти через: `GET /shared-voices?page=0&page_size=30&search={voice_id}` → `voices[0].public_owner_id`  
> После получения — сохраните в шаблон, повторных запросов не делать.

> **Расчёт стоимости:**  
> Количество символов в тексте. Если `settings.watermark_remove = true` — дополнительно −100 символов за каждый чанк.

#### Тело запроса (`application/json`)

```json
{
  "template_uuid": "123e4567-e89b-12d3-a456-426614174000",
  "template": {
    "model_id": "eleven_multilingual_v2",
    "voice_id": "S3EMTLF63LOyQFQA2vOC",
    "public_owner_id": null,
    "voice_settings": {
      "stability": 0.85,
      "similarity_boost": 0.75,
      "use_speaker_boost": true,
      "style": 0,
      "speed": 1
    },
    "voice_result_type": "default",
    "settings": {
      "chunk_pause": true,
      "chunk_size": "2000",
      "watermark_remove": false
    }
  },
  "text": "Привет, это тестовый текст для синтеза речи.",
  "chunk_size": 500,
  "pause_settings": {
    "auto_paragraph_pause": false,
    "enabled": false,
    "max_pause_symb": 2000,
    "pause_time": 1
  },
  "stress_settings": {
    "enabled": false
  },
  "task_type": "default"
}
```

> `task_type`: `"test"` — тестовый режим, `"default"` — боевой.

#### Ответы

| Код | Описание | Тело |
|-----|----------|------|
| `200` | Задача создана | `{ "task_id": 42, "message": "Task created successfully. Cost: 100 characters" }` |
| `400` | Неверные параметры | `{ "detail": "...", "error_code": "...", "errors": {} }` |
| `401` | Ошибка аутентификации | `{ "detail": "...", "error_code": "..." }` |
| `402` | Недостаточно средств | `{ "detail": "...", "error_code": "..." }` |
| `422` | Ошибка валидации | `{ "detail": [{ "loc": [...], "msg": "...", "type": "..." }] }` |
| `429` | Превышен лимит активных задач | `{ "detail": "...", "error_code": "..." }` |
| `500` | Внутренняя ошибка сервера | `{ "detail": "...", "error_code": "..." }` |

---

### `GET /tasks` — Список задач пользователя

Возвращает список задач с пагинацией.

#### Параметры запроса

| Параметр | Тип | По умолчанию | Описание |
|----------|-----|:---:|----------|
| `limit` | integer | `50` | Количество записей |
| `offset` | integer | `0` | Смещение |

#### Ответ `200`

```json
{
  "tasks": [
    {
      "id": 0,
      "status": "string",
      "status_label": "string",
      "created_at": "2026-05-10T06:50:14.369Z",
      "has_result": true,
      "file_available": false,
      "errors": [],
      "result_ext": "string",
      "text_length": 0
    }
  ],
  "total": 0
}
```

| Код | Описание |
|-----|----------|
| `200` | Успешно |
| `401` | Ошибка аутентификации |
| `422` | Ошибка валидации |

---

### `GET /tasks/{task_id}/status` — Статус задачи

Возвращает текущий статус задачи синтеза речи.

#### Параметры пути

| Параметр | Тип | Описание |
|----------|-----|----------|
| `task_id` | integer | ID задачи |

#### Возможные статусы

| Статус | Описание |
|--------|----------|
| `waiting` | Ожидание очереди |
| `processing` | Обработка |
| `ending` | Результат готов к скачиванию |
| `ending_processed` | Заказ завершён |
| `error` | Возникла ошибка (средства возвращаются автоматически при запросе статуса) |
| `error_handled` | Ошибка обработана, средства возвращены |

> При статусах `ending` и `ending_processed` — скачивать результат через `GET /tasks/{task_id}/result`.

#### Ответ `200`

```json
{
  "task_id": 42,
  "status": "waiting",
  "status_label": "В обработке",
  "created_at": "2026-05-10T06:50:14.373Z"
}
```

| Код | Описание |
|-----|----------|
| `200` | Успешно |
| `401` | Ошибка аутентификации |
| `404` | Задача не найдена |
| `422` | Ошибка валидации |

---

### `GET /tasks/{task_id}/result` — Получить результат задачи

Возвращает файл с результатом синтеза речи.

**Форматы результата:**
- `MP3` — итоговый аудиофайл
- `ZIP` — архив с чанками/результатами

**Условия:**
- Задача должна быть в статусе `ending`
- Файл результата должен существовать на сервере
- После успешного получения задача переходит в статус `ending_processed`

#### Параметры

| Параметр | Тип | Где | Описание |
|----------|-----|-----|----------|
| `task_id` | integer | path | ID задачи |
| `api_key` | string | query | API ключ (альтернатива заголовку) |

#### Ответы

| Код | Описание |
|-----|----------|
| `200` | Файл с результатом (MP3 или ZIP) |
| `202` | Результат ещё не готов |
| `401` | Ошибка аутентификации |
| `404` | Задача не найдена |
| `410` | Файл результата больше не доступен |
| `422` | Ошибка валидации |

---

## Пример полного потока (Node.js)

```js
const https = require('https');
const fs = require('fs');

const KEY = process.env.VOICEAPI_KEY;
const BASE = 'voiceapi.csv666.ru';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const headers = { 'X-API-Key': KEY, 'Content-Type': 'application/json' };
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request({ hostname: BASE, path, method, headers }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function synthesize(text, voiceId = 'S3EMTLF63LOyQFQA2vOC') {
  // 1. Создать задачу
  const body = JSON.stringify({
    template: {
      model_id: 'eleven_multilingual_v2',
      voice_id: voiceId,
      public_owner_id: null,
      voice_settings: { stability: 0.85, similarity_boost: 0.75, use_speaker_boost: true, style: 0, speed: 1 },
      voice_result_type: 'default'
    },
    text,
    task_type: 'default'
  });

  const cr = await request('POST', '/tasks', body);
  const { task_id } = JSON.parse(cr.buf.toString('utf8'));
  console.log('task_id:', task_id);

  // 2. Опрос статуса
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const sr = await request('GET', `/tasks/${task_id}/status`, null);
    const { status } = JSON.parse(sr.buf.toString('utf8'));
    console.log('status:', status);

    if (status === 'ending' || status === 'ending_processed') {
      // 3. Скачать результат
      const rr = await request('GET', `/tasks/${task_id}/result`, null);
      if (rr.status === 200) {
        fs.writeFileSync('result.mp3', rr.buf);
        console.log('Сохранено: result.mp3');
      }
      break;
    }
    if (status === 'error' || status === 'error_handled') {
      console.error('Ошибка задачи');
      break;
    }
  }
}

synthesize('Привет, мир!').catch(console.error);
```

---

## Поиск public_owner_id для нестандартного голоса

```
GET https://voiceapi.csv666.ru/shared-voices?page=0&page_size=30&search={voice_id}
```

Из ответа: `voices[0].public_owner_id` — сохранить и больше не запрашивать.