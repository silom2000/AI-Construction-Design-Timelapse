// ============ SKELETON SHORTS вЂ” WAN V2.6 720P ============
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

// в”Ђв”Ђ Object Categories for diverse lifehack idea generation (NO FOOD) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const OBJECT_CATEGORIES = [
    // РџР Р•Р”РњР•РўР« Р”РћРњРђРЁРќР•Р“Рћ РћР‘РРҐРћР”Рђ
    { theme: 'Household', objects: ['furniture', 'bedroom objects', 'bathroom items', 'cleaning tools', 'electrical appliances', 'doors & windows', 'pillows & blankets', 'storage items', 'lights & fans', 'laundry items'] },
    // РћР¤РРЎРќРђРЇ Р–РР—РќР¬
    { theme: 'Office & Work', objects: ['desk objects', 'laptop & accessories', 'stationery', 'printer & scanner', 'office furniture', 'work-from-home setup', 'ID card & access card', 'files & folders', 'cable management', 'meeting room objects'] },
    // РўР Р•РќРђР–Р•Р РќР«Р™ Р—РђР›
    { theme: 'Gym & Fitness', objects: ['gym equipment', 'dumbbells & weights', 'cardio machines', 'gym accessories', 'fitness tracking devices', 'gym lockers', 'workout clothes', 'yoga equipment', 'resistance bands', 'gym bags'] },
    // Р—Р”РћР РћР’Р¬Р• Р РўР•Р›Рћ
    { theme: 'Health & Body', objects: ['internal organs', 'bones & muscles', 'immune system parts', 'digestive system', 'heart vs brain', 'hormones', 'blood cells', 'senses (eyes, ears)', 'mental health emotions', 'body parts vs habits'] },
    // РўР•РҐРќРћР›РћР“РР
    { theme: 'Tech & Digital', objects: ['mobile apps', 'phone components', 'social media platforms', 'notifications', 'AI tools', 'gadgets', 'cables & chargers', 'gaming devices', 'smart home devices', 'digital files'] },
    // Р”Р•РќР¬Р“Р
    { theme: 'Money & Finance', objects: ['wallet contents', 'credit cards', 'coins & cash', 'bills & expenses', 'savings vs spending', 'investment assets', 'budget categories', 'subscription services', 'salary breakdown', 'shopping items'] },
    // РЁРљРћР›Рђ Р РЈР§РЃР‘Рђ
    { theme: 'School & Study', objects: ['school stationery', 'books', 'exam papers', 'classroom objects', 'backpack contents', 'homework materials', 'grades & marks', 'online class tools', 'study apps', 'library books'] },
    // РџРЈРўР•РЁР•РЎРўР’РРЇ
    { theme: 'Travel & Outdoors', objects: ['luggage items', 'travel accessories', 'vehicle parts', 'road objects', 'tourist items', 'airport objects', 'train station items', 'hotel room items', 'weather elements', 'camping gear'] },
    // Р’Р•РЎРЃР›Р«Р™ Р Р’РР РЈРЎРќР«Р™
    { theme: 'Fun & Viral', objects: ['emojis', 'alphabet letters', 'numbers', 'colors', 'sounds', 'emotions', 'habits', 'daily routines', 'time periods', 'life stages'] }
];

// —— Pixar Cinematic Image Prompt Variants ———————————————————————
const PIXAR_IMAGE_VARIANTS = [
    {
        id: 'A', name: 'Heroic Drama',
        template: (character) => `heroic Pixar 3D style anthropomorphic object ${character}, the physical object has expressive cartoon eyes and mouth on its surface, extreme low angle shot, placed in its natural detailed environment, hard spotlight from above, sharp object shadows, cinematic 2.39:1 crop, action-movie mood`
    },
    {
        id: 'B', name: 'Discovery Moment',
        template: (character) => `shocked Pixar 3D style anthropomorphic object ${character}, the physical object has huge expressive eyes and mouth on its surface, motion lines around the object, placed in its natural detailed environment, dramatic backlighting, rim light halo, fisheye lens distortion`
    },
    {
        id: 'C', name: 'Noir Moody',
        template: (character) => `moody Pixar 3D style anthropomorphic object ${character}, the physical object has cartoon eyes and mouth on its surface, placed in its natural detailed environment, single neon light source, rain reflections, low angle shot, confident expression, dramatic shadows, 2.39:1 widescreen`
    },
    {
        id: 'D', name: 'Fun Chaos',
        template: (character) => `funny Pixar 3D style anthropomorphic object ${character}, the physical object has a mischievous grin and cartoon eyes on its surface, placed in its natural detailed environment, extreme fisheye lens, dutch tilt, bright saturated colors, speed lines, high-energy mood`
    }
];

// —— Pixar Base Image Prompt (appended to every variant) ————————
const PIXAR_IMAGE_BASE = `Pixar 3D CGI animation, ultra-cinematic lighting, clear detailed background, physically-based rendering, bold shadows, teal-orange color grading`;

const TALKING_OBJECT_IMAGE_LOCK = `The character is only the physical object named in CHARACTER, with cartoon eyes and a mouth on its surface. The background environment contains only contextual props relevant to this object.`;

