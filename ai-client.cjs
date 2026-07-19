const fs = require('fs');
const path = require('path');
const { request } = require('undici');
const axios = require('axios'); // For VoiceAPI

// Import G-Labs handlers for proxying Image and Video generation
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

class AntigravityClient {
    constructor() {
        console.log('[AiClient] Initialized Antigravity Unified Client');
    }

    // =========================================================================
    // 1. CHAT / TEXT GENERATION
    // =========================================================================
    async chat(messages, jsonMode = false, forcedProvider = null) {
        const providers = [];

        // 1. Qwen
        if (process.env.QWEN_API_KEY) {
            providers.push({
                id: 'qwen',
                url: process.env.QWEN_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
                key: process.env.QWEN_API_KEY,
                model: 'qwen/qwen3.5-397b-a17b'
            });
        }

        // 2. Kimi
        if (process.env.KIMI_API_KEY) {
            providers.push({
                id: 'kimi',
                url: process.env.KIMI_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
                key: process.env.KIMI_API_KEY,
                model: 'moonshotai/kimi-k2.5'
            });
        }

        // 3. Mimo
        if (process.env.MIMO_API_KEY) {
            providers.push({
                id: 'mimo',
                url: process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions',
                key: process.env.MIMO_API_KEY,
                model: 'mimo-v2.5-pro',
                isMimo: true
            });
        }

        // 4. Custom Local Proxy
        if (process.env.CUSTOM_AI_URL) {
            const WORKING_MODELS = ['gemini-3.1-pro-high'];
            for (const m of WORKING_MODELS) {
                providers.push({
                    id: 'custom',
                    url: process.env.CUSTOM_AI_URL,
                    key: process.env.CUSTOM_AI_API_KEY,
                    model: m
                });
            }
        }

        // 5. Pollinations Fallback
        providers.push({
            id: 'pollinations',
            url: process.env.POLLINATIONS_API_URL || 'https://gen.pollinations.ai/v1/chat/completions',
            key: process.env.POLLINATIONS_API_KEY,
            model: 'openai-large'
        });

        const defaultProvider = forcedProvider || process.env.DEFAULT_AI_PROVIDER || 'pollinations';
        providers.sort((a, b) => {
            if (a.id === defaultProvider && b.id !== defaultProvider) return -1;
            if (b.id === defaultProvider && a.id !== defaultProvider) return 1;
            return 0;
        });

        let lastError = null;
        let proxyDisabled = false;

        for (const p of providers) {
            if (p.id === 'custom' && proxyDisabled) continue;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    console.log(`[AiClient:Chat] Trying provider=${p.id} model=${p.model} at ${p.url} (attempt ${attempt})`);
                    const reqBody = { model: p.model, messages };
                    if (jsonMode) reqBody.response_format = { type: 'json_object' };

                    const headers = { 'Content-Type': 'application/json' };
                    if (p.key) {
                        if (p.isMimo) {
                            headers['api-key'] = p.key;
                        } else {
                            headers['Authorization'] = `Bearer ${p.key}`;
                        }
                    }

                    const res = await fetch(p.url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(reqBody)
                    });

                    const text = await res.text();
                    if (res.ok) {
                        const data = JSON.parse(text);
                        return data.choices?.[0]?.message?.content || '';
                    }
                    
                    const statusCode = res.status;
                    console.warn(`[AiClient:Chat] provider=${p.id} model=${p.model} failed with ${statusCode}: ${text.substring(0, 100)}`);
                    
                    if (statusCode === 503 && text.includes('Proxy service is currently disabled')) {
                         console.warn(`[AiClient:Chat] Local Proxy is disabled, skipping remaining local models!`);
                         proxyDisabled = true;
                         break;
                    }
                    if (statusCode === 402) {
                         console.warn(`[AiClient:Chat] Insufficient balance for ${p.id}, skipping remaining attempts.`);
                         break;
                    }
                } catch (e) {
                    console.error(`[AiClient:Chat] Error with provider=${p.id} model=${p.model}: ${e.message}`);
                    lastError = e;
                }
                if (!proxyDisabled && attempt < 2) await new Promise(r => setTimeout(r, 1000));
            }
        }
        throw lastError || new Error('All models exhausted or failed');
    }

    // =========================================================================
    // 2. AUDIO TRANSCRIPTION / STT
    // =========================================================================
    async _transcribeAudioGemini(audioPath, model) {
        const audioBuffer = fs.readFileSync(audioPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
            audioBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
        ]);

        const apiKey = process.env.CUSTOM_AI_API_KEY || process.env.GEMINI_API_KEY || 'dummy-key';
        console.log(`[AiClient:STT] Sending audio to Custom STT (model: ${model})...`);
        const { statusCode, body: resBody } = await request('http://127.0.0.1:8045/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Authorization': `Bearer ${apiKey}`
            },
            body,
            headersTimeout: 180000,
            bodyTimeout: 180000
        });

        const rawText = await resBody.text();
        if (statusCode !== 200) {
            throw new Error(`Custom Transcription failed (${statusCode}): ${rawText.substring(0, 200)}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Custom Transcription response is not valid JSON: ${rawText.substring(0, 200)}`);
        }

        if (!data.words || data.words.length === 0) {
            throw new Error("Custom Transcription missing 'words' timestamps. Diarization requires word-level timestamps.");
        }

        console.log(`[AiClient:STT] Custom Transcription complete: ${data.words.length} words`);
        return {
            text: data.text || '',
            words: data.words.map(w => ({
                start: w.start || 0,
                end: w.end || 0,
                word: w.word || ''
            }))
        };
    }

    async _transcribeAudioPollinations(audioPath) {
        const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
        const audioBuffer = fs.readFileSync(audioPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
            audioBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nscribe\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
        ]);

        console.log('[AiClient:STT] Sending audio to Pollinations for transcription...');
        const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body,
            headersTimeout: 180000,
            bodyTimeout: 180000
        });

        const rawText = await resBody.text();
        if (statusCode !== 200) {
            throw new Error(`Pollinations Transcription failed (${statusCode}): ${rawText.substring(0, 200)}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Pollinations Transcription response is not valid JSON: ${rawText.substring(0, 200)}`);
        }

        console.log(`[AiClient:STT] Pollinations Transcription complete: ${data.words?.length || 0} words`);
        return {
            text: data.text || '',
            words: (data.words || []).map(w => ({
                start: w.start || 0,
                end: w.end || 0,
                word: w.word || ''
            }))
        };
    }

    async transcribe(audioPath, retries = 3) {
        let customLastError = null;

        // Try custom service 3 times
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[AiClient:STT] Custom STT: Waiting 2 seconds before retry attempt ${attempt}...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
                return await this._transcribeAudioGemini(audioPath, 'gemini-2.5-flash');
            } catch (e) {
                console.error(`[AiClient:STT] Custom STT attempt ${attempt} failed: ${e.message}`);
                customLastError = e;
            }
        }

        console.warn('[AiClient:STT] Custom STT failed 3 times. Falling back to Pollinations...');

        let pollLastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[AiClient:STT] Pollinations STT: Waiting 6 seconds before retry attempt ${attempt}...`);
                    await new Promise(r => setTimeout(r, 6000));
                }
                return await this._transcribeAudioPollinations(audioPath);
            } catch (e) {
                console.error(`[AiClient:STT] Pollinations STT attempt ${attempt} failed: ${e.message}`);
                pollLastError = e;
            }
        }

        throw new Error(`Both custom STT and Pollinations failed. Last Pollinations error: ${pollLastError?.message}`);
    }

    // =========================================================================
    // 3. VOICE SYNTHESIS / TTS
    // =========================================================================
    async _synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
        const apiKey = process.env.ElevenLabs_API;
        if (!apiKey) throw new Error('[AiClient:Voice] ElevenLabs_API key not set');

        console.log(`[AiClient:Voice] Direct ElevenLabs TTS: voice=${voiceId} text=${text.length}chars`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
                text: text,
                model_id: options.model_id || 'eleven_multilingual_v2',
                voice_settings: {
                    stability: options.stability ?? 0.85,
                    similarity_boost: options.similarity_boost ?? 0.75,
                    style: options.style ?? 0.0,
                    use_speaker_boost: options.use_speaker_boost !== false
                }
            },
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );

        const buf = Buffer.from(response.data);
        if (buf.length < 100) throw new Error(`[AiClient:Voice] Direct ElevenLabs result too small: ${buf.length}B`);
        
        const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
        const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
        if (!isID3 && !isSync) {
            throw new Error(`[AiClient:Voice] Direct ElevenLabs returned invalid audio buffer`);
        }

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, buf);
        console.log(`[AiClient:Voice] Direct ElevenLabs Saved: ${outputPath} (${buf.length}B)`);
        return outputPath;
    }

    async _synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
        if (process.env.ElevenLabs_API) {
            return await this._synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
        }
        const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
        const templateId = process.env.UUID;
        if (!apiKey) throw new Error('[AiClient:Voice] VOICEAPI_KEY not set');
        if (!templateId) throw new Error('[AiClient:Voice] UUID not set for Lumean Template');

        const LUMEAN_BASE = 'https://api.lumean.app/api/public';
        const hdrs = {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json'
        };

        const body = {
            template_id: templateId,
            input_text: text
        };

        console.log(`[AiClient:Voice] POST /orders template=${templateId} text=${text.length}chars`);
        const cr = await axios.post(`${LUMEAN_BASE}/orders`, body, { headers: hdrs });
        const orderId = cr.data && cr.data.data && cr.data.data.id;
        if (!orderId) throw new Error('[AiClient:Voice] No order id: ' + JSON.stringify(cr.data).slice(0, 200));
        console.log(`[AiClient:Voice] order_id=${orderId}`);

        let finalOrder = null;
        for (let n = 0; n < 60; n++) {
            await new Promise(r => setTimeout(r, 2000));
            const sr = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers: hdrs });
            const st = ((sr.data.data.status || '')).toLowerCase();
            console.log(`[AiClient:Voice] order=${orderId} status=${st} (${n+1}/60)`);
            if (st === 'failed' || st === 'cancelled') throw new Error('[AiClient:Voice] Task failed: ' + JSON.stringify(sr.data).slice(0, 200));

            if (st === 'completed' || st === 'partially_completed') {
                finalOrder = sr.data.data;
                console.log(`[AiClient:Voice] Status "${st}" — downloading result`);
                break;
            }
        }
        
        if (!finalOrder) throw new Error(`[AiClient:Voice] Timeout: order ${orderId}`);

        const resultItem = finalOrder.result.files[0];
        const resultPath = typeof resultItem === 'string' ? resultItem : resultItem.path;
        
        const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: resultPath }, { headers: hdrs });
        const downloadUrl = urlRes.data.data.url;

        const ar = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        const buf = Buffer.from(ar.data);
        if (buf.length < 100) throw new Error(`[AiClient:Voice] Too small: ${buf.length}B`);
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, buf);
        console.log(`[AiClient:Voice] Saved: ${outputPath} (${buf.length}B)`);
        return outputPath;
    }

    async synthesizeVoice(text, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) {
        let activeVoice = voice;
        if (language.toLowerCase() === 'russian' || language.toLowerCase() === 'ru') {
            activeVoice = 'aeb88254-a426-47da-a7d4-f182195f9fab'; // "Alex_Ru"
        } else {
            activeVoice = 'eb21f806-58d1-46db-b346-24ea6540d0eb'; // "french" (multilingual template)
        }
        
        // Use a generic outputPath if not provided (customDir param handling legacy)
        // Actually, customDir in previous usage was meant to be outputPath directly in many cases.
        // Wait, synthesizeUnifiedSpeech signature was: (input, language, voice, model, customDir) 
        // But `synthesizeCsv666Speech` expects (text, voiceId, outputPath, options)
        // Let's preserve exactly how it was in skeleton-handlers.cjs:
        // `return await synthesizeCsv666Speech(input, activeVoice, language, customDir);`
        // So `language` was actually passed as `outputPath` to `synthesizeCsv666Speech` in some strange cases?
        // Wait, in `skeleton-handlers.cjs`:
        // const synthesizeUnifiedSpeech = async (input, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) => {
        // ...
        //     return await synthesizeCsv666Speech(input, activeVoice, language, customDir);
        // }
        // Ah! `language` parameter in `synthesizeUnifiedSpeech` was actually passed to `outputPath` in `synthesizeCsv666Speech`. That's a huge bug/quirk in the original code.
        // Let's look at `synthesizeCsv666Speech` signature: `async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {})`
        // Yes, `language` is passed as `outputPath`! 
        // Oh, wait, in previous searches I saw:
        // `await synthesizeUnifiedSpeech(text, outputPath, activeVoice);`
        // So the consumer actually passed:
        // arg1: text
        // arg2: outputPath
        // arg3: activeVoice
        // So `language` was effectively `outputPath`.
        // Let's normalize it here to avoid breaking everything, but give it a clear signature.
        let outputPath = language; 
        return await this._synthesizeCsv666Speech(text, activeVoice, outputPath, customDir || {});
    }

    async synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
        return await this._synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
    }

    // =========================================================================
    // 4. IMAGE GENERATION (Proxy to G-Labs)
    // =========================================================================
    async generateImage(options) {
        return await generateImageViaGLabs(options);
    }

    // =========================================================================
    // 5. VIDEO GENERATION (Proxy to G-Labs)
    // =========================================================================
    async generateVideo(options) {
        return await generateVideoViaGLabs(options);
    }
}

module.exports = new AntigravityClient();
