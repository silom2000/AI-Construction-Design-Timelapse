// ============ SKELETON SHORTS — WAN V2.6 720P ============
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { spawn, execSync } = require('child_process');
const { request } = require('undici');
const crypto = require('crypto');
const streamPipeline = promisify(pipeline);
const historyManager = require('./history-manager.cjs');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const { pipeline: _pipeline } = require('stream');

const LANG_NAMES = {
    // short codes
    en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
    ru: 'Russian', pl: 'Polish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    // full names (from StudioTab language selector)
    English: 'English', Russian: 'Russian', French: 'French', German: 'German',
    Spanish: 'Spanish', Polish: 'Polish', Italian: 'Italian', Portuguese: 'Portuguese'
};

// ── 100 Object Categories for diverse idea generation ─────────────────────────
const OBJECT_CATEGORIES = [
    // ЕДА И КУХНЯ
    { theme: 'Food & Kitchen', objects: ['vegetables', 'fruits', 'kitchen utensils', 'spices', 'junk food', 'healthy food', 'breakfast items', 'street food', 'frozen food', 'mixed vegetables vs fruits'] },
    // ПРЕДМЕТЫ ДОМАШНЕГО ОБИХОДА
    { theme: 'Household', objects: ['furniture', 'bedroom objects', 'bathroom items', 'cleaning tools', 'electrical appliances', 'doors & windows', 'pillows & blankets', 'storage items', 'lights & fans', 'dustbin contents'] },
    // ОФИСНАЯ ЖИЗНЬ
    { theme: 'Office & Work', objects: ['desk objects', 'laptop & accessories', 'stationery', 'printer & scanner', 'office furniture', 'work-from-home setup', 'ID card & access card', 'files & folders', 'pantry items', 'meeting room objects'] },
    // ТРЕНАЖЕРНЫЙ ЗАЛ
    { theme: 'Gym & Fitness', objects: ['gym equipment', 'dumbbells & weights', 'cardio machines', 'gym accessories', 'protein supplements', 'fitness tracking devices', 'gym lockers', 'workout clothes', 'yoga equipment', 'post-workout items'] },
    // ЗДОРОВЬЕ И ТЕЛО
    { theme: 'Health & Body', objects: ['internal organs', 'bones & muscles', 'immune system parts', 'digestive system', 'heart vs brain', 'hormones', 'blood cells', 'senses (eyes, ears)', 'mental health emotions', 'body parts vs habits'] },
    // ТЕХНОЛОГИИ
    { theme: 'Tech & Digital', objects: ['mobile apps', 'phone components', 'social media platforms', 'notifications', 'AI tools', 'gadgets', 'cables & chargers', 'gaming devices', 'smart home devices', 'digital files'] },
    // ДЕНЬГИ
    { theme: 'Money & Finance', objects: ['wallet contents', 'credit cards', 'coins & cash', 'bills & expenses', 'savings vs spending', 'investment assets', 'budget categories', 'subscription services', 'salary breakdown', 'shopping items'] },
    // ШКОЛА И УЧЁБА
    { theme: 'School & Study', objects: ['school stationery', 'books', 'exam papers', 'classroom objects', 'backpack contents', 'homework materials', 'grades & marks', 'online class tools', 'study apps', 'library books'] },
    // ПУТЕШЕСТВИЯ
    { theme: 'Travel & Outdoors', objects: ['luggage items', 'travel accessories', 'vehicle parts', 'road objects', 'tourist items', 'airport objects', 'train station items', 'hotel room items', 'weather elements', 'camping gear'] },
    // ВЕСЁЛЫЙ И ВИРУСНЫЙ
    { theme: 'Fun & Viral', objects: ['emojis', 'alphabet letters', 'numbers', 'colors', 'sounds', 'emotions', 'habits', 'daily routines', 'time periods', 'life stages'] }
];

/** Pick N random categories + specific objects for prompt diversity */
function getRandomCategories(n = 3) {
    const shuffled = [...OBJECT_CATEGORIES].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, n);
    return picked.map(cat => {
        const objs = [...cat.objects].sort(() => Math.random() - 0.5).slice(0, 3);
        return `${cat.theme}: ${objs.join(', ')}`;
    });
}

// ------------- Phase 1: Voice API (csv666) -------------

