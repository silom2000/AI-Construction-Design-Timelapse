'use strict';
/**
 * debug_voice.js — тест VoiseAPI (voiceapi.csv666.ru)
 * 
 * VoiseAPI работает асинхронно:
 *   1. POST /tasks  → {"task_id": 42, "message": "..."}
 *   2. GET  /tasks/{id} → опрос статуса
 *   3. Скачиваем аудио по URL из результата
 * 
 * Запуск: node debug_voice.js
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const VOICE_AI_KEY = process.env.VOICE_AI_KEY;
const VOISE_API_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';

// Замените на реальный voice_id из вашего аккаунта VoiseAPI / ElevenLabs
// Пример ID из документации: 'y1adqrqs4jNaANXsIZnD'
const TEST_VOICE_ID = process.env.TEST_VOICE_ID || 'y1adqrqs4jNaANXsIZnD';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testVoice() {
  console.log('=== VoiseAPI Debug Test ===');
  console.log('Base URL:', VOISE_API_BASE);
  console.log('API Key:', VOICE_AI_KEY ? `Found (${VOICE_AI_KEY.substring(0, 8)}...)` : '❌ NOT FOUND');
  console.log('Voice ID:', TEST_VOICE_ID);
  console.log('');

  if (!VOICE_AI_KEY) {
    console.error('ERROR: VOICE_AI_KEY не установлен в .env');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bearer ${VOICE_AI_KEY}`,
    'Content-Type': 'application/json'
  };

  const testText = 'Привет! Это тестовый синтез речи через VoiseAPI.';

  try {
    // ========================================
    // Шаг 1: Создать задачу синтеза
    // ========================================
    console.log('📤 Шаг 1: Создание задачи...');
    console.log('   Text:', testText);

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
    console.log('   Status:', createResp.status);
    console.log('   Response:', JSON.stringify(createResp.data));

    const taskId = createResp.data.task_id;
    if (!taskId) {
      throw new Error('API не вернул task_id! Ответ: ' + JSON.stringify(createResp.data));
    }
    console.log('   task_id:', taskId);

    // ========================================
    // Шаг 2: Опрос статуса задачи
    // ========================================
    console.log('');
    console.log('🔄 Шаг 2: Ожидание результата...');

    const maxAttempts = 40; // 40 * 3s = 2 минуты
    let finalTaskData = null;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(3000);

      const statusResp = await axios.get(
        `${VOISE_API_BASE}/tasks/${taskId}`,
        { headers }
      );

      const taskData = statusResp.data;
      const status = (taskData.status || taskData.state || 'unknown').toLowerCase();

      process.stdout.write(`   [${i + 1}/${maxAttempts}] status="${status}"\r`);

      if (status === 'failed' || status === 'error') {
        console.log('');
        throw new Error('❌ Задача завершилась с ошибкой: ' + JSON.stringify(taskData));
      }

      // Проверяем наличие аудио-данных
      const audioUrl =
        taskData.audio_url ||
        taskData.result_url ||
        taskData.url ||
        (taskData.result && (taskData.result.url || taskData.result.audio_url));

      const audioBase64 =
        taskData.audio ||
        taskData.audio_base64 ||
        (taskData.result && (taskData.result.audio || taskData.result.audio_base64));

      if (audioUrl || audioBase64) {
        console.log('');
        console.log('✅ Задача завершена!');
        console.log('   Full response:', JSON.stringify(taskData));
        finalTaskData = { audioUrl, audioBase64, taskData };
        break;
      }

      if (status === 'completed' || status === 'done' || status === 'success') {
        console.log('');
        console.log('⚠️  Статус "completed" но аудио не найдено. Полный ответ:');
        console.log('   ', JSON.stringify(taskData, null, 2));
        throw new Error('Задача завершена без аудио. Нужно изучить формат ответа выше.');
      }
    }

    if (!finalTaskData) {
      throw new Error(`Timeout: задача ${taskId} не завершилась за ${maxAttempts * 3} секунд`);
    }

    // ========================================
    // Шаг 3: Скачать и сохранить аудио
    // ========================================
    console.log('');
    console.log('📥 Шаг 3: Сохранение аудио...');

    let audioBuffer;

    if (finalTaskData.audioUrl) {
      console.log('   URL:', finalTaskData.audioUrl);
      const audioResp = await axios.get(finalTaskData.audioUrl, {
        responseType: 'arraybuffer',
        headers: { 'Authorization': `Bearer ${VOICE_AI_KEY}` }
      });
      audioBuffer = Buffer.from(audioResp.data);
    } else {
      console.log('   Декодирование base64...');
      audioBuffer = Buffer.from(finalTaskData.audioBase64, 'base64');
    }

    console.log('   Размер аудио:', audioBuffer.length, 'байт');
    console.log('   Первые 16 байт (hex):', audioBuffer.slice(0, 16).toString('hex'));

    // Проверяем валидность MP3
    const isID3  = audioBuffer[0] === 0x49 && audioBuffer[1] === 0x44 && audioBuffer[2] === 0x33;
    const isSync = audioBuffer[0] === 0xFF && (audioBuffer[1] & 0xE0) === 0xE0;
    console.log('   Валидный MP3 (ID3 header):', isID3 ? '✅ YES' : 'NO');
    console.log('   Валидный MP3 (sync bits):', isSync ? '✅ YES' : 'NO');

    // Сохраняем файл
    const audioDir = path.join(__dirname, 'Audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

    const outputPath = path.join(audioDir, 'test_voice_result.mp3');
    fs.writeFileSync(outputPath, audioBuffer);

    console.log('');
    console.log('💾 Файл сохранён:', outputPath);
    console.log('   Размер:', fs.statSync(outputPath).size, 'байт');

    if (isID3 || isSync) {
      console.log('');
      console.log('✅ УСПЕХ! Валидный MP3 файл создан и готов к воспроизведению.');
    } else {
      console.log('');
      console.log('⚠️  ВНИМАНИЕ: Файл сохранён, но не похож на MP3.');
      console.log('   Проверьте формат ответа API выше.');
    }

  } catch (error) {
    console.error('');
    console.error('❌ ОШИБКА:', error.message);
    if (error.response) {
      console.error('   HTTP Status:', error.response.status);
      const errData = error.response.data;
      if (Buffer.isBuffer(errData) || errData instanceof ArrayBuffer) {
        console.error('   Response:', Buffer.from(errData).toString('utf8').substring(0, 800));
      } else {
        console.error('   Response:', JSON.stringify(errData).substring(0, 800));
      }
    }
    process.exit(1);
  }
}

testVoice();