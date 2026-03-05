// ============ SKELETON SHORTS — WAN V2.6 720P ============
const path = require('path');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { spawn, execSync } = require('child_process');
const { request } = require('undici');
const crypto = require('crypto');
const streamPipeline = promisify(pipeline);
const freepikKeys = require('./freepik-key-manager.cjs');
const historyManager = require('./history-manager.cjs');
const { pipeline: _pipeline } = require('stream');

const LANG_NAMES = {
    // short codes
    en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
    ru: 'Russian', pl: 'Polish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    // full names (from StudioTab language selector)
    English: 'English', Russian: 'Russian', French: 'French', German: 'German',
    Spanish: 'Spanish', Polish: 'Polish', Italian: 'Italian', Portuguese: 'Portuguese'
};

// ------------- Phase 1: Voice API (csv666) -------------
const synthesizeCsv666Speech = async (input, templateUuid = 'eb21f806-58d1-46db-b346-24ea6540d0eb') => {
    const apiKey = process.env.VOICEAPI_KEY?.trim();
    const audioDir = path.join(__dirname, 'Audio');
    if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

    const hashString = `${input}_${templateUuid}`;
    const inputHash = crypto.createHash('md5').update(hashString).digest('hex').substring(0, 12);
    const outputPath = path.join(audioDir, `speech_csv666_${inputHash}.mp3`);
    const mediaUrl = `media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

    if (fs.existsSync(outputPath)) {
        console.log(`[Csv666 Speech] Using cached audio: ${outputPath}`);
        return mediaUrl;
    }

    const baseUrl = 'https://voiceapi.csv666.ru';

    try {
        console.log(`[Csv666 Speech] Creating task for text: ${input.substring(0, 50)}...`);
        const { statusCode: cs, body: cb } = await request(`${baseUrl}/tasks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                template_uuid: templateUuid,
                text: input,
                chunk_size: 500,
                pause_settings: { auto_paragraph_pause: false, enabled: false, max_pause_symb: 2000, pause_time: 1 },
                stress_settings: { enabled: false }
            })
        });

        const taskText = await cb.text();
        if (cs !== 200) throw new Error(`Csv666 createTask failed (${cs}): ${taskText}`);
        const taskData = JSON.parse(taskText);
        const taskId = taskData.task_id;

        // Poll status
        let status = 'processing';
        for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 5000));
            const { statusCode: ss, body: sb } = await request(`${baseUrl}/tasks/${taskId}/status`, {
                headers: { 'X-API-Key': apiKey }
            });
            const sText = await sb.text();
            const sData = JSON.parse(sText);
            status = (sData.status || sData.state || '').toLowerCase();
            console.log(`[Csv666 Speech] Poll ${i + 1}: status="${status}"`);

            if (status === 'done' || status === 'completed' || status === 'ending') break;
            if (status === 'failed' || status === 'error') throw new Error(`Csv666 task failed: ${sText}`);
        }

        // Get result
        console.log(`[Csv666 Speech] Fetching result for task ${taskId}...`);
        const { statusCode: rs, body: rb } = await request(`${baseUrl}/tasks/${taskId}/result`, {
            headers: { 'Accept': 'application/json', 'X-API-Key': apiKey }
        });

        const chunks = [];
        for await (const chunk of rb) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (rs !== 200) throw new Error(`Csv666 getResult failed (${rs})`);

        // Check if we got JSON or binary MP3
        if (buffer.slice(0, 3).toString() === 'ID3' || buffer.slice(0, 2).toString('hex') === 'fffb') {
            console.log(`[Csv666 Speech] Received binary audio directly from result endpoint.`);
            fs.writeFileSync(outputPath, buffer);
            console.log(`[Csv666 Speech] Saved: ${outputPath}`);
            return mediaUrl;
        }

        let resultData;
        try {
            resultData = JSON.parse(buffer.toString());
        } catch (e) {
            console.error(`[Csv666 Speech] Failed to parse result as JSON. Buffer preview: ${buffer.slice(0, 50).toString('hex')}`);
            throw new Error(`Csv666 result not valid JSON or MP3: ${buffer.slice(0, 50).toString()}`);
        }

        const audioUrl = resultData.audio_url || resultData.result_url || resultData.url;
        if (!audioUrl) throw new Error(`Csv666 result missing audio URL: ${JSON.stringify(resultData)}`);

        // Download from URL if JSON was returned
        console.log(`[Csv666 Speech] Downloading audio from: ${audioUrl}`);
        const { body: ab } = await request(audioUrl);
        const finalChunks = [];
        for await (const chunk of ab) finalChunks.push(chunk);
        fs.writeFileSync(outputPath, Buffer.concat(finalChunks));
        console.log(`[Csv666 Speech] Saved: ${outputPath}`);
        return mediaUrl;

    } catch (e) {
        console.error(`[Csv666 Speech] Error: ${e.message}`);
        throw e;
    }
};

// ------------- Phase 2: Unified TTS (Pollinations) -------------
const synthesizeUnifiedSpeech = async (input, language = 'en', voice = 'eb21f806-58d1-46db-b346-24ea6540d0eb', model = 'csv666') => {
    // Force use of csv666 as requested
    return await synthesizeCsv666Speech(input, voice);
};

const CHARACTER_ANCHOR = `A full-body realistic humanoid SKELETON character with a semi-transparent human-shaped outer body shell. The character has: A fully exposed skull (NO skin, NO face, NO muscles). Clean, smooth, anatomically accurate skull. Large, round eye sockets with visible eyeballs. Bright yellow irises with dark pupils. Neutral to slightly vacant expression. Visible upper and lower teeth. Smooth cranium with no cracks, damage, decay, or horror elements. The body is a semi-transparent, glass-like human silhouette that clearly reveals the entire internal skeletal structure from head to toe. Skeleton details: Ivory / pale beige bones. Smooth, medical-grade surfaces. Accurate human proportions. Clearly defined rib cage, spine, pelvis, arms, hands, legs, knees, ankles, and feet. All joints, vertebrae, and phalanges visible and anatomically correct. No muscles. No veins. No organs. No skin texture. The style is: High-end medical visualization, Clean, clinical, modern. NOT horror. NOT zombie. NOT cartoon. NOT decayed.`;

// ── Pollinations helper ───────────────────────────────────────────────────────
const WORKING_TEXT_MODELS = ['gemini-3-flash', 'gemini-3.1-pro', 'gpt-4o', 'claude-3-5-sonnet-20241022', 'gpt-4-turbo'];