// в”Ђв”Ђ VEO Video Motion Variants в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const PIXAR_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'Hyper-Dynamic Multi-Cut',
        template: `CAMERA MOVEMENT: HYPER-DYNAMIC CONTINUOUS SEQUENCE over 8 seconds. 0-2s: FAST CRASH ZOOM into extreme close-up of the object's mouth speaking. 2-5s: RAPID WHIP PAN into a fast 180-degree ORBIT around the object, tracking its motion with slight Dutch tilt. 5-8s: SNAP ZOOM OUT to a low-angle hero shot. Hyper-kinetic continuous camera movement without hard cuts. Subject's expressive face and mouth MUST remain visible for accurate lip-sync.`
    },
    {
        id: 'B', name: 'Cinematic Montage',
        template: `CAMERA MOVEMENT: CINEMATIC CONTINUOUS FLOW over 8 seconds. 0-3s: MACRO CLOSE-UP panning slowly across the object's face. 3-6s: SMOOTH FAST DOLLY PUSH-OUT to reveal the surrounding environment. 6-8s: CONTINUOUS SWOOPING DRONE-STYLE SHIFT to a dynamic angle while keeping the object's face in view. Subject bounces slightly (breathing life). Continuous flow without hard cuts to maintain perfect lip-sync.`
    },
    {
        id: 'C', name: 'Action & Rack Focus',
        template: `CAMERA MOVEMENT: HIGH-ENERGY RACK FOCUS AND DOLLY over 8 seconds. 0-2s: Subject is blurred in foreground, rapid RACK FOCUS to reveal the face sharply. 2-5s: FAST DOLLY ZOOM (Vertigo effect) expanding the background while subject stays fixed. 5-8s: RAPID SPIRALING ZOOM moving closer to the object's expressive eyes and mouth. Intense continuous visual storytelling without hard cuts. Face stays visible for lip-sync.`
    },
    {
        id: 'D', name: 'TikTok Viral Cuts',
        template: `CAMERA MOVEMENT: FAST-PACED VIRAL MOVEMENT over 8 seconds. 0-2s: EXTREME CLOSE-UP front-facing on the speaking mouth, maximum impact. 2-4s: SNAP ZOOM OUT to a mid-shot with slight handheld camera breathing. 4-6s: RAPID CRANE UP to a high-angle looking down at the face. 6-8s: CRASH ZOOM back into the object's face. Constant continuous camera movement, high-tension pacing without hard cuts. Face remains visible for lip-sync.`
    }
];

// в”Ђв”Ђ Video Base Motion & Safety (appended to every variant) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const PIXAR_VIDEO_STYLE = `STYLE: Pixar 3D animation style, anthropomorphic character, award-winning CGI, vibrant colors, physically-based rendering.
 CHARACTER FACE: TWO round cartoon eyes positioned symmetrically on the upper front panel, ONE wide horizontal smile mouth (coin-slot shape), friendly Pixar-style expression. Eyes: large, white with colored irises, no monocle, no single eye. Mood: confident and energetic, NOT scary, NOT monstrous.`;
const PIXAR_VIDEO_MOTION = `ENERGY: high-tension buildup — feels like something is about to explode, cinematic music-video pacing.
ENDING (last 1s): slow push-in continues + slight rack focus shift.`;
const PIXAR_VIDEO_NEGATIVE = `VISUAL RULE: No written text, subtitles, captions, speech bubbles, or text overlays visible at any point.`;
const PIXAR_VIDEO_SAFETY = `NOT: static locked camera, no movement, boring zoom only, lifeless scene, everything still.`;

/** Pick a variant by rotating through the array based on scene index */
function pickVariant(variants, sceneIndex) {
    return variants[sceneIndex % variants.length];
}

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

// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
// VoiseAPI (https://voiceapi.csv666.ru) вЂ” ASYNC TASK FLOW
// POST /tasks в†’ {task_id: N} в†’ poll GET /tasks/{id} в†’ download audio
// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
// VoiseAPI async task flow вЂ” CORRECT IMPLEMENTATION
// POST /tasks в†’ {task_id: N} в†’ poll в†’ download binary MP3
// в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђ
const _voiseApiAxios = require('axios');

async function synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
    const apiKey = process.env.ElevenLabs_API;
    if (!apiKey) throw new Error('[Voice] ElevenLabs_API key not set');

    console.log(`[Voice] Direct ElevenLabs TTS: voice=${voiceId} text=${text.length}chars`);
    
    const response = await _voiseApiAxios.post(
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
    if (buf.length < 100) throw new Error(`[Voice] Direct ElevenLabs result too small: ${buf.length}B`);
    
    // Check if it's actually audio (ID3 or MPEG sync)
    const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
    if (!isID3 && !isSync) {
        throw new Error(`[Voice] Direct ElevenLabs returned invalid audio buffer`);
    }

    const dir = require('path').dirname(outputPath);
    if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
    require('fs').writeFileSync(outputPath, buf);
    console.log(`[Voice] Direct ElevenLabs Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
}

