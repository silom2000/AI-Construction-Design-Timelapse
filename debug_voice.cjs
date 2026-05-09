'use strict';
/**
 * debug_voice.cjs — тест VoiseAPI (voiceapi.csv666.ru)
 * CommonJS версия debug_voice.js
 * 
 * VoiseAPI работает асинхронно:
 *   1. POST /tasks  → {"task_id": 42, "message": "..."}
 *   2. GET  /tasks/{id} → опрос статуса
 *   3. Скачиваем аудио по URL из результата
 * 
 * Запуск: node debug_voice.cjs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const VOICE_AI_KEY = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
const VOISE_API_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';

// Замените на реальный voice_id из вашего аккаунта VoiseAPI / ElevenLabs
const TEST_VOICE_ID = process.env.TEST_VOICE_ID || 'y1adqrqs4jNaANXsIZnD';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testVoice() {
  console.log('=== VoiseAPI Debug Test (CJS) ===');
  console.log('Base URL:', VOISE_API_BASE);
  console.log('API Key:', VOICE_AI_KEY ? `Found (${VOICE_AI_KEY.substring(0, 8)}...)` : '❌ NOT FOUND');
  console.log('Voice ID:', TEST_VOICE_ID);
  console.log('');

  if (!VOICE_AI_KEY) {
    console.error('ERROR: VOICE_AI_KEY не установлен в .env');
    process.exit(1);
  }

  // ✅ CORRECT AUTH: X-API-Key header (per voiceapi.csv666.ru/openapi.json docs)
  const headers = {
    'X-API-Key': VOICE_AI_KEY,
    'Content-Type': 'application/json'
  };

  const testText = 'Привет! Это тестовый синтез речи через VoiseAPI.';

  try {
    // === Шаг 1: Создать задачу ===
    console.log('📤 Шаг 1: Создание задачи...');

    const taskBody = {
      template: {
        model_id: 'eleven_multilingual_v2',
        voice_id: TEST_VOICE_ID,
        voice_settings: {
          stability: 0.85,
          similarity_boost: 0.75,
          use_speaker_boost: true,
          style: 0.0,
          speed: 1.0
        },
        voice_result_type: 'default'
      },
      text: testText,
      task_type: 'test'
    };

    const createResp = await axios.post(
      `${VOISE_API_BASE}/tasks`,
      taskBody,
      { headers }
    );

    console.log('✅ Задача создана!');
    console.log('   Response:', JSON.stringify(createResp.data));

    const taskId = createResp.data.task_id;
    if (!taskId) {
      throw new Error('API не вернул task_id! Ответ: ' + JSON.stringify(createResp.data));
    }
    console.log('   task_id:', taskId);

    // === Шаг 2: Опрос статуса ===
    console.log('');
    console.log('🔄 Шаг 2: Ожидание результата...');

    const maxAttempts = 40;
    let finalTaskData = null;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(3000);

      // ✅ CORRECT endpoint: /tasks/{id}/status
      const statusResp = await axios.get(
        `${VOISE_API_BASE}/tasks/${taskId}/status`,
        { headers }
      );

      const taskData = statusResp.data;
      const status = (taskData.status || 'unknown').toLowerCase();

      process.stdout.write(`   [${i + 1}/${maxAttempts}] status="${status}"\r`);

      // Statuses: waiting → processing → ending (ready!) → ending_processed
      if (status === 'error' || status === 'error_handled') {
        console.log('');
        throw new Error('❌ Ошибка: ' + JSON.stringify(taskData));
      }

      // "ending" = result ready at /tasks/{id}/result
      if (status === 'ending' || status === 'ending_processed') {
        console.log('');
        console.log('✅ Задача завершена! status=' + status);
        finalTaskData = { taskId };
        break;
      }
    }

    if (!finalTaskData) {
      throw new Error(`Timeout: задача ${taskId} не завершилась`);
    }

    // === Шаг 3: Сохранить аудио ===
    console.log('');
    console.log('📥 Шаг 3: Сохранение аудио...');

    let audioBuffer;

    // ✅ CORRECT: GET /tasks/{id}/result — binary MP3
    console.log(`   Скачивание: ${VOISE_API_BASE}/tasks/${finalTaskData.taskId}/result`);
    const audioResp = await axios.get(
      `${VOISE_API_BASE}/tasks/${finalTaskData.taskId}/result`,
      { responseType: 'arraybuffer', headers }
    );
    audioBuffer = Buffer.from(audioResp.data);

    console.log('   Размер:', audioBuffer.length, 'байт');
    console.log('   HEX первые 16:', audioBuffer.slice(0, 16).toString('hex'));

    const isID3  = audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33;
    const isSync = audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0;
    console.log('   MP3 (ID3):', isID3 ? '✅' : '❌');
    console.log('   MP3 (sync):', isSync ? '✅' : '❌');

    const audioDir = path.join(__dirname, 'Audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const outputPath = path.join(audioDir, 'test_voice_result.mp3');
    fs.writeFileSync(outputPath, audioBuffer);

    console.log('');
    console.log('💾 Файл сохранён:', outputPath);
    console.log('   Размер файла:', fs.statSync(outputPath).size, 'байт');
    console.log('');
    if (isID3 || isSync) {
      console.log('✅ УСПЕХ! Валидный MP3 файл создан.');
    } else {
      console.log('⚠️  Файл сохранён но не похож на MP3. Проверьте ответ API выше.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ ОШИБКА:', error.message);
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      const d = error.response.data;
      console.error('   Response:', Buffer.isBuffer(d) ? d.toString('utf8').substring(0, 800) : JSON.stringify(d).substring(0, 800));
    }
    process.exit(1);
  }
}

testVoice();