// ─────────────────────────────────────────────────────────────
// VoiseAPI (https://voiceapi.csv666.ru) — ASYNC TASK FLOW
// POST /tasks → {task_id: N} → poll GET /tasks/{id} → download audio
// ─────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════
// VoiseAPI async task flow — CORRECT IMPLEMENTATION
// POST /tasks → {task_id: N} → poll → download binary MP3
// ═══════════════════════════════════════════════════════════
const _voiseApiAxios = require('axios');

async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
    const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
    if (!apiKey) throw new Error('[Voice] VOICEAPI_KEY not set');

    const VOISE_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';
    // ✅ CORRECT AUTH: X-API-Key header (per API docs securitySchemes)
    const hdrs = {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
    };

    // Step 1: Create task
    const body = {
        template: {
            model_id: options.model_id || 'eleven_multilingual_v2',
            voice_id: voiceId,
            voice_settings: {
                stability: options.stability ?? 0.85,
                similarity_boost: options.similarity_boost ?? 0.75,
                use_speaker_boost: options.use_speaker_boost !== false,
                style: options.style ?? 0.0,
                speed: options.speed ?? 1.0
            },
            voice_result_type: 'default'
        },
        text: text,
        task_type: 'default'
    };
    if (options.public_owner_id) body.template.public_owner_id = options.public_owner_id;

    console.log(`[Voice] POST /tasks voice=${voiceId} text=${text.length}chars`);
    const cr = await _voiseApiAxios.post(`${VOISE_BASE}/tasks`, body, { headers: hdrs });
    const taskId = cr.data && (cr.data.task_id || cr.data.id);
    if (!taskId) throw new Error('[Voice] No task_id: ' + JSON.stringify(cr.data).slice(0, 200));
    console.log(`[Voice] task_id=${taskId}`);

    // Step 2: Poll GET /tasks/{id}/status (NOT /tasks/{id}!)
    // Statuses: waiting → processing → ending (ready!) → ending_processed
    for (let n = 0; n < 60; n++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await _voiseApiAxios.get(`${VOISE_BASE}/tasks/${taskId}/status`, { headers: hdrs });
        const t = sr.data;
        const st = ((t.status || '')).toLowerCase();
        console.log(`[Voice] task=${taskId} status=${st} (${n+1}/60)`);
        if (st === 'error' || st === 'error_handled') throw new Error('[Voice] Task failed: ' + JSON.stringify(t).slice(0, 200));

        // "ending" = result ready
        if (st === 'ending' || st === 'ending_processed') {
            console.log(`[Voice] Status "${st}" — downloading /tasks/${taskId}/result`);
            const ar = await _voiseApiAxios.get(`${VOISE_BASE}/tasks/${taskId}/result`, { responseType: 'arraybuffer', headers: hdrs });
            const buf = Buffer.from(ar.data);
            if (buf.length < 100) throw new Error(`[Voice] Too small: ${buf.length}B`);
            const dir = require('path').dirname(outputPath);
            if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
            require('fs').writeFileSync(outputPath, buf);
            console.log(`[Voice] Saved: ${outputPath} (${buf.length}B)`);
            return outputPath;
        }
        // waiting / processing — keep polling
    }
    throw new Error(`[Voice] Timeout: task ${taskId}`);
}




// ------------- Phase 2: Unified TTS (VoiceAPI) -------------
const synthesizeUnifiedSpeech = async (input, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) => {
    // Pick suitable voice based on language
    let activeVoice = voice;
    if (language.toLowerCase() === 'russian' || language.toLowerCase() === 'ru') {
        // "Alex_Ru" (Available Russian template for this key)
        activeVoice = 'aeb88254-a426-47da-a7d4-f182195f9fab';
    } else {
        // "french" (multilingual template, supports English)
        activeVoice = 'eb21f806-58d1-46db-b346-24ea6540d0eb';
    }
    
    return await synthesizeCsv666Speech(input, activeVoice, language, customDir);
};