const callPollinations = async (messages, jsonMode = false) => {
    const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
    const customUrl = process.env.CUSTOM_AI_URL?.trim();
    const pollKey = process.env.POLLINATIONS_API_KEY?.trim();
    const pollUrl = 'https://gen.pollinations.ai/v1/chat/completions';

    // Rotation logic: try custom models first, then fallback to Pollinations
    // Ensure gemini-3-flash is the top priority if custom service is available
    const WORKING_MODELS = ['gemini-3-flash', 'gemini-3.1-pro', 'gpt-4o', 'claude-3-5-sonnet-20241022', 'gpt-4-turbo'];
    const modelsToTry = customUrl ? [...WORKING_MODELS, 'openai-large'] : ['openai-large'];

    let lastError = null;
    for (const model of modelsToTry) {
        // Determine endpoint and key for this model
        const isCustomModel = WORKING_MODELS.includes(model);
        const apiUrl = isCustomModel && customUrl ? customUrl : pollUrl;
        const apiKey = isCustomModel && customUrl ? customKey : pollKey;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[AI Call] Trying model=${model} at ${apiUrl} (attempt ${attempt})`);
                const reqBody = { model, messages };
                if (jsonMode) reqBody.response_format = { type: 'json_object' };

                const { statusCode, body: resBody } = await request(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                    },
                    body: JSON.stringify(reqBody)
                });

                const text = await resBody.text();
                if (statusCode === 200) {
                    const data = JSON.parse(text);
                    return data.choices?.[0]?.message?.content || '';
                }
                console.warn(`[AI Call] model=${model} failed with ${statusCode}: ${text.substring(0, 100)}`);
            } catch (e) {
                console.error(`[AI Call] Error with model=${model}: ${e.message}`);
                lastError = e;
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw lastError || new Error('All models exhausted or failed');
};

// ── Image via Pollinations ────────────────────────────────────────────────────
const IMAGE_MODELS_FALLBACK = ['imagen-4', 'flux', 'zimage'];

const createImageViaAntigravity = async (prompt, outputPath) => {
    const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
    // The user provided URL: http://166.1.60.73:8045/v1
    // We already have CUSTOM_AI_URL=http://166.1.60.73:8045/v1/chat/completions
    const customUrl = (process.env.CUSTOM_AI_URL?.trim() || 'http://166.1.60.73:8045/v1/chat/completions').replace('/chat/completions', '');
    const apiUrl = `${customUrl}/chat/completions`;

    console.log(`[Skeleton Antigravity] model=gemini-3-pro-image prompt="${prompt.substring(0, 50)}..."`);

    try {
        const { statusCode, body } = await request(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(customKey ? { 'Authorization': `Bearer ${customKey}` } : {})
            },
            body: JSON.stringify({
                model: 'gemini-3-pro-image-preview',
                extra_body: { "size": "1024x1024" },
                messages: [{ role: 'user', content: prompt }]
            })
        });

        const resText = await body.text();
        if (statusCode !== 200) throw new Error(`Antigravity API failed (${statusCode}): ${resText}`);

        const data = JSON.parse(resText);
        const imageUrl = data.choices?.[0]?.message?.content;

        if (!imageUrl || !imageUrl.startsWith('http')) {
            throw new Error(`Antigravity API returned invalid URL: ${resText.substring(0, 200)}`);
        }

        console.log(`[Skeleton Antigravity] Downloading 1:1 image: ${imageUrl}`);
        const tempPath = outputPath.replace('.jpg', '_temp_1_1.jpg');
        const { body: imageBody } = await request(imageUrl);
        const chunks = [];
        for await (const chunk of imageBody) chunks.push(chunk);
        fs.writeFileSync(tempPath, Buffer.concat(chunks));

        // Now crop 1:1 (1024x1024) to 9:16 (576x1024 center)
        // 1024 / (16/9) = 576
        console.log(`[Skeleton Antigravity] Cropping 1:1 → 9:16 (center)...`);
        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', tempPath,
                '-vf', 'crop=576:1024:(in_w-576)/2:0',
                '-y', outputPath
            ]);
            ffmpeg.on('close', code => {
                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                if (code === 0) {
                    console.log(`[Skeleton Antigravity] Saved & Cropped: ${outputPath}`);
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFmpeg cropping failed with code ${code}`));
                }
            });
        });

    } catch (e) {
        console.error(`[Skeleton Antigravity] Failed: ${e.message}`);
        throw e;
    }
};

const createImageViaFreepik = async (prompt, outputPath, model = 'mystic') => {
    console.log(`[Skeleton Freepik] model=${model} prompt="${prompt.substring(0, 50)}..."`);

    const isMystic = model === 'mystic';
    const baseUrl = isMystic
        ? 'https://api.freepik.com/v1/ai/mystic'
        : `https://api.freepik.com/v1/ai/text-to-image/${model}`;

    const payload = isMystic ? {
        prompt,
        num_images: 1,
        image: { size: 'portrait_9_16' }
    } : {
        prompt,
        num_images: 1,
        aspect_ratio: 'portrait_3_4'
    };

    try {
        const { text: responseText } = await freepikRequest(baseUrl, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = JSON.parse(responseText);
        let imageUrl = null;
        const taskId = data.data?.task_id || data.data?.id || data.task_id || data.id;

        if (taskId) {
            console.log(`[Skeleton Freepik] Task created: ${taskId}. Polling...`);
            let completed = false;
            let attempts = 0;
            const maxAttempts = 60; // 5 minutes

            while (!completed && attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));

                const { text: statusText } = await freepikRequest(`${baseUrl}/${taskId}`, {
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                });
                const statusData = JSON.parse(statusText);
                const d = statusData.data || statusData;
                const state = (d.status || d.state || '').toUpperCase();

                console.log(`[Skeleton Freepik] Task ${taskId} state: ${state} (${attempts}/${maxAttempts})`);

                if (state === 'COMPLETED' || state === 'SUCCESS') {
                    imageUrl = d.generated?.[0]?.url || d.generated?.[0] || d.url || (d.images && d.images[0]?.url);
                    completed = true;
                } else if (state === 'FAILED' || state === 'ERROR') {
                    throw new Error(`Freepik task failed: ${state}`);
                }
            }
            if (!imageUrl && !completed) throw new Error('Freepik image generation timeout');
        } else {
            // Check if it returned URL directly (some models might)
            imageUrl = data.data?.[0]?.url || data.url || (data.images && data.images[0]?.url);
        }

        if (!imageUrl) {
            throw new Error(`Freepik API returned no image URL: ${responseText.substring(0, 200)}`);
        }

        console.log(`[Skeleton Freepik] Downloading: ${imageUrl}`);
        const { body } = await request(imageUrl);
        const chunks = [];
        for await (const chunk of body) chunks.push(chunk);
        fs.writeFileSync(outputPath, Buffer.concat(chunks));

        return outputPath;
    } catch (e) {
        console.error(`[Skeleton Freepik] Failed: ${e.message}`);
        throw e;
    }
};