async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
    if (process.env.ElevenLabs_API) {
        return await synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
    }
    const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
    if (!apiKey) throw new Error('[Voice] VOICEAPI_KEY not set');

    const VOISE_BASE = process.env.VOISE_API_BASE || 'https://voiceapi.csv666.ru';
    // вњ… CORRECT AUTH: X-API-Key header (per API docs securitySchemes)
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
    // Statuses: waiting в†’ processing в†’ ending (ready!) в†’ ending_processed
    for (let n = 0; n < 60; n++) {
        await new Promise(r => setTimeout(r, 3000));
        const sr = await _voiseApiAxios.get(`${VOISE_BASE}/tasks/${taskId}/status`, { headers: hdrs });
        const t = sr.data;
        const st = ((t.status || '')).toLowerCase();
        console.log(`[Voice] task=${taskId} status=${st} (${n+1}/60)`);
        if (st === 'error' || st === 'error_handled') throw new Error('[Voice] Task failed: ' + JSON.stringify(t).slice(0, 200));

        // "ending" = result ready
        if (st === 'ending' || st === 'ending_processed') {
            console.log(`[Voice] Status "${st}" вЂ” downloading /tasks/${taskId}/result`);
            const ar = await _voiseApiAxios.get(`${VOISE_BASE}/tasks/${taskId}/result`, { responseType: 'arraybuffer', headers: hdrs });
            const buf = Buffer.from(ar.data);
            if (buf.length < 100) throw new Error(`[Voice] Too small: ${buf.length}B`);
            const dir = require('path').dirname(outputPath);
            if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
            require('fs').writeFileSync(outputPath, buf);
            console.log(`[Voice] Saved: ${outputPath} (${buf.length}B)`);
            return outputPath;
        }
        // waiting / processing вЂ” keep polling
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

const CHARACTER_ANCHOR = `A full-body Pixar-style animated humanoid figure rendered in a crystal-clear glass material, fully transparent outer shell revealing an ivory-white internal structural framework inside. The character's face area: two large round glowing yellow eyes with dark pupils, a friendly neutral expression, smooth rounded cranium with no surface detail. The body framework inside the glass silhouette is composed of smooth, polished ivory-colored rigid structural elements — arms, legs, torso core, joints — all anatomically proportioned but stylized for animation. Medical-illustration aesthetic: clean, modern, clinical, bright studio lighting. Style: Pixar 3D CGI, physically-based rendering, 8K, cinematic quality. NOT horror, NOT scary, NOT damaged, NOT dark. ABSOLUTE RULES: NO MUSIC. STERNLY FOLLOW text for lip-sync. NO independent translations.`;

// в”Ђв”Ђ Pollinations helper в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
const WORKING_TEXT_MODELS = ['gemini-3.1-pro-high', 'gemini-3.1-pro', 'gpt-4o', 'gpt-4-turbo'];

const callPollinations = async (messages, jsonMode = false, forcedProvider = null) => {
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

    // Reorder: forcedProvider > DEFAULT_AI_PROVIDER > default
    const defaultProvider = forcedProvider || process.env.DEFAULT_AI_PROVIDER || 'pollinations';
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

// ── Real-time trend search via Perplexity (web search) ──────────────────────
const searchTrends = async (langName, mode, season, month, year) => {
    const pollinationsUrl = process.env.POLLINATIONS_API_URL || 'https://gen.pollinations.ai/v1/chat/completions';
    const pollinationsKey = process.env.POLLINATIONS_API_KEY;

    const trendQuery = mode === 'health'
        ? `What are the top 5 trending health and wellness topics on TikTok and Instagram Reels RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Focus on: viral health hacks, body/nutrition tips, seasonal health issues. Return ONLY a short bullet list of trending topics, no explanations.`
        : `What are the top 5 trending lifehack and DIY topics on TikTok and Instagram Reels RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Focus on: home hacks, productivity tricks, money-saving tips, seasonal problems (${season}). Return ONLY a short bullet list of trending topics, no explanations.`;

    try {
        console.log(`[Trend Search] Searching trends via perplexity-fast for ${langName} (${month} ${year})...`);
        const { request } = require('undici');
        const headers = { 'Content-Type': 'application/json' };
        if (pollinationsKey) headers['Authorization'] = `Bearer ${pollinationsKey}`;

        const { statusCode, body: resBody } = await request(pollinationsUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: 'perplexity-fast',
                messages: [{ role: 'user', content: trendQuery }]
            })
        });

        const text = await resBody.text();
        if (statusCode === 200) {
            const data = JSON.parse(text);
            const trends = data.choices?.[0]?.message?.content || '';
            console.log(`[Trend Search] Found trends: ${trends.substring(0, 200)}...`);
            return trends;
        }
        console.warn(`[Trend Search] perplexity-fast returned ${statusCode}, falling back to seasonal context`);
        return null;
    } catch (e) {
        console.warn(`[Trend Search] Failed: ${e.message}, falling back to seasonal context`);
        return null;
    }
};

// `uploadToImgBB`, `createVideoViaFreepikPixVerse`, `createVideoViaPollinationsLTX2TextOnly` and other legacy generation functions were removed in favor of `glabs-handlers.cjs`

// в”Ђв”Ђ РћС‡РёСЃС‚РєР° РїР°РїРєРё Audio РїРµСЂРµРґ РЅРѕРІРѕР№ РіРµРЅРµСЂР°С†РёРµР№ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
                console.warn(`[cleanupAudioDir] РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ ${file}: ${e.message}`);
            }
        }
        console.log(`[cleanupAudioDir] РЈРґР°Р»РµРЅРѕ ${removed} С„Р°Р№Р»РѕРІ РёР· Audio/`);
    } catch (e) {
        console.error(`[cleanupAudioDir] РћС€РёР±РєР°: ${e.message}`);
    }
}

// в”Ђв”Ђ Preview re-encoding helper в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