const CHARACTER_ANCHOR = `A full-body realistic humanoid SKELETON character with a semi-transparent human-shaped outer body shell. The character has: A fully exposed skull (NO skin, NO face, NO muscles). Clean, smooth, anatomically accurate skull. Large, round eye sockets with visible eyeballs. Bright yellow irises with dark pupils. Neutral to slightly vacant expression. Visible upper and lower teeth. Smooth cranium with no cracks, damage, decay, or horror elements. The body is a semi-transparent, glass-like human silhouette that clearly reveals the entire internal skeletal structure from head to toe. Skeleton details: Ivory / pale beige bones. Smooth, medical-grade surfaces. Accurate human proportions. Clearly defined rib cage, spine, pelvis, arms, hands, legs, knees, ankles, and feet. All joints, vertebrae, and phalanges visible and anatomically correct. No muscles. No veins. No organs. No skin texture. The style is: High-end medical visualization, Clean, clinical, modern. NOT horror. NOT zombie. NOT cartoon. NOT decayed. ABSOLUTE RULES: NO MUSIC. STERNLY FOLLOW text for lip-sync. NO independent translations.`;

// ── Pollinations helper ───────────────────────────────────────────────────────
const WORKING_TEXT_MODELS = ['gemini-3.1-pro-high', 'gemini-3.1-pro', 'gpt-4o', 'gpt-4-turbo'];

const callPollinations = async (messages, jsonMode = false) => {
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
            model: 'mimo-v2-pro',
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
        url: 'https://gen.pollinations.ai/v1/chat/completions',
        key: process.env.POLLINATIONS_API_KEY,
        model: 'openai-large'
    });

    // Reorder based on DEFAULT_AI_PROVIDER
    const defaultProvider = process.env.DEFAULT_AI_PROVIDER || 'qwen';
    providers.sort((a, b) => {
        if (a.id === defaultProvider && b.id !== defaultProvider) return -1;
        if (b.id === defaultProvider && a.id !== defaultProvider) return 1;
        return 0;
    });

    let lastError = null;
    let proxyDisabled = false;

    for (const p of providers) {
        if (p.id === 'custom' && proxyDisabled) {
            continue; // Skip remaining custom models if proxy is disabled
        }

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[AI Call] Trying provider=${p.id} model=${p.model} at ${p.url} (attempt ${attempt})`);
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

                const { statusCode, body: resBody } = await request(p.url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(reqBody)
                });

                const text = await resBody.text();
                if (statusCode === 200) {
                    const data = JSON.parse(text);
                    return data.choices?.[0]?.message?.content || '';
                }
                
                console.warn(`[AI Call] provider=${p.id} model=${p.model} failed with ${statusCode}: ${text.substring(0, 100)}`);
                
                if (statusCode === 503 && text.includes('Proxy service is currently disabled')) {
                     console.warn(`[AI Call] Local Proxy is disabled, skipping remaining local models!`);
                     proxyDisabled = true;
                     break; // Break the attempt loop
                }
                if (statusCode === 402) {
                     console.warn(`[AI Call] Insufficient balance for ${p.id}, skipping remaining attempts.`);
                     break; // Insufficient funds, don't retry
                }
            } catch (e) {
                console.error(`[AI Call] Error with provider=${p.id} model=${p.model}: ${e.message}`);
                lastError = e;
            }
            if (!proxyDisabled && attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw lastError || new Error('All models exhausted or failed');
};

// `uploadToImgBB`, `createVideoViaFreepikPixVerse`, `createVideoViaPollinationsLTX2TextOnly` and other legacy generation functions were removed in favor of `glabs-handlers.cjs`

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

// ── Preview re-encoding helper ────────────────────────────────────────────────
async function reencodeForPreview(inputPath, sceneIndex) {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const previewDir = path.join(skeletonDir, 'preview');
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}.mp4`);
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', previewPath
        ]);
        ffmpeg.on('close', code => {
            const resultPath = code === 0 ? previewPath : inputPath;
            resolve(`media:///${resultPath.replace(/\\/g, '/')}?t=${Date.now()}`);
        });
    });
}

// ── Audio muxing helper ───────────────────────────────────────────────────────
async function muxAudioIntoVideo(videoPath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-shortest', '-y', outputPath
        ]);
        ffmpeg.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`muxAudioIntoVideo failed with code ${code}`));
        });
    });
}