const createImageViaPollinations = async (prompt, outputPath, aspectRatio = '9:16', primaryModel = 'imagen-4') => {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const isPortrait = aspectRatio === '9:16';
    const width = isPortrait ? 720 : 1280;
    const height = isPortrait ? 1280 : 720;

    // Create a list of models starting with the requested primary model
    const modelsToTry = [primaryModel, ...IMAGE_MODELS_FALLBACK.filter(m => m !== primaryModel)];

    let lastError = null;
    for (const model of modelsToTry) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[Skeleton IMG] model=${model} attempt ${attempt}/2`);
                const sanitizedPrompt = prompt.replace(/%/g, ' percent');
                const encodedPrompt = encodeURIComponent(sanitizedPrompt);
                const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${model}&width=${width}&height=${height}&seed=${Math.floor(Math.random() * 999999)}&enhance=false`;

                const { statusCode, body } = await request(url, {
                    method: 'GET',
                    headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}
                });

                if (statusCode === 200) {
                    const chunks = [];
                    for await (const chunk of body) chunks.push(chunk);
                    fs.writeFileSync(outputPath, Buffer.concat(chunks));
                    console.log(`[Skeleton IMG] Saved using model=${model}: ${outputPath}`);
                    return outputPath;
                } else {
                    const errText = await body.text();
                    console.warn(`[Skeleton IMG] model=${model} failed with ${statusCode}: ${errText.substring(0, 100)}`);
                    lastError = new Error(`Pollinations IMG ${statusCode}: ${errText}`);
                }
            } catch (e) {
                console.error(`[Skeleton IMG] Error with model=${model}: ${e.message}`);
                lastError = e;
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        }
        console.warn(`[Skeleton IMG] Model ${model} exhausted, trying next...`);
    }
    throw lastError || new Error('All image models exhausted or failed');
};

// ── Freepik request with automatic key rotation ───────────────────────────────
const freepikRequest = async (url, options = {}) => {
    const totalKeys = freepikKeys.totalKeys();
    let triedKeys = 0;
    let lastError = null;

    while (triedKeys < totalKeys) {
        const apiKey = freepikKeys.current();
        const keyLabel = `key ${freepikKeys.currentKeyIndex()}/${totalKeys}`;

        try {
            const { statusCode, body } = await request(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                    'x-freepik-api-key': apiKey,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json'
                }
            });
            const text = await body.text();

            if (statusCode >= 200 && statusCode < 300 && !freepikKeys.isLimitError(statusCode, text)) {
                return { statusCode, text };
            }
            freepikKeys.rotate(`HTTP ${statusCode}: ${text.substring(0, 60)}`);
            triedKeys++;
            lastError = new Error(`Freepik HTTP ${statusCode}: ${text.substring(0, 120)}`);
        } catch (e) {
            freepikKeys.rotate(e.message);
            triedKeys++;
            lastError = e;
        }
    }
    throw lastError || new Error(`All Freepik keys exhausted`);
};

// ── Upload image to ImgBB and get URL (Required for PixVerse/LTX via Freepik) ──
async function uploadToImgBB(base64Image) {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) throw new Error("IMGBB_API_KEY is missing in .env file.");

    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    // ImgBB expects 'image' and 'key' in multipart/form-data
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${apiKey}\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"\r\n\r\n${base64Image}\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
    ]);

    const { statusCode, body: resBody } = await request('https://api.imgbb.com/1/upload', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body
    });

    const text = await resBody.text();
    const data = JSON.parse(text);
    if (statusCode === 200 && data.data && data.data.url) {
        return data.data.url;
    } else {
        throw new Error(`ImgBB Upload Failed: ${data.error?.message || text}`);
    }
}