// в”Ђв”Ђ Audio muxing helper в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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

        const scriptForUI = segmentsArray.map(s => `${s.original}\n[рџ‡·рџ‡є ${s.translation}]`).join('\n\n');
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
            image_prompt: `A full-body Pixar-style animated humanoid figure with a crystal-clear glass outer shell revealing a smooth ivory-white internal structural framework. Face: two large glowing yellow eyes with dark pupils, friendly neutral expression, rounded smooth head. Body framework: polished ivory-colored rigid structural elements — arms, legs, torso core, joints — all proportioned and stylized. Medical-illustration aesthetic: clean, modern, clinical, bright studio lighting. Pixar 3D CGI, physically-based rendering, 8K cinematic quality. NOT horror, NOT scary. Environment: ${s.environment}. Pose: ${s.pose_action}. ${s.visual_detail} Vibrant saturated colors, high contrast, BOLD LARGE OBJECTS in the background to ground the scene, masterpiece quality.`,

            // TASK 3: IMAGE-TO-VIDEO PROMPTS
            video_prompt: `Cinematic motion: ${s.motion_detail}. Action: character ${s.pose_action}. Cinematic camera move (smooth dolly or slow-motion zoom), vibrant saturated colors, high resolution, masterpiece quality, fluid movement.`,

            // LTX-2 SPECIFIC RULES (Prompt.md requirements: Anchor at start, Audio label, Negative prompt)
            ltx_video_prompt: `STRICTLY NO TEXT, NO SUBTITLES, NO CAPTIONS. ${CHARACTER_ANCHOR} CHARACTER FACE: TWO round cartoon eyes positioned symmetrically on the upper front panel, ONE wide horizontal smile mouth (coin-slot shape), friendly Pixar-style expression. Eyes: large, white with colored irises, no monocle, no single eye. Mood: confident and energetic, NOT scary, NOT monstrous. ACTION: ${s.pose_action}. ENVIRONMENT: ${s.environment}. CINEMATIC CAMERA: Smooth tracking or slow-motion zoom. VIBRANT COLORS, HIGH SATURATION. AUDIO NARRATION ONLY (DO NOT SHOW AS TEXT): "${s.script_line}". NEGATIVE PROMPT: human skin, realistic face, muscles, organs, veins, blurry, low quality, watermark, text, subtitles, captions, asymmetric face, single eye, cyclopean, distorted features, uncanny valley expression.`
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
        const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';
        
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

            // Find the scene image вЂ” it may have a timestamp suffix (e.g. scene_2_1773499181762.jpg)
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

            const realModel = videoModel || 'veo_31_lite';
            const langStr = LANG_NAMES[language] || language || 'English';
            
            // If the prompt already has structured metadata (from Studio mode), use it as is.
            // Otherwise (Skeleton mode), append the default intense voice.
            let promptToUse = videoPrompt;
            if (!videoPrompt.includes('CHARACTER:') && !videoPrompt.includes('NEGATIVE PROMPT:')) {
                promptToUse = `${videoPrompt} AUDIO TRACK: A highly emotional, panicked, and intense adult male voice ALMOST SCREAMING in ${langStr}. STRICTLY NO BACKGROUND NOISE, NO MUSIC, NO SOUND EFFECTS, JUST PURE RAW SHOUTING VOICE. Spoken text: "${scriptLine}"`;
            } else if (!videoPrompt.includes('AUDIO TRACK:')) {
                // Ensure audio track is present for lip-sync if not already there
                promptToUse += ` AUDIO TRACK: Professional character voice speaking exactly: "${scriptLine}". LIP-SYNC: Accurate mouth movement.`;
            }
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

    ipcMain.handle('studio-generate-ideas', async (event, { mode, language, provider }) => {
        const langName = LANG_NAMES[language] || 'English';

        // Cultural context mapping for different languages/countries
        const culturalContext = {
            'English': 'Western lifestyle (USA, UK, Canada, Australia): focus on productivity hacks, tech gadgets, work-from-home, fitness culture, time management',
            'German': 'German lifestyle: focus on engineering precision, efficiency, eco-friendly solutions, punctuality, quality tools, organized living',
            'French': 'French lifestyle: focus on style, elegance, home comfort, work-life balance, aesthetic solutions, culinary tools (non-food), fashion accessories',
            'Spanish': 'Spanish lifestyle: focus on social life, family time, siesta culture, outdoor living, warm climate solutions, festive preparations',
            'Italian': 'Italian lifestyle: focus on design, craftsmanship, family traditions, home aesthetics, fashion, artisan tools',
            'Russian': 'Russian lifestyle: focus on practical solutions, winter survival, apartment living, DIY repairs, resourcefulness, durability',
            'Polish': 'Polish lifestyle: focus on home improvement, practical hacks, seasonal challenges, family gatherings, budget-friendly solutions',
            'Portuguese': 'Portuguese/Brazilian lifestyle: focus on tropical climate, beach culture, compact living, resourcefulness, social gatherings',
            'Chinese': 'Chinese lifestyle: focus on space-saving, urban living, efficiency, traditional wisdom meets modern tech, family harmony',
            'Japanese': 'Japanese lifestyle: focus on minimalism, organization, small spaces, precision, quality over quantity, seasonal living'
        };

        const cultureNote = culturalContext[langName] || culturalContext['English'];

        // Get random categories for variety + exclusion list to avoid repeats
        const randomCats = getRandomCategories(3);
        const historyKey = `studio_${mode}_${language}`;
        const completedTopics = historyManager.getTopics(historyKey);
        const exclusionClause = completedTopics.length > 0
            ? `\nEXCLUSION LIST вЂ” DO NOT repeat or rephrase any of these previously generated ideas:\n${completedTopics.slice(-30).join('\n')}\n`
            : '';

        const randomSeed = Math.floor(Math.random() * 100000);

        // Build seasonal/trend context from current date
        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const currentMonth = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        const seasonMap = { 0:'winter',1:'winter',2:'spring',3:'spring',4:'spring',5:'summer',6:'summer',7:'summer',8:'autumn',9:'autumn',10:'autumn',11:'winter' };
        const currentSeason = seasonMap[now.getMonth()];

        // Country-specific seasonal trends
        const seasonalTrends = {
            'English': {
                'winter': 'New Year resolutions, cold weather hacks, heating bills, holiday cleanup, winter skincare',
                'spring': 'spring cleaning, allergy season, gardening start, decluttering, tax season tips',
                'summer': 'heat survival, vacation packing, sunscreen hacks, outdoor living, energy saving',
                'autumn': 'back to school, fall organization, cold prevention, daylight saving, cozy home setup'
            },
            'Russian': {
                'winter': 'новогодняя подготовка, экономия на отоплении, зимний уход за авто, лайфхаки от холода, сухой воздух в квартире',
                'spring': 'весенняя уборка, дача/огород, аллергия на пыльцу, смена шин, расхламление балкона',
                'summer': 'спасение от жары, комары и мошки, отпуск и путешествия, дача, защита от солнца',
                'autumn': 'школа и учёба, осенняя хандра, подготовка авто к зиме, сезон простуд, утепление окон'
            },
            'French': {
                'winter': 'fêtes de fin d\'année, chauffage économique, soldes d\'hiver, ski et montagne, soins peau sèche',
                'spring': 'ménage de printemps, jardinage, allergies, Tour de France prep, rangement maison',
                'summer': 'canicule, vacances, plage, anti-moustiques, économies d\'énergie',
                'autumn': 'rentrée scolaire, vendanges, bricolage maison, rhume et grippe, changement d\'heure'
            },
            'German': {
                'winter': 'Weihnachtsvorbereitung, Heizkosten sparen, Winterreifen, Erkältung vorbeugen, Silvester',
                'spring': 'Frühjahrsputz, Garten, Pollenallergie, Steuererklärung, Balkon bepflanzen',
                'summer': 'Hitze-Tipps, Urlaub, Grillen, Energiesparen, Insektenschutz',
                'autumn': 'Schulanfang, Herbstdeko, Auto winterfest, Erkältungszeit, Zeitumstellung'
            },
            'Spanish': {
                'winter': 'Navidad, ahorro calefacción, rebajas, resaca Año Nuevo, piel seca',
                'spring': 'limpieza primaveral, alergia, Semana Santa, organización armarios, jardín',
                'summer': 'ola de calor, vacaciones, playa, mosquitos, ahorro energía',
                'autumn': 'vuelta al cole, otoño en casa, resfriados, cambio de hora, ahorro'
            },
            'Polish': {
                'winter': 'święta Bożego Narodzenia, ogrzewanie, zimowe hacki, sylwester, suche powietrze',
                'spring': 'wiosenne porządki, ogród, alergia, działka, rozchlamienie',
                'summer': 'upały, wakacje, komary, działka, oszczędzanie energii',
                'autumn': 'powrót do szkoły, jesienne przeziębienia, przygotowanie auta na zimę, zmiana czasu'
            }
        };

        const langTrends = seasonalTrends[langName] || seasonalTrends['English'];
        const fallbackTrendContext = langTrends[currentSeason] || langTrends['winter'];

        // 🔍 Real-time web search for current trends via Perplexity
        const liveTrends = await searchTrends(langName, mode, currentSeason, currentMonth, currentYear);
        const trendContext = liveTrends
            ? `🔍 LIVE WEB SEARCH RESULTS (real trending topics RIGHT NOW):\n${liveTrends}\n\n📋 Seasonal fallback: ${fallbackTrendContext}`
            : `📋 Seasonal trends: ${fallbackTrendContext}`;

        const prompt = mode === 'health'
            ? `ШАГ 1 — ПОИСК ИДЕЙ (Topic Finder) [Seed: ${randomSeed}]
               📅 TODAY: ${currentMonth} ${currentYear}, season: ${currentSeason}.
               🔥 CURRENT TRENDS for ${langName}-speaking audience:
               ${trendContext}

               Provide me 3 highly viral LIFEHACK topic ideas for health-niche talking-object AI Shorts/Reels, where fruits, vegetables, or healthy foods become anthropomorphic expert characters inside the human body and reveal insider secrets about what they ACTUALLY do.

               IDEAS MUST BE RELEVANT TO THE CURRENT SEASON AND MONTH. Think about what health problems people face RIGHT NOW in ${currentMonth}.

               FORMAT RULES:
               - Each idea must open with a HOOK LINE (1 sentence) that creates instant curiosity or shock.
               - Topic must center on ONE mass-interest health goal: fat burn, digestion, immunity, energy, hormones, skin, heart, blood sugar, or sleep.
               - The food characters are NOT fighting — they are EXPERT INSIDERS sharing secrets.
               - Each idea must include: Hook line + Food type + Core lifehack angle + Emotional payoff.
               - Visual-friendly for AI animation, 60–90 second format.
               ${exclusionClause}
               Target Language: ${langName}.

               Output ONLY a JSON object with an "ideas" array (EXACTLY 3 ideas):
               {"ideas": [{"original": "HOOK: [Hook Line]. TITLE: [Catchy Name]. FOODS: [Items]. HACK: [Secret]. PAYOFF: [Benefit]", "translation": "Полный перевод идеи на русский язык: ХУК: [Hook Line]. НАЗВАНИЕ: [Catchy Name]. ЕДА: [Items]. ЛАЙФХАК: [Secret]. ВЫГОДА: [Benefit]"}]}`
            : `ШАГ 1 — ПОИСК ИДЕЙ (Topic Finder) [Seed: ${randomSeed}]
               📅 TODAY: ${currentMonth} ${currentYear}, season: ${currentSeason}.
               🔥 CURRENT TRENDS for ${langName}-speaking audience:
               ${trendContext}

               Provide me 3 highly viral LIFEHACK topic ideas for a talking-objects Short/Reel, optimized for TikTok, Instagram Reels and YouTube Shorts.

               🎯 THIS TIME, USE OBJECTS FROM THESE SPECIFIC CATEGORIES:
               ${randomCats.map((c, i) => `${i + 1}. ${c}`).join('\n               ')}

               🌍 CULTURAL ADAPTATION FOR ${langName.toUpperCase()}:
               ${cultureNote}

               📆 SEASONAL RELEVANCE (CRITICAL):
               Your ideas MUST be relevant to ${currentMonth} ${currentYear}. Think about what people in ${langName}-speaking countries are dealing with RIGHT NOW:
               - Current seasonal challenges: ${trendContext}
               - What everyday problems are people solving this month?
               - What objects become especially relevant in ${currentSeason}?

               IMPORTANT: Adapt lifehacks to match the lifestyle, climate, living conditions, and daily challenges specific to ${langName}-speaking countries.

               Pick DIFFERENT, UNUSUAL, UNEXPECTED objects from those categories. Be CREATIVE and SPECIFIC. Avoid generic overused items like "water bottle", "pillow", "toothbrush", "alarm clock".

               STRICTLY FORBIDDEN:
               - Food items (fruits, vegetables, meals, snacks, drinks, ingredients)
               - Kitchen utensils related to food preparation
               - Eating or cooking-related objects
               - Focus on NON-FOOD lifehacks only

               FORMAT RULES:
               - Each idea must open with a HOOK LINE (1 sentence) that creates instant curiosity or shock.
               - The hook must sound like the object is revealing a secret, exposing a mistake, or sharing a trick that saves time/money/health.
               - Topic must center on ONE mass-interest problem: health, money, productivity, sleep, habits, fitness, or home organization.
               - The object is not fighting — it's TEACHING. It has an insider secret and can't wait to tell it.
               - Each idea must include: Hook line + Object name + Core lifehack angle + Emotional payoff.
               - Visual-friendly for AI animation, 30-60 second format.
               - ALL 3 ideas must use DIFFERENT objects. Maximum variety!
               ${exclusionClause}
               Target Language: ${langName}.
               Output ONLY a JSON object with an "ideas" array (EXACTLY 3 ideas): {"ideas": [{"original": "Hook: [Your Hook Line]. Idea: [Your Idea Details]", "translation": "Полный перевод идеи на русский язык: Хук: [Your Hook Line]. Идея: [Your Idea Details]"}]}`;

        const raw = await callPollinations([{ role: 'user', content: prompt }], true, provider);
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

    ipcMain.handle('studio-generate-script', async (event, { mode, topic, language, provider }) => {
        const langName = LANG_NAMES[language] || 'English';

        let systemInstruction = "";
        let userPrompt = "";

        if (mode === 'health') {
            systemInstruction = `You are a world-class AI medical animator and viral health scriptwriter.
            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line". NO TRUNCATION. NO '...'.
            4. IMAGE STYLE (PIXAR CINEMATIC): Pixar 3D animation style, ultra-cinematic lighting, dramatic depth of field, subject fills 70% of frame, physically-based rendering, 8K, award-winning CGI, bold graphic shadows, teal-orange color grade.
               - Variant A (Heroic): Standing triumphantly, low angle, dramatic clouds, hard spotlight.
               - Variant B (Discovery): Shocked eyes, jaw dropped, motion lines, confetti, fisheye, backlighting.
               - Variant C (Noir): Moody neon, rain reflections, volumetric fog, low angle, shadow play.
               - Variant D (Chaos): Funny action, dutch tilt 15, speed lines, explosion of objects.
            5. VIDEO MOTION (PIXAR DYNAMIC):
               - Variant A (Energetic): FAST CRASH ZOOM in, camera shakes, SMOOTH ORBIT 180, speed ramp.
               - Variant B (Cinematic Reveal): EXTREME CLOSE detail, slow PULL BACK dolly, world builds.
               - Variant C (Dramatic Rise): Floor level (worm's eye), slow CRANE UP to eye level, hero moment.
               - Variant D (TikTok Hook): INSTANT CUT (100% face), camera BREATHES, reaction at 2s, SMASH ZOOM.
            6. ABSOLUTE RULES: NO HUMAN HEADS, NO HUMAN SKIN, NO HUMAN FACES. The character MUST REMAINS THE PHYSICAL FRUIT/VEGETABLE.
            7. The CTA SCENE (Scene 5) MUST be delivered with warmth, care, and love, explicitly inviting the viewer to subscribe AND leave a comment for a healthier life.
            8. The PAYOFF SCENE (Scene 6) MUST provide a final summary and warm closing.`;

            userPrompt = `Generate a 7-scene viral health explainer script about "${topic}".
            For each scene, choose a Variant (A, B, C, or D) for image and video that fits the mood. 
            Rotate variants to ensure diversity (e.g., Scene 1 = A, Scene 2 = B, etc.).

            Output JSON format:
            {
              "intro": "[VIRAL TITLE]",
              "scenes": [
                {
                  "id": 0,
                  "type": "cover",
                  "character": "All Characters",
                  "line": "We are the [Topic Title]",
                  "imageVariant": "A",
                  "videoVariant": "A",
                  "imagePrompt": "(In English) Briefly describe the scene character and action, the variant template will be applied automatically.",
                  "videoPrompt": "(In English) Briefly describe the character motion, the variant template will be applied automatically. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        } else {
            systemInstruction = `You are a viral Short/Reel LIFEHACK scriptwriter specialized in "Talking Objects Revelation".
            You write scripts that feel alive — every line has tension, personality, and purpose.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST include the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. IMAGE STYLE (PIXAR CINEMATIC): Use Pixar 3D animation style, ultra-cinematic lighting, dramatic depth of field, teal-orange color grade.
               - Variants: A (Heroic), B (Discovery), C (Noir), D (Chaos).
               - The visual subject is always a talking physical object with expressive eyes and a lip-sync mouth directly on the object's surface.
               - Show object tilt, bounce, lean, or object-specific motion.
            5. VIDEO MOTION (PIXAR DYNAMIC):
               - Variants: A (Energetic), B (Reveal), C (Rise), D (TikTok Hook).
            6. Only describe what is present in the scene. The image and video depict only the physical object itself. Do not write negative constraints or exclusions; describe the scene positively, focused entirely on the object.
            7. **STRICT BACKGROUND/HABITAT RULE**: Place the object in its logical, real-world environment. A parking meter belongs on a city sidewalk. A gas pump belongs at a gas station. Always describe the correct natural background in every "imagePrompt" and "videoPrompt".
            8. Each "line" must include an emotion tag: [shocked], [proud], [whispering], [excited], [warmly], [smug], etc.
            9. ABSOLUTE VIDEO VISUAL RULE: Voice/audio only. The spoken dialogue must never appear as visible text, subtitles, captions, or speech bubbles in the video.

            10. 🎬 DRAMATIC ARC & DIALOGUE LENGTH (THIS IS THE MOST IMPORTANT RULE):
                Each video clip is exactly 8 seconds. The dialogue must fill the clip appropriately. Follow these STRICT word counts:

                📍 Scene 1 — THE HOOK (6-10 words):
                   Scroll-stopper. Short, punchy, confrontational. Address the viewer informally ("ты" in Russian, informal "you" otherwise).
                   The silence after the hook builds suspense. The object stares at the viewer.
                   Example tone: "Ты опять делаешь это неправильно?" / "Хватит игнорировать меня каждое утро!"

                📍 Scene 2 — THE INTRIGUE (16-20 words, MINIMUM 16!):
                   The object explains what's really going on. Builds curiosity. The viewer thinks "wait, what?"
                   Must fill 6-7 seconds of the 8-second clip. Dense, informative, but still conversational. Write at least 2 full sentences.

                📍 Scene 3 — THE REVELATION (16-20 words, MINIMUM 16!):
                   The emotional twist. The "aha!" moment. The object reveals something surprising.
                   Dense speech, 6-7 seconds of dialogue. This is where the viewer gets hooked for good. Write at least 2 full sentences.

                📍 Scene 4 — THE PRACTICAL TIP (15-22 words):
                   The actual lifehack advice. Concrete, specific, actionable.
                   The most informative scene. Tell the viewer exactly what to do and when.
                   Must fill nearly the full 8 seconds with useful speech.

                📍 Scene 5 — THE WARM CTA (12-18 words):
                   Gentle, personal, human appeal. NOT corporate "like and subscribe".
                   Speak like a friend: "Если тебе помогло — подпишись, и напиши в комментах, какой лайфхак хочешь следующим."
                   Warm, caring tone. The object genuinely wants to help.

                📍 Scene 6 — THE MIC-DROP (8-12 words):
                   Memorable closing line. A punchline, a callback to the hook, or a thought that lingers.
                   Short and impactful. The viewer remembers this line and wants to rewatch.

            11. VIRAL STYLE:
                * The object 'comes alive' and speaks directly to the viewer.
                * Light surrealism, humor, and a slight sense of strangeness.
                * Always create a feeling of "why is this object talking to me?"
                * Every scene has ACTION and CONFLICT — never just description or aesthetics.`;

            userPrompt = `Create a viral short LIFEHACK script with exactly 6 scenes for "${topic}".

            STRICT DIALOGUE LENGTH RULES (count the words carefully!):
            - Scene 1 (HOOK): 6-10 words. Short, punchy, confrontational. Address viewer as "ты".
            - Scene 2 (INTRIGUE): 16-20 words MINIMUM 16. Build curiosity, explain what's happening. At least 2 sentences.
            - Scene 3 (REVELATION): 16-20 words MINIMUM 16. Emotional twist, the "aha!" moment. At least 2 sentences.
            - Scene 4 (PRACTICAL TIP): 15-22 words. The actual concrete lifehack advice.
            - Scene 5 (WARM CTA): 12-18 words. Gentle, friendly appeal to subscribe and comment. Speak like a caring friend.
            - Scene 6 (MIC-DROP): 8-12 words. Memorable punchline or callback.

            Rotate Variants (A, B, C, D) for each scene.

            Output JSON:
            {
              "intro": "Viral Title",
              "scenes": [
                {
                  "id": 1,
                  "character": "Object Name",
                  "line": "Dialogue [emotion]",
                  "imageVariant": "B",
                  "videoVariant": "B",
                  "imagePrompt": "In English: a clear, positive description of the physical object with cartoon eyes and mouth, placed in its natural real-world environment. Describe only what is present.",
                  "videoPrompt": "In English: object-only motion in its environment. LIP-SYNC: \"[line]\". Describe the motion positively."
                }
              ]
            }`;
        }

        const raw = await callPollinations([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
        ], true, provider);

        try {
            const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const parsed = JSON.parse(jsonText);
            
            let scenesArray = parsed.scenes;
            if (!scenesArray) {
                if (parsed.script && parsed.script.scenes) scenesArray = parsed.script.scenes;
                else scenesArray = Object.values(parsed).find(Array.isArray);
            }

            if (!scenesArray || !Array.isArray(scenesArray)) {
                throw new Error("AI output format error: could not find 'scenes' array. Try generating again.");
            }

            // Post-processing: Replace [line] placeholders and inject Pixar Cinematic templates
            parsed.scenes = scenesArray.map((scene, idx) => {
                    // 0. Clean duplicate dialogue text (AI sometimes generates text twice)
                    if (scene.line) {
                        const parts = scene.line.split(/\s+/);
                        const halfLen = Math.floor(parts.length / 2);
                        const firstHalf = parts.slice(0, halfLen).join(' ');
                        const secondHalf = parts.slice(halfLen).join(' ');
                        // If second half is identical or very similar to first half, keep only first half
                        if (firstHalf && secondHalf && (firstHalf === secondHalf || secondHalf.includes(firstHalf))) {
                            scene.line = firstHalf;
                            console.log(`[ObjectWars] Removed duplicate dialogue in scene ${idx + 1}`);
                        }
                    }

                    // 1. Dialogue Injection
                    if (scene.videoPrompt && scene.videoPrompt.includes('[line]') && scene.line) {
                        scene.videoPrompt = scene.videoPrompt.replace('[line]', scene.line);
                    }
                    if (scene.videoPrompt && scene.videoPrompt.includes('[INSERT ACTUAL DIALOGUE LINE HERE') && scene.line) {
                        scene.videoPrompt = scene.videoPrompt.replace(/\[INSERT ACTUAL DIALOGUE LINE HERE[^\]]*\]/, scene.line);
                    }

                    // 2. Pixar Image Variant Injection
                    const imgVarId = scene.imageVariant || pickVariant(PIXAR_IMAGE_VARIANTS, idx).id;
                    const imgVar = PIXAR_IMAGE_VARIANTS.find(v => v.id === imgVarId) || PIXAR_IMAGE_VARIANTS[0];
                    const baseDesc = scene.imagePrompt || scene.character || 'character';
                    const characterIdentity = scene.character || 'Pixar object';
                    const objectLock = mode === 'objects'
                        ? ` CHARACTER: ${characterIdentity}. ${TALKING_OBJECT_IMAGE_LOCK}`
                        : '';
                    scene.imagePrompt = `${imgVar.template(baseDesc)}.${objectLock} STYLE: ${PIXAR_IMAGE_BASE}`;

                    // 3. Pixar Video Variant Injection
                    const vidVarId = scene.videoVariant || pickVariant(PIXAR_VIDEO_VARIANTS, idx).id;
                    const vidVar = PIXAR_VIDEO_VARIANTS.find(v => v.id === vidVarId) || PIXAR_VIDEO_VARIANTS[0];
                    const vidMotionDesc = scene.videoPrompt || '';

                    // Construct video prompt: Style + Identity first, then camera, motion, audio
                    scene.video_prompt = `${PIXAR_VIDEO_STYLE} CHARACTER: ${characterIdentity} — the sole animated protagonist, a physical object with cartoon eyes and a lip-sync mouth on its surface, present throughout all 8 seconds. ${vidVar.template} ${vidMotionDesc} ${PIXAR_VIDEO_MOTION} AUDIO TRACK: A professional character voice speaking in ${langName} language exactly: "${scene.line}". LIP-SYNC: Accurate mouth movement synchronized to the audio. ${PIXAR_VIDEO_NEGATIVE} ${PIXAR_VIDEO_SAFETY}`;

                    // Legacy field support
                    scene.videoPrompt = scene.video_prompt;

                    return scene;
                });
            
            return parsed;
        } catch (e) {
            console.error('Failed to parse Studio script:', raw);
            throw new Error("AI failed to generate structural JSON script.");
        }
    });

    ipcMain.handle('studio-assemble-video', async (event, { useKaraoke, ideaTitle, language }) => {
        const studioDir = path.join(__dirname, 'SkeletonShorts');
        const finalDir = path.join(__dirname, 'FinalVideo');
        const audioDir = path.join(__dirname, 'Audio');
        const musicDir = path.join(__dirname, 'Music');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);
        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

        const files = fs.readdirSync(studioDir)
            .filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub'))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                return numA - numB;
            });

        if (files.length === 0) throw new Error("No scenes found to assemble.");

        let videoFiles = [];
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

        // ─────────────────────────────────────────────────
        //  Transitions + Whoosh Assembly
        // ─────────────────────────────────────────────────
        const TRANSITION_D = 0.35;
        const tempDir = path.join(__dirname, 'temp_transitions');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        // Look for whoosh sound in Music/, fallback to Audio/
        let whooshPath = path.join(musicDir, 'Woosh.mp3');
        if (!fs.existsSync(whooshPath)) {
            whooshPath = path.join(musicDir, 'whoosh.mp3');
            if (!fs.existsSync(whooshPath)) {
                const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => /woosh|whoosh|deii|swish/i.test(f)) : [];
                whooshPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : path.join(audioDir, 'whoosh.mp3');
                if (!fs.existsSync(whooshPath)) {
                    await generateWhooshSound(whooshPath);
                }
            }
        }

        try {
            const durations = videoFiles.map(f => getVideoDuration(f));

            // Build segments: [trimmed_0, trans_0→1, trimmed_1, trans_1→2, …, trimmed_N-1]
            const segments = [];
            for (let i = 0; i < videoFiles.length; i++) {
                if (i > 0) {
                    const transPath = path.join(tempDir, `trans_${i}.mp4`);
                    await createLateralTransition(videoFiles[i - 1], videoFiles[i], whooshPath, transPath, TRANSITION_D);
                    segments.push(transPath);
                }
                const startTrim = i > 0 ? TRANSITION_D : 0;
                const endTrim = i < videoFiles.length - 1 ? TRANSITION_D : 0;
                const body = durations[i] - startTrim - endTrim;
                if (body <= 0.01) continue;
                if (startTrim > 0 || endTrim > 0) {
                    const trimmedPath = path.join(tempDir, `trimmed_${i}.mp4`);
                    await trimClip(videoFiles[i], trimmedPath, startTrim, endTrim);
                    segments.push(trimmedPath);
                } else {
                    segments.push(videoFiles[i]);
                }
            }

            // Concat all video+audio segments (no re-encode — all segments share libx264/aac params)
            const listPath = path.join(__dirname, 'studio_filelist.txt');
            fs.writeFileSync(listPath, segments.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

            const concatPath = path.join(tempDir, `concat_${Date.now()}.mp4`);
            await runFfmpeg([
                '-f', 'concat', '-safe', '0', '-i', listPath,
                '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-y', concatPath
            ]);
            if (fs.existsSync(listPath)) fs.unlinkSync(listPath);

            const outputPath = path.join(finalDir, `studio_final_${Date.now()}.mp4`);
            fs.renameSync(concatPath, outputPath);
            cleanTempDir(tempDir);

            return `media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

        } catch (e) {
            cleanTempDir(tempDir);
            throw e;
        }
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

// ────────────────────────────────────────────────────────────
//  Transition + Whoosh helpers
// ────────────────────────────────────────────────────────────

function getVideoDuration(filePath) {
    const str = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    ).toString().trim();
    return parseFloat(str);
}

function generateWhooshSound(outputPath) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', [
            '-f', 'lavfi', '-i', 'anoisesrc=d=0.35:c=pink:a=0.4,afade=t=in:d=0.02,afade=t=out:d=0.1,aecho=0.6:0.5:25:0.3',
            '-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*T*(600-400*T/0.35))':d=0.35:c=mono,afade=t=in:d=0.02,afade=t=out:d=0.1,aecho=0.7:0.6:25:0.3",
            '-filter_complex', '[0:a][1:a]amix=inputs=2:duration=first:weights=0.4 0.6,volume=2[a]',
            '-map', '[a]',
            '-acodec', 'libmp3lame', '-ar', '44100', '-y', outputPath
        ]);
        child.on('close', code => code === 0 ? resolve() : reject(new Error('Whoosh generation failed')));
        child.on('error', reject);
    });
}

