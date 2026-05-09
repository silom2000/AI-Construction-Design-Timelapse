'use strict';
/**
 * test_voice_flow.cjs — полный тест VoiseAPI: создать задачу → опросить статус → скачать результат
 * Запуск: node test_voice_flow.cjs
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');

const key = process.env.VOICEAPI_KEY;
const voiceId = process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID || 'S3EMTLF63LOyQFQA2vOC';
const BASE = 'voiceapi.csv666.ru';

function httpsRequest(method, urlPath, body, isBinary) {
    return new Promise((resolve, reject) => {
        const headers = {
            'X-API-Key': key,
            'Content-Type': 'application/json',
        };
        if (body) headers['Content-Length'] = Buffer.byteLength(body);

        const opts = { hostname: BASE, path: urlPath, method, headers };
        const req = https.request(opts, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve({ status: res.statusCode, headers: res.headers, buf });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log('=== VoiceAPI Full Flow Test ===');
    console.log('Key:', key ? key.substring(0, 15) + '...' : '❌ MISSING');
    console.log('VoiceId:', voiceId);
    console.log('');

    if (!key) { console.error('VOICEAPI_KEY not in .env'); process.exit(1); }

    // Step 1: Create task
    const taskBody = JSON.stringify({
        template: {
            model_id: 'eleven_multilingual_v2',
            voice_id: voiceId,
            voice_settings: { stability: 0.85, similarity_boost: 0.75, use_speaker_boost: true, style: 0, speed: 1 },
            voice_result_type: 'default'
        },
        text: 'Привет мир.',
        task_type: 'default'
    });

    console.log('[1] POST /tasks...');
    const cr = await httpsRequest('POST', '/tasks', taskBody);
    console.log(`    HTTP ${cr.status}`);
    const crText = cr.buf.toString('utf8');
    console.log('    Body:', crText.substring(0, 300));

    let taskId;
    try {
        const j = JSON.parse(crText);
        taskId = j.task_id || j.id;
    } catch(e) { console.error('Parse error'); process.exit(1); }
    console.log('    task_id:', taskId);
    console.log('');

    // Step 2: Poll /tasks/{id}/status
    console.log('[2] Polling /tasks/' + taskId + '/status ...');
    for (let i = 0; i < 40; i++) {
        await sleep(3000);
        const sr = await httpsRequest('GET', `/tasks/${taskId}/status`, null);
        const st = sr.buf.toString('utf8');
        console.log(`    [${i+1}] HTTP ${sr.status} → ${st.substring(0, 200)}`);

        let statusVal = '';
        try { statusVal = (JSON.parse(st).status || '').toLowerCase(); } catch(e) {}

        if (statusVal === 'error' || statusVal === 'error_handled') {
            console.log('    ❌ Error status');
            break;
        }
        if (statusVal === 'ending' || statusVal === 'ending_processed') {
            console.log('    ✅ Ready! Downloading result...');
            console.log('');

            // Step 3a: GET /tasks/{id}/result
            console.log('[3a] GET /tasks/' + taskId + '/result ...');
            const rr = await httpsRequest('GET', `/tasks/${taskId}/result`, null, true);
            console.log(`    HTTP ${rr.status}`);
            console.log('    Content-Type:', rr.headers['content-type']);
            console.log('    Content-Length:', rr.headers['content-length']);
            console.log('    Size:', rr.buf.length, 'bytes');
            console.log('    First 32 bytes (hex):', rr.buf.slice(0, 32).toString('hex'));
            console.log('    First 200 bytes (utf8 attempt):', rr.buf.slice(0, 200).toString('utf8'));

            const isID3  = rr.buf[0] === 0x49 && rr.buf[1] === 0x44 && rr.buf[2] === 0x33;
            const isSync = rr.buf[0] === 0xFF && (rr.buf[1] & 0xE0) === 0xE0;
            console.log('    isID3:', isID3, '  isSync:', isSync);

            if (isID3 || isSync) {
                const outPath = path.join(__dirname, 'Audio', 'test_flow_result.mp3');
                if (!fs.existsSync(path.join(__dirname, 'Audio'))) fs.mkdirSync(path.join(__dirname, 'Audio'));
                fs.writeFileSync(outPath, rr.buf);
                console.log('    ✅ Saved valid MP3:', outPath);
            } else {
                // Might be JSON with URL
                try {
                    const j = JSON.parse(rr.buf.toString('utf8'));
                    console.log('    📄 JSON response:', JSON.stringify(j, null, 2).substring(0, 500));
                    const audioUrl = j.audio_url || j.url || j.result_url ||
                        (j.result && (j.result.audio_url || j.result.url));
                    const audioB64 = j.audio || j.audio_base64 ||
                        (j.result && (j.result.audio || j.result.audio_base64));
                    
                    if (audioUrl) {
                        console.log('    → Found audio URL:', audioUrl);
                        // Download it
                        const urlObj = new URL(audioUrl);
                        const dr = await new Promise((resolve, reject) => {
                            https.get(audioUrl, (res) => {
                                const chunks = [];
                                res.on('data', c => chunks.push(c));
                                res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks), headers: res.headers }));
                            }).on('error', reject);
                        });
                        console.log('    Download HTTP', dr.status, 'Size:', dr.buf.length);
                        console.log('    First bytes (hex):', dr.buf.slice(0, 16).toString('hex'));
                        if (dr.buf[0] === 0x49 || dr.buf[0] === 0xFF) {
                            const outPath = path.join(__dirname, 'Audio', 'test_flow_result.mp3');
                            fs.writeFileSync(outPath, dr.buf);
                            console.log('    ✅ Saved MP3 from URL:', outPath);
                        }
                    } else if (audioB64) {
                        console.log('    → Found base64 audio, decoding...');
                        const buf = Buffer.from(audioB64, 'base64');
                        console.log('    Decoded size:', buf.length, 'bytes');
                        console.log('    First bytes (hex):', buf.slice(0, 16).toString('hex'));
                        const outPath = path.join(__dirname, 'Audio', 'test_flow_result.mp3');
                        fs.writeFileSync(outPath, buf);
                        console.log('    ✅ Saved MP3 from base64:', outPath);
                    } else {
                        console.log('    ❌ No audio found in JSON');
                    }
                } catch(e) {
                    console.log('    ❌ Not JSON, not MP3. Unknown format.');
                }
            }
            break;
        }
    }

    // Step 3b: Also try polling /tasks/{id} directly
    console.log('');
    console.log('[3b] GET /tasks/' + taskId + ' (direct task query)...');
    const tr = await httpsRequest('GET', `/tasks/${taskId}`, null);
    console.log(`    HTTP ${tr.status}`);
    console.log('    Body:', tr.buf.toString('utf8').substring(0, 500));
}

main().catch(e => console.error('Fatal:', e.message));