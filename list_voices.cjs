'use strict';
/**
 * list_voices.cjs — получение списка доступных голосов через VoiseAPI
 * 
 * API: GET /shared-voices?page=0&page_size=30&search={query}
 * 
 * Запуск: node list_voices.cjs [search_query]
 * Примеры:
 *   node list_voices.cjs                    - список первых 30 голосов
 *   node list_voices.cjs "Rachel"           - поиск голоса "Rachel"
 *   node list_voices.cjs "y1adqrqs4jNaAN"  - поиск по voice_id
 */

const axios = require('axios');

require('dotenv').config();

const VOICE_AI_KEY = process.env.VOICE_AI_KEY;
const VOISE_API_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';

async function listVoices(searchQuery = '', page = 0, pageSize = 30) {
  if (!VOICE_AI_KEY) {
    console.error('ERROR: VOICE_AI_KEY не установлен в .env');
    process.exit(1);
  }

  const headers = {
    'Authorization': `Bearer ${VOICE_AI_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString()
    });

    if (searchQuery) {
      params.set('search', searchQuery);
    }

    console.log(`🔍 Поиск голосов: "${searchQuery || 'все'}" (страница ${page})...`);
    console.log(`URL: ${VOISE_API_BASE}/shared-voices?${params}`);
    console.log('');

    const resp = await axios.get(
      `${VOISE_API_BASE}/shared-voices?${params}`,
      { headers }
    );

    const data = resp.data;
    const voices = data.voices || data || [];

    if (!Array.isArray(voices) || voices.length === 0) {
      console.log('Голосов не найдено.');
      console.log('Полный ответ:', JSON.stringify(data, null, 2));
      return;
    }

    console.log(`Найдено голосов: ${voices.length}\n`);
    console.log('Для добавления в .env: VOICE_ID=<voice_id>\n');
    console.log('─'.repeat(80));

    for (const voice of voices) {
      // Поля могут отличаться в зависимости от API
      const voiceId = voice.voice_id || voice.id || 'unknown';
      const name = voice.name || voice.voice_name || 'unknown';
      const ownerId = voice.public_owner_id || voice.owner_id || '';
      const category = voice.category || voice.type || '';
      const lang = voice.language || voice.labels?.language || '';
      const gender = voice.gender || voice.labels?.gender || '';

      console.log(`Voice ID: ${voiceId}`);
      if (name !== 'unknown') console.log(`  Имя:     ${name}`);
      if (category) console.log(`  Тип:     ${category}`);
      if (lang) console.log(`  Язык:    ${lang}`);
      if (gender) console.log(`  Пол:     ${gender}`);
      if (ownerId) console.log(`  Owner:   ${ownerId}`);
      console.log('');
    }

    console.log('─'.repeat(80));
    console.log(`\nПример использования в .env:`);
    if (voices.length > 0) {
      const first = voices[0];
      const firstId = first.voice_id || first.id || 'your_voice_id_here';
      const firstOwner = first.public_owner_id || first.owner_id || '';
      console.log(`VOICE_ID=${firstId}`);
      if (firstOwner) {
        console.log(`\nПример шаблона для story-handlers.cjs:`);
        console.log(JSON.stringify({
          template: {
            model_id: 'eleven_multilingual_v2',
            voice_id: firstId,
            public_owner_id: firstOwner,
            voice_settings: {
              stability: 0.85,
              similarity_boost: 0.75,
              use_speaker_boost: true,
              style: 0.0,
              speed: 1.0
            }
          }
        }, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      const d = error.response.data;
      console.error('   Response:', Buffer.isBuffer(d) ? d.toString('utf8').substring(0, 800) : JSON.stringify(d).substring(0, 800));
    }
  }
}

// Аргумент командной строки как поисковый запрос
const searchArg = process.argv[2] || '';
listVoices(searchArg);