function createLateralTransition(clipA, clipB, whooshPath, outputPath, duration) {
    return new Promise((resolve, reject) => {
        const durA = getVideoDuration(clipA);
        const filter = [
            `[0:v]trim=${durA - duration}:${durA},setpts=PTS-STARTPTS[tail]`,
            `[1:v]trim=0:${duration},setpts=PTS-STARTPTS[head]`,
            `[tail]split[tail_a][tail_b]`,
            `[tail_a]dblur=0:30[t_blur]`,
            `[head]format=rgba,colorchannelmixer=aa=1[head_rgba]`,
            `[t_blur][head_rgba]overlay=x='W*(1-t/${duration})':y=0,setpts=PTS-STARTPTS,format=yuv420p[outv]`,
            `[0:a]atrim=${durA - duration}:${durA},asetpts=PTS-STARTPTS[atail]`,
            `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS[ahead]`,
            `[atail][ahead]acrossfade=d=${duration}:c1=tri:c2=tri[across]`,
            `[2:a]volume=0.8,afade=t=in:d=0.02[whoosh]`,
            `[across][whoosh]amix=inputs=2:duration=first:weights=1 0.5[outa]`
        ].join(';');

        const child = spawn('ffmpeg', [
            '-i', clipA, '-i', clipB, '-i', whooshPath,
            '-filter_complex', filter,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-y', outputPath
        ]);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`Transition failed: code ${code}`)));
        child.on('error', reject);
    });
}