function registerSkeletonHandlers(ipcMain) {
    ipcMain.handle('skeleton-generate-ideas', async (event, { language }) => {
        const langName = LANG_NAMES[language] || 'English';
        const completedTopics = historyManager.getTopics(language);
        const prompt = `You are writing narration for a viral YouTube Shorts channel that explains human limits and biological failure.
REFERENCE STYLE (STRICT): Calm, Clinical but conversational, Slightly ominous, Second-person ("you"), Short sentences, Simple language.
Generate exactly 5 short-form video ideas (Phase 1) using:
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

        const extractJSON = (str) => {
            const start = str.indexOf('{');
            const end = str.lastIndexOf('}');
            if (start !== -1 && end !== -1) return str.substring(start, end + 1);
            return str;
        };

        const scriptPrompt = `Write a script for a viral channel about human limits: "${ideaTitle}".
REFERENCE STYLE (STRICT): Calm, Clinical, Slightly ominous, Second-person ("you"), Simple language.
STRUCTURE (STRICT): Exactly 6 segments (Intro + 4 Checkpoints + Final Failure).

CRITICAL WORD COUNT RULE:
Each segment MUST be exactly ONE flowing sentence of 22-26 words. This is vital to fit the 6-7 second video duration. NO exceptions.

CONTENT PER CHECKPOINT:
- Briefly mention the physical feeling, mental state, or a quick comparison.
- Use plain language. No medical jargon. No disease names.
- Every line must be easy to imagine visually.

Output ONLY a JSON object with a "segments" array containing exactly 6 objects:
{ "segments": [ { "original": "exact script segment in ${langName}", "translation": "exact Russian translation of this segment" } ] }`;

        const scriptRaw = await callPollinations([{ role: 'user', content: scriptPrompt }], true);
        const scriptJson = JSON.parse(extractJSON(scriptRaw));
        
        let segmentsArray = [];
        if (Array.isArray(scriptJson)) segmentsArray = scriptJson;
        else if (scriptJson.segments) segmentsArray = scriptJson.segments;
        else if (scriptJson.script) segmentsArray = scriptJson.script;
        else if (scriptJson.ideas) segmentsArray = scriptJson.ideas;

        const scriptForUI = segmentsArray.map(s => `${s.original}\n[🇷🇺 ${s.translation}]`).join('\n\n');
        const scriptForPrompts = segmentsArray.map(s => s.original).join('\n\n');

        const promptsPrompt = `Convert this script into scene-by-scene IMAGE PROMPTS and IMAGE-TO-VIDEO PROMPTS with strict visual consistency.
Script: ${scriptForPrompts}

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
        return { script: scriptForUI, scenes };
    });

    ipcMain.handle('skeleton-generate-audio', async (event, { script, scenes, language }) => {
        console.log('[Skeleton] Audio synthesis is DISABLED (G-Labs handles lip-sync).');
        return { fullAudioUrl: '', sceneAudioUrls: (scenes || []).map(() => '') };
    });

    ipcMain.handle('skeleton-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir);
        const filePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

        // We use G-Labs for image generation
        const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'imagen4';
        
        event.sender.send('skeleton-image-progress', { sceneIndex, status: 'generating' });
        
        const savedPaths = await generateImageViaGLabs({
            prompt: imagePrompt,
            model: cleanModel,
            count: 1,
            sectionDir: skeletonDir,
            subFolder: projectFolder,
            sceneIndex: sceneIndex,
            onProgress: (p) => {
                event.sender.send('skeleton-image-progress', { sceneIndex, status: p.status, attempt: p.attempt });
            }
        });
        
        const imgBuffer = fs.readFileSync(savedPaths[0]);
        const imgExt = path.extname(savedPaths[0]).toLowerCase();
        const imgMime = imgExt === '.png' ? 'image/png' : imgExt === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
    });

    ipcMain.handle('skeleton-generate-video', async (event, { sceneIndex, videoPrompt, ltxVideoPrompt, scriptLine, fullScript, language, videoModel, audioUrl, projectFolder }) => {
        const audioPath = audioUrl ? audioUrl.replace('media:///', '').split('?')[0] : null;
        let videoFile;

        try {
            // We use G-Labs for video generation
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const baseDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;

            // Find the scene image — it may have a timestamp suffix (e.g. scene_2_1773499181762.jpg)
            let imagePath = null;
            if (fs.existsSync(baseDir)) {
                const prefix = `scene_${sceneIndex + 1}`;
                const match = fs.readdirSync(baseDir)
                    .filter(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                    .sort() // pick most recent if multiple
                    .pop();
                if (match) imagePath = path.join(baseDir, match);
            }
            // Fallback: exact name (legacy path)
            if (!imagePath) {
                const fallback = path.join(baseDir, `scene_${sceneIndex + 1}.jpg`);
                if (fs.existsSync(fallback)) imagePath = fallback;
            }

            const realModel = videoModel || 'veo_31_fast';
            const langStr = LANG_NAMES[language] || language || 'English';
            const promptToUse = `${videoPrompt} AUDIO TRACK: A highly emotional, panicked, and intense adult male voice ALMOST SCREAMING in ${langStr}. STRICTLY NO BACKGROUND NOISE, NO MUSIC, NO SOUND EFFECTS, JUST PURE RAW SHOUTING VOICE. Spoken text: "${scriptLine}"`;
            let referenceImages = [];
            if (imagePath && fs.existsSync(imagePath)) {
                console.log(`[Skeleton Video] Using reference image: ${imagePath}`);
                const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
                referenceImages.push({ data: `data:image/${ext};base64,${imageBase64}` });
            } else {
                console.warn(`[Skeleton Video] No reference image found for scene ${sceneIndex + 1} in: ${baseDir}`);
            }
            
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt: 1, maxAttempts: 1, state: 'generating' });
            
            videoFile = await generateVideoViaGLabs({
                prompt: promptToUse,
                model: realModel,
                mode: referenceImages.length > 0 ? 'start_image' : 'text_to_video',
                sectionDir: skeletonDir,
                subFolder: projectFolder,
                sceneIndex: sceneIndex,
                referenceImages: referenceImages,
                onProgress: (p) => {
                    event.sender.send('skeleton-video-progress', { sceneIndex, attempt: p.attempt, state: p.status, taskAttempt: 1 });
                }
            });

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

        // Get random categories for variety + exclusion list to avoid repeats
        const randomCats = getRandomCategories(3);
        const historyKey = `studio_${mode}_${language}`;
        const completedTopics = historyManager.getTopics(historyKey);
        const exclusionClause = completedTopics.length > 0
            ? `\nEXCLUSION LIST — DO NOT repeat or rephrase any of these previously generated ideas:\n${completedTopics.slice(-30).join('\n')}\n`
            : '';

        const randomSeed = Math.floor(Math.random() * 100000);

        const prompt = mode === 'health'
            ? `ШАГ 1 — ПОИСК ИДЕИ (Topic Finder) [Seed: ${randomSeed}]
               Provide me 5 highly viral LIFEHACK topic ideas for health-niche talking-object AI Shorts/Reels, where fruits, vegetables, or healthy foods become anthropomorphic expert characters inside the human body and reveal insider secrets about what they ACTUALLY do.

               FORMAT RULES:
               - Each idea must open with a HOOK LINE (1 sentence) that creates instant curiosity or shock.
               - Topic must center on ONE mass-interest health goal: fat burn, digestion, immunity, energy, hormones, skin, heart, blood sugar, or sleep.
               - The food characters are NOT fighting — they are EXPERT INSIDERS sharing secrets.
               - Each idea must include: Hook line + Food type + Core lifehack angle + Emotional payoff.
               - Visual-friendly for AI animation, 60–90 second format.
               ${exclusionClause}
               Target Language: ${langName}.
               
               Output ONLY a JSON object with an "ideas" array: 
               {"ideas": [{"original": "HOOK: [Hook Line]. TITLE: [Catchy Name]. FOODS: [Items]. HACK: [Secret]. PAYOFF: [Benefit]", "translation": "Полный перевод идеи на русский язык: ХУК: [Hook Line]. НАЗВАНИЕ: [Catchy Name]. ЕДА: [Items]. ЛАЙФХАК: [Secret]. ВЫГОДА: [Benefit]"}]}`
            : `ШАГ 1 — ПОИСК ИДЕИ (Topic Finder) [Seed: ${randomSeed}]
               Provide me 5 highly viral LIFEHACK topic ideas for a talking-objects Short/Reel, optimized for Instagram Reels and YouTube Shorts.

               🎯 THIS TIME, USE OBJECTS FROM THESE SPECIFIC CATEGORIES:
               ${randomCats.map((c, i) => `${i + 1}. ${c}`).join('\n               ')}

               Pick DIFFERENT, UNUSUAL, UNEXPECTED objects from those categories. DO NOT use generic items like "water bottle", "pillow", "toothbrush", "alarm clock" — those are overused. Be CREATIVE and SPECIFIC.

               FORMAT RULES:
               - Each idea must open with a HOOK LINE (1 sentence) that creates instant curiosity or shock.
               - The hook must sound like the object is revealing a secret, exposing a mistake, or sharing a trick that saves time/money/health.
               - Topic must center on ONE mass-interest problem: health, money, productivity, sleep, food, habits, or fitness.
               - The object is not fighting — it's TEACHING. It has an insider secret and can't wait to tell it.
               - Each idea must include: Hook line + Object name + Core lifehack angle + Emotional payoff.
               - Visual-friendly for AI animation, 30–60 second format.
               - ALL 5 ideas must use DIFFERENT objects. Maximum variety!
               ${exclusionClause}
               Target Language: ${langName}.
               Output ONLY a JSON object with an "ideas" array: {"ideas": [{"original": "Hook: [Your Hook Line]. Idea: [Your Idea Details]", "translation": "Полный перевод идеи на русский язык: Хук: [Your Hook Line]. Идея: [Your Idea Details]"}]}`;

        const raw = await callPollinations([{ role: 'user', content: prompt }], true);
        console.log(`[Studio Ideas] Categories used: ${randomCats.join(' | ')}`);
        console.log(`[Studio Ideas] Raw AI Result:`, raw);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw.match(/\[[\s\S]*\]/)?.[0] || raw;
            const parsed = JSON.parse(jsonText);
            
            let items = [];
            if (Array.isArray(parsed)) {
                items = parsed;
            } else if (parsed && Array.isArray(parsed.ideas)) {
                items = parsed.ideas;
            } else if (parsed && typeof parsed.original === 'string') {
                items = [parsed]; // AI only generated one object
            } else if (parsed && typeof parsed === 'object') {
                // Fallback: look for the first array value
                const firstArray = Object.values(parsed).find(Array.isArray);
                if (firstArray) items = firstArray;
            }

            const ideas = items.map(item => ({
                original: typeof item === 'string' ? item : (item.original || ''),
                translation: item.translation || item.russian || ''
            }));

            // Save generated ideas to history for future exclusion
            for (const idea of ideas) {
                if (idea.original) {
                    historyManager.addTopic(historyKey, idea.original.substring(0, 100));
                }
            }

            return ideas;
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
            systemInstruction = `You are a world-class AI medical animator and viral health scriptwriter.
            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line". NO TRUNCATION. NO '...'.
            4. "imagePrompt" Style: Cute friendly Pixar-style anthropomorphic character, round expressive eyes (warmth/knowledge), smiling mouth with visible lips (ready to reveal secrets), small human-like body. Placed inside a highly detailed realistic 3D human organ environment.
            5. TEAM EFFECT: Multiple smaller versions of the SAME character visible in background, performing the same action — "team of experts" feel.
            6. "videoPrompt" Style: Professional lip-sync animation (matching dialogue: ${langName}), subtle body movement using SYMBOLIC TOOLS (scrubbing brush, melting torch, hydrating spray, etc.), cinematic 9:16 vertical motion.
            7. Characters: Fruit/veg/superfoods acting as EXPERT INSIDERS. They are NOT fighting.`;

            userPrompt = `Generate a 7-scene viral health explainer script about "${topic}".
            STRUCTURE:
            - COVER SCENE: All characters together. Title overlay: "[TOPIC TITLE]". They say "We are the [TOPIC TITLE]".
            - HOOK SCENE (Scene 0): Lead character delivers a scroll-stopping opener (e.g., "You've been eating me wrong...").
            - LIFEHACK SCENES (Scenes 1-4): Each food character speaks ONE line (intro + what it does + tip for better work).
            - PAYOFF SCENE (Scene 5): Summary line + soft CTA.

            Target Language: ${langName}.
            Output JSON format:
            {
              "intro": "[VIRAL TITLE]",
              "scenes": [
                {
                  "id": 0,
                  "type": "cover",
                  "character": "All Characters",
                  "line": "We are the [Topic Title]",
                  "imagePrompt": "(In English) Pixar-style group shot of all foods [List of foods] holding health tools [List of tools], inside a 3D medical [organ environment], excited to reveal secrets. Title overlay: '[Topic Title]' in bold dynamic 3D letters. High-end medical explainer look.",
                  "videoPrompt": "(In English) Group lip-sync: 'We are the [Topic Title]'. All characters gesture with their tools, playful bounce, 9:16 framing, energetic opening."
                },
                {
                  "id": 1,
                  "type": "hook",
                  "character": "Lead [Food Name]",
                  "line": "[Hook line with emotion tag]",
                  "imagePrompt": "(In English) Hero Pixar-style [Food] with expressive eyes and lips, [emotion] pose, in background a team of smaller [Food]s working, inside 3D human [organ], dramatic lighting.",
                  "videoPrompt": "(In English) Lip-sync for hook: '[line]'. Heroic motion, team working in background, 9:16 vertical."
                },
                {
                  "id": 2,
                  "character": "[Food Name]",
                  "line": "Hello, I am [Name]. I [action] in your [organ] — and if you [tip], I work better. [emotion tag]",
                  "organ": "[organ name in English]",
                  "tool": "[symbolic tool in English]",
                  "imagePrompt": "(In English) Expert Pixar-style [character] using [tool] on realistic 3D [organ], team of smaller [character]s assisting, medical visualization style, 8k textures.",
                  "videoPrompt": "(In English) Lip-sync: '[line]'. [character] performs action with [tool] on [organ], animated effects (sparks/bubbles/glow), 9:16 framing."
                }
                // ... continue for scenes 3-6 (id 3-6)
              ]
            }`;
        } else {
            systemInstruction = `You are a viral Short/Reel LIFEHACK scriptwriter specialized in "Talking Objects Revelation".
            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST include the EXACT FULL DIALOGUE word-for-word from "line". NO TRUNCATION. NO '...'.
            4. "imagePrompt" Style: Object must look ALIVE and KNOWLEDGEABLE — like an expert, not a brawler. Pixar-style round expressive eyes, visible lips/mouth for talking, placed in a realistic high-quality environment matching the setting.
            5. "videoPrompt" Style: Professional lip-sync animation (matching dialogue: ${langName}), expert personality, direct and confident body language, slow cinematic 9:16 vertical camera.
            6. Characters: Object(s) are alive and acting as insider experts — they know things about themselves that humans don't. This is NOT a fight. This is a REVELATION.
            7. Each "line" must include an emotion tag: [shocked], [proud], [whispering], [excited], [smug], [revealing].`;

            userPrompt = `📌 ШАГ 2 — СЦЕНАРИЙ (Lifehack Script)
            Create a viral short LIFEHACK script with exactly 5 scenes for "${topic}".
            
            SCRIPT RULES:
            - Scene 1 = HOOK: Object says something that stops the scroll instantly.
            - Scenes 2–4 = THE LIFEHACK THREAD: 2–3 concrete tips, tricks, or facts delivered fast, with personality. one per scene. Use reactions/gasps between objects.
            - Scene 5 = PAYOFF + CTA: End with a clear benefit summary OR a cliffhanger.

            FORMAT (Output JSON):
            {
              "intro": "Viral Title in ${langName}",
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
            
            // Post-processing: Replace [line] placeholders if AI missed them
            if (parsed.scenes && Array.isArray(parsed.scenes)) {
                parsed.scenes = parsed.scenes.map(scene => {
                    if (scene.videoPrompt && scene.videoPrompt.includes('[line]') && scene.line) {
                        scene.videoPrompt = scene.videoPrompt.replace('[line]', scene.line);
                    }
                    if (scene.videoPrompt && scene.videoPrompt.includes('[INSERT ACTUAL DIALOGUE LINE HERE') && scene.line) {
                        scene.videoPrompt = scene.videoPrompt.replace(/\[INSERT ACTUAL DIALOGUE LINE HERE[^\]]*\]/, scene.line);
                    }
                    return scene;
                });
            }
            
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

module.exports = { synthesizeUnifiedSpeech, registerSkeletonHandlers, callPollinations };
