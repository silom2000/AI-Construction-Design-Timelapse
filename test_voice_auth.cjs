'use strict';
const https = require('https');
const fs = require('fs');

require('./node_modules/dotenv/config.js').config?.() || require('dotenv').config();

const key = process.env.VOICEAPI_KEY || '866296891:6d5361454a6b525a52332b6173746332692f617a78513d3d';
const voiceId = process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID || 'S3EMTLF63LOyQFQA2vOC';

const body = JSON.stringify({
    template: {
        model_id: 'eleven_multilingual_v2',
        voice_id: voiceId,
        voice_settings: { stability: 0.85, similarity_boost: 0.75, use_speaker_boost: true, style: 0, speed: 1 },
        voice_result_type: 'default'
    },
    text: 'Test',
    task_type: 'default'
});

const results = [];

async function testAuth(label, headers, useQuery) {
    return new Promise((resolve) => {
        const queryStr = useQuery ? `?api_key=${encodeURIComponent(key)}` : '';
        const options = {
            hostname: 'voiceapi.csv666.ru',
            path: `/tasks${queryStr}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...headers
            }
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                results.push(`${label}: HTTP ${res.statusCode} → ${data.substring(0, 150)}`);
                resolve();
            });
        });
        req.on('error', e => { results.push(`${label}: ERROR ${e.message}`); resolve(); });
        req.write(body);
        req.end();
    });
}

(async () => {
    await testAuth('Bearer', { 'Authorization': `Bearer ${key}` }, false);
    await testAuth('Raw-Auth', { 'Authorization': key }, false);
    await testAuth('X-API-Key', { 'X-API-Key': key }, false);
    await testAuth('Query-param', {}, true);
    await testAuth('Bearer+Query', { 'Authorization': `Bearer ${key}` }, true);
    await testAuth('X-API-Key+Query', { 'X-API-Key': key }, true);
    
    // Also fetch the openapi spec
    await new Promise((resolve) => {
        https.get('https://voiceapi.csv666.ru/openapi.json', (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                try {
                    const spec = JSON.parse(data);
                    const security = spec.components?.securitySchemes || spec.securityDefinitions || {};
                    results.push('\n=== API Security Schemes ===');
                    results.push(JSON.stringify(security, null, 2).substring(0, 1000));
                } catch(e) {
                    results.push('\nOpenAPI spec parse error: ' + data.substring(0, 200));
                }
                resolve();
            });
        }).on('error', e => { results.push('OpenAPI fetch error: ' + e.message); resolve(); });
    });

    fs.writeFileSync('D:/Open_Project/kimi/voice_auth_test.txt', results.join('\n'));
    console.log('=== RESULTS ===');
    results.forEach(r => console.log(r));
})();