function trimClip(inputPath, outputPath, startTrim, endTrim) {
    return new Promise((resolve, reject) => {
        const dur = getVideoDuration(inputPath);
        const newDur = dur - startTrim - endTrim;
        if (newDur <= 0.01) {
            fs.copyFileSync(inputPath, outputPath);
            return resolve();
        }
        const child = spawn('ffmpeg', [
            '-i', inputPath,
            '-filter_complex',
            `[0:v]trim=${startTrim}:${dur - endTrim},setpts=PTS-STARTPTS[outv];[0:a]atrim=${startTrim}:${dur - endTrim},asetpts=PTS-STARTPTS[outa]`,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-y', outputPath
        ]);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`Trim failed: code ${code}`)));
        child.on('error', reject);
    });
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', args);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: code ${code}`)));
        child.on('error', reject);
    });
}

function cleanTempDir(tempDir) {
    if (!fs.existsSync(tempDir)) return;
    try {
        const files = fs.readdirSync(tempDir);
        for (const f of files) fs.unlinkSync(path.join(tempDir, f));
        fs.rmdirSync(tempDir);
    } catch (_) { /* best-effort */ }
}

module.exports = { synthesizeUnifiedSpeech, registerSkeletonHandlers, callPollinations, synthesizeDirectElevenLabs };