// ── Unified Freepik Video Generation (with auto-retry on FAILED) ──────────────
async function createVideoViaFreepik(model, prompt, sceneIndex, event, options = {}) {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const imagePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

    // Model endpoints mapping
    const endpoints = {
        'pixverse-v5': { create: '/ai/image-to-video/pixverse-v5', get: '/ai/image-to-video/pixverse-v5' },
        'wan-v2-6-720p': { create: '/ai/image-to-video/wan-v2-6-720p', get: '/ai/image-to-video/wan-v2-6-720p' },
        'kling-v2-1-pro': { create: '/ai/image-to-video/kling-v2-1-pro', get: '/ai/image-to-video/kling-v2-1' }
    };

    const MAX_TASK_RETRIES = 3; // How many times to re-submit the task if it FAILs
    let lastError = null;

    for (let taskAttempt = 1; taskAttempt <= MAX_TASK_RETRIES; taskAttempt++) {
        // On repeated failures of pixverse-v5, fall back to wan
        const activeModel = (taskAttempt > 1 && model === 'pixverse-v5') ? 'wan-v2-6-720p' : model;
        if (taskAttempt > 1) {
            console.warn(`[Freepik Video] Task attempt ${taskAttempt}/${MAX_TASK_RETRIES} for scene ${sceneIndex + 1} using model=${activeModel}. Previous error: ${lastError?.message}`);
            await new Promise(r => setTimeout(r, 5000)); // brief pause before retry
        }

        const endpoint = endpoints[activeModel] || { create: `/ai/image-to-video/${activeModel}`, get: `/ai/image-to-video/${activeModel}` };
        const createUrl = `https://api.freepik.com/v1${endpoint.create}`;
        const getUrlBase = `https://api.freepik.com/v1${endpoint.get}`;

        try {
            let imageUrl = null;
            // PixVerse and LTX need a public URL
            if (activeModel === 'pixverse-v5' || activeModel.includes('ltx')) {
                if (!fs.existsSync(imagePath)) throw new Error(`Reference image not found: ${imagePath}`);
                console.log(`[Freepik Video] Uploading scene ${sceneIndex + 1} to ImgBB...`);
                const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                imageUrl = await uploadToImgBB(imageBase64);
            }

            const payload = {
                prompt: prompt || 'Video from image',
                duration: activeModel.includes('wan') ? '10' : '5'
            };

            if (imageUrl) {
                payload.image_url = imageUrl;
            } else if (fs.existsSync(imagePath)) {
                const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                payload.image = `data:image/jpeg;base64,${imageBase64}`;
            }

            if (activeModel === 'pixverse-v5') {
                payload.aspect_ratio = 'social_story_9_16';
                payload.resolution = '1080p';
                payload.duration = 5;
            } else if (activeModel.includes('wan') || activeModel.includes('ltx') || activeModel.includes('kling')) {
                payload.size = '720*1280';
                payload.duration = activeModel.includes('wan') ? '10' : '5';
            }

            console.log(`[Freepik Video] Creating ${activeModel} task for scene ${sceneIndex + 1}...`);
            const createResp = await freepikRequest(createUrl, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' }
            });

            const data = JSON.parse(createResp.text);
            const taskId = data.data?.task_id || data.data?.id || data.task_id || data.id;

            if (!taskId) {
                throw new Error(`No task ID in response: ${createResp.text.substring(0, 200)}`);
            }
            console.log(`[Freepik Video] Task created: ${taskId} (scene ${sceneIndex + 1})`);

            let taskFailed = false;
            for (let attempt = 1; attempt <= 120; attempt++) {
                await new Promise(r => setTimeout(r, 5000));
                let resText;
                try {
                    const { statusCode, body } = await request(`${getUrlBase}/${taskId}`, {
                        method: 'GET',
                        headers: {
                            'x-freepik-api-key': freepikKeys.current(),
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'application/json'
                        }
                    });
                    resText = await body.text();

                    if (statusCode === 401 || statusCode === 403) {
                        freepikKeys.rotate(`Poll 401/403`);
                        continue;
                    }
                } catch (pollErr) {
                    console.warn(`[Freepik Video] Poll request error (attempt ${attempt}): ${pollErr.message}`);
                    continue;
                }

                const resData = JSON.parse(resText);
                const d = resData.data || resData;
                const state = (d.status || d.state || '').toUpperCase();

                console.log(`[Freepik Video] Scene ${sceneIndex + 1} task=${taskId} state=${state} (${attempt}/120)`);
                if (event) event.sender.send('skeleton-video-progress', { sceneIndex, attempt, state, taskAttempt });

                if (state === 'COMPLETED' || state === 'SUCCESS' || state === 'SUCCEEDED') {
                    const videoUrl = d.generated?.[0]?.url || d.generated?.[0] || d.video?.url || (d.videos && d.videos[0]?.url) || (d.data && d.data.url);
                    if (!videoUrl) throw new Error(`No video URL in response: ${resText}`);

                    const videoPath = path.join(skeletonDir, `scene_${sceneIndex + 1}.mp4`);
                    console.log(`[Freepik Video] Downloading scene ${sceneIndex + 1}: ${videoUrl}`);
                    const { body: vBody } = await request(videoUrl, {
                        method: 'GET',
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': '*/*',
                            'Referer': 'https://api.freepik.com/'
                        }
                    });
                    await streamPipeline(vBody, fs.createWriteStream(videoPath));
                    return videoPath;
                }

                if (state === 'FAILED' || state === 'ERROR') {
                    lastError = new Error(`${activeModel} task FAILED (scene ${sceneIndex + 1}): ${JSON.stringify(d.error || d).substring(0, 150)}`);
                    console.warn(`[Freepik Video] ${lastError.message}. Will retry with new task (attempt ${taskAttempt}/${MAX_TASK_RETRIES})...`);
                    taskFailed = true;
                    break; // Break poll loop → retry outer task loop
                }
            }

            if (!taskFailed) {
                throw new Error(`${activeModel} timeout after 10 minutes (scene ${sceneIndex + 1})`);
            }
        } catch (e) {
            lastError = e;
            console.error(`[Freepik Video] Task attempt ${taskAttempt} error: ${e.message}`);
        }
    }

    // All retries exhausted
    console.error(`[Freepik Video] All ${MAX_TASK_RETRIES} task attempts failed for scene ${sceneIndex + 1}`);
    throw lastError || new Error(`Freepik video generation exhausted all retries (scene ${sceneIndex + 1})`);
}

// ── Re-encode video to H.264 for Chromium preview ────────────────────────────
async function reencodeForPreview(inputPath, sceneIndex) {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const previewDir = path.join(skeletonDir, 'preview');
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });

    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}.mp4`);
    console.log(`[Preview] Re-encoding scene ${sceneIndex + 1} → H.264 for preview...`);

    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            '-y', previewPath
        ]);
        ffmpeg.on('close', code => {
            if (code === 0) {
                resolve(`media:///${previewPath.replace(/\\/g, '/')}?t=${Date.now()}`);
            } else {
                console.error(`[Preview] FFmpeg failed with code ${code}`);
                resolve(`media:///${inputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
            }
        });
    });
}

// ── Mux Audio into Video ─────────────────────────────────────────────────────
async function muxAudioIntoVideo(videoPath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        try {
            // 1. Get durations
            const vDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`).toString().trim());
            const aDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`).toString().trim());

            console.log(`[Sync] vDur: ${vDur.toFixed(2)}s, aDur: ${aDur.toFixed(2)}s`);

            const args = ['-i', videoPath, '-i', audioPath];

            if (vDur < aDur - 0.1) {
                // Video is shorter -> stretch video (slow down)
                const ratio = aDur / vDur;
                console.log(`[Sync] Stretching video by factor ${ratio.toFixed(2)}x`);
                // Force H.264 when re-encoding
                args.push('-filter_complex', `[0:v]setpts=${ratio}*PTS[v]`, '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-crf', '23', '-preset', 'fast', '-pix_fmt', 'yuv420p');
            } else {
                // Video is longer or equal -> trim to audio
                // Force H.264 if needed, OR copy if we're sure it's already compatible
                // To be safe, let's copy but STILL ensure it's H.264 if we can.
                // Actually, if it's already H.264 from the source, copy is faster.
                args.push('-c:v', 'copy', '-map', '0:v:0', '-map', '1:a:0', '-shortest');
            }

            args.push('-c:a', 'aac', '-y', outputPath);

            const ffmpeg = spawn('ffmpeg', args);
            ffmpeg.on('close', code => {
                if (code === 0) resolve(outputPath);
                else reject(new Error(`FFmpeg mux sync failed (code ${code})`));
            });
        } catch (e) {
            reject(e);
        }
    });
}

// ── Pollinations Upload & Video ───────────────────────────────────────────────
async function uploadFileToPollinations(filePath) {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const buffer = fs.readFileSync(filePath);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        buffer,
        Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/upload', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body
    });
    const text = await resBody.text();
    if (statusCode !== 200) throw new Error(`Upload to Pollinations failed (${statusCode}): ${text}`);
    return JSON.parse(text).url;
}

// ── Pollinations WAN with Reference Image (supports image input) ──────────────
async function createVideoViaPollinationsWAN(prompt, sceneIndex, event) {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const imagePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Reference image not found: ${imagePath}`);
    }

    const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
    const imageDataUri = `data:image/jpeg;base64,${imageBase64}`;
    const encodedPrompt = encodeURIComponent(prompt);
    const videoUrl = `https://gen.pollinations.ai/video/${encodedPrompt}?model=wan&width=720&height=1280&duration=10&seed=${Math.floor(Math.random() * 999999)}`;

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`[Skeleton WAN img2v] Scene ${sceneIndex + 1} — attempt ${attempt}/3`);
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'PROCESSING' });

            const { statusCode, body } = await request(videoUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                },
                headersTimeout: 300_000,
                bodyTimeout: 300_000,
                body: JSON.stringify({ prompt, image: imageDataUri })
            });

            if (statusCode !== 200) throw new Error(`WAN failed: ${statusCode}`);

            const videoPath = path.join(skeletonDir, `scene_${sceneIndex + 1}.mp4`);
            await streamPipeline(body, fs.createWriteStream(videoPath));
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'COMPLETED' });
            return `media:///${videoPath.replace(/\\/g, '/')}`;
        } catch (e) {
            lastError = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 8000));
        }
    }
    throw lastError;
}

// ── Grok Video (text-to-video via Pollinations) ─────────────────────────────
async function createVideoViaPollinationsGrok(prompt, sceneIndex, event) {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const imgbbKey = process.env.IMGBB_API_KEY?.trim();
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const imagePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

    if (!fs.existsSync(imagePath)) {
        throw new Error(`Reference image not found: ${imagePath}`);
    }
    if (!imgbbKey) {
        throw new Error(`IMGBB_API_KEY missing in .env — required for Grok Video image hosting`);
    }

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`[Skeleton Grok Video] Scene ${sceneIndex + 1} — attempt ${attempt}/3`);
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'UPLOADING' });

            // Шаг 1: Загружаем на ImgBB → получаем публичный URL
            const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
            const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
            const uploadBody = Buffer.concat([
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="key"\r\n\r\n${imgbbKey}\r\n`),
                Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"\r\n\r\n${imageBase64}\r\n`),
                Buffer.from(`--${boundary}--\r\n`)
            ]);
            const { statusCode: uploadStatus, body: uploadBody2 } = await request('https://api.imgbb.com/1/upload', {
                method: 'POST',
                headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
                body: uploadBody
            });
            const uploadText = await uploadBody2.text();
            const uploadData = JSON.parse(uploadText);
            if (uploadStatus !== 200 || !uploadData.data?.url) {
                throw new Error(`ImgBB upload failed (${uploadStatus}): ${uploadData.error?.message || uploadText.substring(0, 100)}`);
            }
            const imagePublicUrl = uploadData.data.url;
            console.log(`[Skeleton Grok Video] Image hosted at: ${imagePublicUrl}`);

            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'PROCESSING' });

            // Шаг 2: GET /video/{prompt}?model=grok-video&image={publicUrl}
            const seed = Math.floor(Math.random() * 999999);
            const encodedPrompt = encodeURIComponent(prompt);
            const videoUrl = `https://gen.pollinations.ai/video/${encodedPrompt}?model=grok-video&width=720&height=1280&aspectRatio=9:16&seed=${seed}&image=${encodeURIComponent(imagePublicUrl)}`;

            console.log(`[Skeleton Grok Video] Generating video (may take 2-4 min)...`);

            const { statusCode, body } = await request(videoUrl, {
                method: 'GET',
                headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
                headersTimeout: 600_000,
                bodyTimeout: 600_000
            });

            if (statusCode !== 200) {
                const errText = await body.text();
                throw new Error(`Grok Video failed (${statusCode}): ${errText.substring(0, 200)}`);
            }

            const videoPath = path.join(skeletonDir, `scene_${sceneIndex + 1}.mp4`);
            await streamPipeline(body, fs.createWriteStream(videoPath));
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'COMPLETED' });
            console.log(`[Skeleton Grok Video] Scene ${sceneIndex + 1} saved: ${videoPath}`);
            return videoPath;

        } catch (e) {
            lastError = e;
            console.warn(`[Skeleton Grok Video] Attempt ${attempt} failed: ${e.message}`);
            if (attempt < 3) await new Promise(r => setTimeout(r, 15000)); // 15 сек между попытками
        }
    }
    throw lastError;
}

// createVideoViaFreepikPixVerse is now part of unified createVideoViaFreepik

// ── LTX-2 Text-to-Video (no image support) ─────────────────────────────────────
async function createVideoViaPollinationsLTX2TextOnly(prompt, sceneIndex, event) {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const encodedPrompt = encodeURIComponent(prompt);
    const videoUrl = `https://gen.pollinations.ai/video/${encodedPrompt}?model=ltx-2&width=720&height=1280&duration=10&seed=${Math.floor(Math.random() * 999999)}`;

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`[Skeleton LTX2 t2v] Scene ${sceneIndex + 1} — attempt ${attempt}/3`);
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'PROCESSING' });

            const { statusCode, body } = await request(videoUrl, {
                method: 'GET',
                headers: apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {},
                headersTimeout: 300_000,
                bodyTimeout: 300_000
            });

            if (statusCode !== 200) throw new Error(`LTX2 failed: ${statusCode}`);

            const videoPath = path.join(skeletonDir, `scene_${sceneIndex + 1}.mp4`);
            await streamPipeline(body, fs.createWriteStream(videoPath));
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt, maxAttempts: 3, state: 'COMPLETED' });
            return videoPath;
        } catch (e) {
            lastError = e;
            if (attempt < 3) await new Promise(r => setTimeout(r, 8000));
        }
    }
    throw lastError;
}

// ── Очистка папки Audio перед новой генерацией ───────────────────────────────
function cleanupAudioDir() {
    const audioDir = path.join(__dirname, 'Audio');
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
        return;
    }
    try {
        const files = fs.readdirSync(audioDir);
        let removed = 0;
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(audioDir, file));
                removed++;
            } catch (e) {
                console.warn(`[cleanupAudioDir] Не удалось удалить ${file}: ${e.message}`);
            }
        }
        console.log(`[cleanupAudioDir] Удалено ${removed} файлов из Audio/`);
    } catch (e) {
        console.error(`[cleanupAudioDir] Ошибка: ${e.message}`);
    }
}

function registerSkeletonHandlers(ipcMain) {
    ipcMain.handle('skeleton-generate-ideas', async (event, { language }) => {
        const langName = LANG_NAMES[language] || 'English';
        const completedTopics = historyManager.getTopics(language);
        const prompt = `You are writing narration for a viral YouTube Shorts channel that explains human limits and biological failure.
REFERENCE STYLE (STRICT): Calm, Clinical but conversational, Slightly ominous, Second-person ("you"), Short sentences, Simple language.
Generate exactly 10 short-form video ideas (Phase 1) using:
- "How Long Can You ___?"
- "What Happens If You ___ Every Day?"
- "How Much ___ Is TOO Much?"
EXCLUSION LIST (DO NOT USE): ${completedTopics.join(', ')}.
Rules: Human body or brain only, Escalation over time, Visually explainable, Slightly dangerous.
Output format: Number. Title (in ${langName}) | Russian Translation | One-sentence failure path in simple language (in ${langName}). No preamble.`;
        return await callPollinations([{ role: 'user', content: prompt }]);
    });

    ipcMain.handle('skeleton-generate-script', async (event, { ideaTitle, language, videoModel }) => {
        const langName = LANG_NAMES[language] || 'English';
        cleanupAudioDir();

        const scriptPrompt = `Write a script for a viral channel about human limits: "${ideaTitle}".
REFERENCE STYLE (STRICT): Calm, Clinical, Slightly ominous, Second-person ("you"), Simple language.
STRUCTURE (STRICT): Exactly 6 segments (Intro + 4 Checkpoints + Final Failure).

CRITICAL WORD COUNT RULE:
Each segment MUST be exactly ONE flowing sentence of 22-26 words. This is vital to fit the 6-7 second video duration. NO exceptions.

CONTENT PER CHECKPOINT:
- Briefly mention the physical feeling, mental state, or a quick comparison.
- Use plain language. No medical jargon. No disease names.
- Every line must be easy to imagine visually.

Output exactly 6 lines (one per segment) separated by double newlines. Language: ${langName}.`;

        const script = await callPollinations([{ role: 'user', content: scriptPrompt }]);

        const promptsPrompt = `Convert this script into scene-by-scene IMAGE PROMPTS and IMAGE-TO-VIDEO PROMPTS with strict visual consistency.
Script: ${script}

Character Hard Lock: Humanoid skeleton in a semi-transparent glass body, yellow eyes.

For EACH scene (exactly 6), generate following JSON:
{
  "scenes": [
    {
      "scene": 1,
      "environment": "Realistic indoor or outdoor environment suitable for the time checkpoint",
      "pose_action": "Specific physical action (e.g., rubbing head, slumped in chair, walking slowly)",
      "script_line": "Exact narration for this segment",
      "visual_detail": "Camera: Eye-level or chest-level, Medium shot. Lighting: Natural, matching environment. No extreme angles.",
      "motion_detail": "Subtle body movement, natural breathing motion, very slight camera drift"
    }
  ]
}`;

        const promptsRaw = await callPollinations([{ role: 'user', content: promptsPrompt }], true);

        const extractJSON = (str) => {
            const start = str.indexOf('{');
            const end = str.lastIndexOf('}');
            if (start !== -1 && end !== -1) return str.substring(start, end + 1);
            return str;
        };

        const cleanJSON = extractJSON(promptsRaw);
        let scenes = JSON.parse(cleanJSON).scenes.map(s => ({
            ...s,
            // TASK 2: IMAGE PROMPTS (Full character description repeated verbatim per prompt.md)
            image_prompt: `A full-body realistic humanoid SKELETON character with a semi-transparent human-shaped outer body shell. The character has: A fully exposed skull (NO skin, NO face, NO muscles). Clean, smooth, anatomically accurate skull. Large, round eye sockets with visible eyeballs. Bright yellow irises with dark pupils. Neutral to slightly vacant expression. Visible upper and lower teeth. Smooth cranium with no cracks, damage, decay, or horror elements. The body is a semi-transparent, glass-like human silhouette that clearly reveals the entire internal skeletal structure from head to toe. Skeleton details: Ivory / pale beige bones. Smooth, medical-grade surfaces. Accurate human proportions. Clearly defined rib cage, spine, pelvis, arms, hands, legs, knees, ankles, and feet. All joints, vertebrae, and phalanges visible and anatomically correct. No muscles. No veins. No organs. No skin texture. The style is: High-end medical visualization, Clean, clinical, modern. NOT horror. NOT zombie. NOT cartoon. NOT decayed. Environment: ${s.environment}. Pose: ${s.pose_action}. ${s.visual_detail} Photorealistic cinematic realism, 8k, detailed.`,

            // TASK 3: IMAGE-TO-VIDEO PROMPTS
            video_prompt: `Motion: ${s.motion_detail}. Action: character ${s.pose_action}. Natural movement, high resolution, subtle drift.`,

            // LTX-2 SPECIFIC RULES (Prompt.md requirements: Anchor at start, Audio label, Negative prompt)
            ltx_video_prompt: `STRICTLY NO TEXT, NO SUBTITLES, NO CAPTIONS. ${CHARACTER_ANCHOR} ACTION: ${s.pose_action}. ENVIRONMENT: ${s.environment}. AUDIO NARRATION ONLY (DO NOT SHOW AS TEXT): "${s.script_line}". NEGATIVE PROMPT: human skin, realistic face, muscles, organs, veins, blurry, low quality, watermark, text, subtitles, captions, horror, decay, blood, zombie.`
        }));

        // Audio is now synthesized separately via 'skeleton-generate-audio'
        return { script, scenes };
    });

    ipcMain.handle('skeleton-generate-audio', async (event, { script, scenes, language }) => {
        console.log(`[Skeleton] Starting audio synthesis...`);
        // Using defaults (csv666 + provided UUID)
        const fullAudioUrl = await synthesizeUnifiedSpeech(script, language);
        const sceneAudioUrls = [];
        for (const s of scenes) {
            const url = await synthesizeUnifiedSpeech(s.script_line, language);
            sceneAudioUrls.push(url);
        }
        return { fullAudioUrl, sceneAudioUrls };
    });

    ipcMain.handle('skeleton-generate-image', async (event, { sceneIndex, imagePrompt, imageModel }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir);
        const filePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

        if (imageModel && imageModel.startsWith('freepik-')) {
            const realModel = imageModel.replace('freepik-', '');
            await createImageViaFreepik(imagePrompt, filePath, realModel);
        } else {
            await createImageViaPollinations(imagePrompt, filePath, '9:16', imageModel || 'imagen-4');
        }

        return `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    ipcMain.handle('skeleton-generate-video', async (event, { sceneIndex, videoPrompt, ltxVideoPrompt, scriptLine, fullScript, language, videoModel, audioUrl }) => {
        const audioPath = audioUrl ? audioUrl.replace('media:///', '').split('?')[0] : null;
        let videoFile;

        try {
            if (videoModel === 'pollinations-ltx2') {
                videoFile = await createVideoViaPollinationsLTX2TextOnly(ltxVideoPrompt || videoPrompt, sceneIndex, event);
            } else if (videoModel === 'grok-video') {
                videoFile = await createVideoViaPollinationsGrok(videoPrompt, sceneIndex, event);
            } else {
                // Default to Freepik for other models (wan, pixverse, kling, etc.)
                const realModel = videoModel || 'wan-v2-6-720p';
                const prompt = (realModel === 'pixverse-v5' || realModel.includes('ltx')) ? (ltxVideoPrompt || videoPrompt) : videoPrompt;
                videoFile = await createVideoViaFreepik(realModel, prompt, sceneIndex, event);
            }

            if (audioPath && fs.existsSync(audioPath)) {
                console.log(`[Skeleton Video] Muxing audio for scene ${sceneIndex + 1}...`);
                const muxed = videoFile.replace('.mp4', '_muxed.mp4');
                await muxAudioIntoVideo(videoFile, audioPath, muxed);
                fs.renameSync(muxed, videoFile);
            }

            // Generate/Refresh preview from the potentially muxed file
            console.log(`[Skeleton Video] Generating preview for scene ${sceneIndex + 1}...`);
            const previewUrl = await reencodeForPreview(videoFile, sceneIndex);

            return previewUrl;
        } catch (e) {
            console.error(`[Skeleton Video] Handler error: ${e.message}`);
            throw e;
        }
    });

    ipcMain.handle('skeleton-assemble-video', async (event, { useKaraoke, ideaTitle, language }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        const finalDir = path.join(__dirname, 'FinalVideo');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);
        const files = fs.readdirSync(skeletonDir).filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub')).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

        const videoFiles = [];
        for (const f of files) {
            const pathIn = path.join(skeletonDir, f);
            if (useKaraoke) {
                const pathSub = pathIn.replace('.mp4', '_sub.mp4');
                await generateKaraokeSubtitles(pathIn, pathSub, files.indexOf(f));
                videoFiles.push(pathSub);
            } else {
                videoFiles.push(pathIn);
            }
        }

        const listPath = path.join(__dirname, 'skeleton_filelist.txt');
        const tempPath = path.join(finalDir, `skeleton_temp_${Date.now()}.mp4`);
        const outputPath = path.join(finalDir, `skeleton_final_${Date.now()}.mp4`);
        fs.writeFileSync(listPath, videoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

        const musicDir = path.join(__dirname, 'Music');
        const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.wav')) : [];
        const bgMusicPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : null;

        return new Promise((resolve, reject) => {
            // Step 1: Concat videos
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', tempPath]);

            concat.on('close', async (code) => {
                if (code !== 0) return reject(new Error('Concat failed'));

                if (!bgMusicPath) {
                    fs.renameSync(tempPath, outputPath);
                    historyManager.addTopic(language, ideaTitle);
                    return resolve(`media:///${outputPath.replace(/\\/g, '/')}`);
                }

                // Step 2: Mix background music with fade out
                try {
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString().trim();
                    const duration = parseFloat(durationStr);
                    const fadeStart = Math.max(0, duration - 2);

                    const filter = `[1:a]volume=0.1,afade=t=out:st=${fadeStart}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]`;

                    const mix = spawn('ffmpeg', [
                        '-i', tempPath,
                        '-i', bgMusicPath,
                        '-filter_complex', filter,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-y', outputPath
                    ]);

                    mix.on('close', (mixCode) => {
                        fs.unlinkSync(tempPath);
                        if (mixCode === 0) {
                            historyManager.addTopic(language, ideaTitle);
                            resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                        } else reject(new Error('Music mix failed'));
                    });
                } catch (e) {
                    console.error('Music mix error:', e);
                    fs.renameSync(tempPath, outputPath);
                    resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }
            });
        });
    });

    ipcMain.handle('studio-generate-ideas', async (event, { mode, language }) => {
        const langName = LANG_NAMES[language] || 'English';
        const isRussian = langName === 'Russian';

        const prompt = mode === 'health'
            ? `Provide 5 Topic Ideas for health-niche talking-object AI videos where fruits, vegetables, or healthy foods become anthropomorphic characters inside the human body and explain their benefits in a friendly, educational way.
               Each topic idea must clearly mention:
               - The specific health goal (e.g., fat burn, digestion, immunity, energy).
               - The type of foods involved.
               - The core outcome viewers will learn.
               Make the ideas catchy, optimized for YouTube Shorts/Reels, and creator-friendly. 
               Target Language: ${langName}.
               Output ONLY a JSON array of objects: [{"original": "idea in ${langName}", "russian": "Russian translation"}]`
            : `Provide 5 highly viral topic ideas for "Talking Objects Conflict" videos (TikTok/Shorts).
               Theme: Everyday objects, foods, or appliances that are ALIVE and constantly fighting about who is the best and most important.
               Each idea should be broad, curiosity-driven (e.g., "The Kitchen Ego War", "The Gym Equipment Argument").
               Target Language: ${langName}.
               Output ONLY a JSON array of objects: [{"original": "idea in ${langName}", "russian": "Russian translation"}]`;

        const raw = await callPollinations([{ role: 'user', content: prompt }], true);
        console.log(`[Studio Ideas] Raw AI Result:`, raw);

        try {
            const jsonText = raw.match(/\[[\s\S]*\]/)?.[0] || raw;
            const parsed = JSON.parse(jsonText);
            return (Array.isArray(parsed) ? parsed : []).map(item => ({
                original: typeof item === 'string' ? item : (item.original || ''),
                russian: isRussian ? '' : (item.russian || item.translation || '')
            }));
        } catch (e) {
            console.error('Failed to parse Studio ideas:', raw, e.message);
            return [];
        }
    });

    ipcMain.handle('studio-generate-script', async (event, { mode, topic, language }) => {
        const langName = LANG_NAMES[language] || 'English';

        let systemInstruction = "";
        let userPrompt = "";

        if (mode === 'health') {
            systemInstruction = `You are a world-class AI medical animator and viral scriptwriter.
            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "imagePrompt" Style: Pixar-style anthropomorphic character, round expressive eyes, smiling mouth with visible lips, soft proportions, child-friendly medical look. Placed inside a highly detailed realistic 3D human organ environment matching the dialogue.
            4. "videoPrompt" Style: Professional lip-sync animation (matching dialogue: ${langName}), subtle body movement using symbolic tools (scrubbing, melting, hydrating), cinematic 9:16 vertical motion.
            5. Characters: Friendly fruits/veg performing helpful actions inside organs.`;

            userPrompt = `Generate a 5-scene viral health explainer about "${topic}".
            Target Language: ${langName}.
            Output JSON format:
            {
              "intro": "Catchy Title in ${langName}",
              "scenes": [
                {
                  "id": 1,
                  "character": "Name in ${langName}",
                  "line": "Spoken dialogue in ${langName} (Calm, friendly, educational first-person style)",
                  "organ": "Matching human organ in English",
                  "instrument": "Symbolic tool (e.g., cleansing brush, melting wand, smoothing roller) in English",
                  "imagePrompt": "(In English) Cute friendly Pixar-style [character] with expressive eyes and lips, inside a 3D medical [organ] environment, actively [doing action] using [instrument]. Cinematic lighting, high-end medical explainer textures, multiple small versions in background for teamwork feel.",
                  "videoPrompt": "(In English) Lip-sync for: '[line]'. [character] performs [action] inside [organ] with [instrument]. High emotion, natural animation, vertical 9:16 framing, slow cinematic camera."
                }
              ]
            }`;
        } else {
            systemInstruction = `You are a viral TikTok comedic scriptwriter specialized in "Talking Objects Conflict".
            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "imagePrompt" Style: Anthropomorphic object with high-drama personality, Pixar-style round expressive eyes, visible lips/mouth for talking, placed in a realistic high-drama environment (e.g., a dark kitchen counter, a messy desk).
            4. "videoPrompt" Style: Dramatic lip-sync (matching dialogue: ${langName}), high emotion, expressive body language (trembling, jumping, leaning), slow cinematic vertical camera.
            5. Characters: 3-4 objects ALIVE and fighting/competing about who is best. Ego-driven, slightly aggressive, and punchy.
            6. Formatting: Each "line" must include an emotion in brackets, e.g., "[Angry] I am the king of this house!"`;

            userPrompt = `Create a 5-scene viral high-conflict script about "${topic}". 
            Maximum 5 scenes, punchy, fast-paced (45-60s total). 1-2 lines per scene.
            End with a funny or ironic line.
            Target Language: ${langName}.
            Output JSON format:
            {
              "intro": "Funny Dramatic Title in ${langName}",
              "scenes": [
                {
                  "id": 1,
                  "character": "Object Name in ${langName}",
                  "line": "Spoken dialogue in ${langName} including [emotion in brackets]",
                  "emotion": "Dominant emotion (Angry, Mocking, Laughing, Shouting) in English",
                  "imagePrompt": "(In English) Dramatic anthropomorphic Pixar-style [character] with round expressive eyes and lips, showing [emotion], high drama spotlighting, professional cinematic render, 8k textures.",
                  "videoPrompt": "(In English) High-drama lip-sync animation for: '[line]'. [character] expresses [emotion] with intense body language, slow cinematic camera zoom, 9:16 vertical framing."
                }
              ]
            }`;
        }

        const raw = await callPollinations([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
        ], true);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const parsed = JSON.parse(jsonText);
            return parsed;
        } catch (e) {
            console.error('Failed to parse Studio script:', raw);
            throw new Error("AI failed to generate structural JSON script.");
        }
    });

    ipcMain.handle('studio-assemble-video', async (event, { useKaraoke, ideaTitle, language }) => {
        const studioDir = path.join(__dirname, 'SkeletonShorts');
        const finalDir = path.join(__dirname, 'FinalVideo');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);

        const files = fs.readdirSync(studioDir)
            .filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                return numA - numB;
            });

        if (files.length === 0) throw new Error("No scenes found to assemble.");

        const videoFiles = [];
        for (const f of files) {
            const pathIn = path.join(studioDir, f);
            if (useKaraoke) {
                const pathSub = pathIn.replace('.mp4', '_sub.mp4');
                await generateKaraokeSubtitles(pathIn, pathSub, files.indexOf(f));
                videoFiles.push(pathSub);
            } else {
                videoFiles.push(pathIn);
            }
        }

        const listPath = path.join(__dirname, 'studio_filelist.txt');
        const tempPath = path.join(finalDir, `studio_temp_${Date.now()}.mp4`);
        const outputPath = path.join(finalDir, `studio_final_${Date.now()}.mp4`);
        fs.writeFileSync(listPath, videoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

        const musicDir = path.join(__dirname, 'Music');
        const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.wav')) : [];
        const bgMusicPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : null;

        return new Promise((resolve, reject) => {
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', tempPath]);

            concat.on('close', async (code) => {
                if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                if (code !== 0) return reject(new Error('Concat failed'));

                if (!bgMusicPath) {
                    fs.renameSync(tempPath, outputPath);
                    return resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }

                try {
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString().trim();
                    const duration = parseFloat(durationStr);
                    const fadeStart = Math.max(0, duration - 2);
                    const filter = `[1:a]volume=0.1,afade=t=out:st=${fadeStart}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]`;

                    const mix = spawn('ffmpeg', [
                        '-i', tempPath,
                        '-i', bgMusicPath,
                        '-filter_complex', filter,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-y', outputPath
                    ]);

                    mix.on('close', (mixCode) => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        if (mixCode === 0) {
                            resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                        } else reject(new Error('Music mix failed'));
                    });
                } catch (e) {
                    console.error('Studio Music mix error:', e);
                    fs.renameSync(tempPath, outputPath);
                    resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }
            });
        });
    });
}

// Subtitles (Stub for brevity as it's complex, but I'll keep the core structure)
async function generateKaraokeSubtitles(videoPath, outputPath, sceneIdx) {
    const audioPath = videoPath.replace('.mp4', '.mp3');
    const assPath = videoPath.replace('.mp4', '.ass');
    execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -y "${audioPath}"`);

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

    const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body
    });

    const data = JSON.parse(await resBody.text());
    const words = data.words || [];
    if (words.length === 0) { fs.copyFileSync(videoPath, outputPath); return; }

    const assContent = generateAssKaraoke(words);
    fs.writeFileSync(assPath, assContent);
    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vf', `ass='${escapedAss}'`, '-c:v', 'libx264', '-y', outputPath]);
        ffmpeg.on('close', () => resolve(outputPath));
    });
}

function generateAssKaraoke(words) {
    let header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial Black,80,&H0000FF00,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,150,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    // Simple 4-word chunking
    const toAssTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2).padStart(5, '0');
        return `${h}:${String(m).padStart(2, '0')}:${s}`;
    };

    let events = "";
    for (let i = 0; i < words.length; i += 4) {
        const chunk = words.slice(i, i + 4);
        const start = toAssTime(chunk[0].start);
        const end = toAssTime(chunk[chunk.length - 1].end);
        let line = `Dialogue: 0,${start},${end},Default,,0,0,0,,`;
        let lastEnd = chunk[0].start;
        for (const w of chunk) {
            const dur = Math.max(1, Math.round(((w.end || w.start + 0.3) - w.start) * 100));
            const pause = Math.max(0, Math.round((w.start - lastEnd) * 100));
            if (pause > 0) line += `{\\k${pause}} `;
            line += `{\\k${dur}}${w.word} `;
            lastEnd = w.end || w.start + 0.3;
        }
        events += line + "\n";
    }
    return header + events;
}

module.exports = { synthesizeUnifiedSpeech, registerSkeletonHandlers, createImageViaPollinations, createImageViaFreepik };
