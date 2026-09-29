// ============ SKELETON SHORTS вЂ” WAN V2.6 720P ============
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
const streamPipeline = promisify(pipeline);
const historyManager = require('./history-manager.cjs');
const { pipeline: _pipeline } = require('stream');

const ai = require('./ai-client.cjs');
const { searchWeb } = require('./search-helper.cjs');
const { extractLifehacks: lhExtract, getNext: lhGetNext, markUsed: lhMarkUsed, getStats: lhGetStats } = require('./lifehack-queue.cjs');
const amazonManager = require('./amazon-manager.cjs');
const amazonSourcing = require('./amazon-sourcing.cjs');

const LANG_NAMES = {
    // short codes
    en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
    ru: 'Russian', pl: 'Polish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    // full names (from StudioTab language selector)
    English: 'English', Russian: 'Russian', French: 'French', German: 'German',
    Spanish: 'Spanish', Polish: 'Polish', Italian: 'Italian', Portuguese: 'Portuguese'
};

// ———— Object Categories for diverse lifehack idea generation (NO FOOD) ————
const OBJECT_CATEGORIES = [
    // HOUSEHOLD ITEMS
    { theme: 'Household', objects: ['furniture', 'bedroom objects', 'bathroom items', 'cleaning tools', 'electrical appliances', 'doors & windows', 'pillows & blankets', 'storage items', 'lights & fans', 'laundry items'] },
    // OFFICE & WORK
    { theme: 'Office & Work', objects: ['desk objects', 'laptop & accessories', 'stationery', 'printer & scanner', 'office furniture', 'work-from-home setup', 'ID card & access card', 'files & folders', 'cable management', 'meeting room objects'] },
    // GYM & FITNESS
    { theme: 'Gym & Fitness', objects: ['gym equipment', 'dumbbells & weights', 'cardio machines', 'gym accessories', 'fitness tracking devices', 'gym lockers', 'workout clothes', 'yoga equipment', 'resistance bands', 'gym bags'] },
    // LIFE HACKS & PRODUCTIVITY
    { theme: 'Life Hacks & Productivity', objects: ['morning routines', 'organization systems', 'time-saving shortcuts', 'multitasking tricks', 'smart planning habits', 'focus techniques', 'energy management', 'sleep optimization hacks', 'stress reduction tricks', 'daily efficiency boosters'] },
    // TECH & DIGITAL
    { theme: 'Tech & Digital', objects: ['mobile apps', 'phone components', 'social media platforms', 'notifications', 'AI tools', 'gadgets', 'cables & chargers', 'gaming devices', 'smart home devices', 'digital files'] },
    // MONEY & FINANCE
    { theme: 'Money & Finance', objects: ['wallet contents', 'credit cards', 'coins & cash', 'bills & expenses', 'savings vs spending', 'investment assets', 'budget categories', 'subscription services', 'salary breakdown', 'shopping items'] },
    // SCHOOL & STUDY
    { theme: 'School & Study', objects: ['school stationery', 'books', 'exam papers', 'classroom objects', 'backpack contents', 'homework materials', 'grades & marks', 'online class tools', 'study apps', 'library books'] },
    // TRAVEL & OUTDOORS
    { theme: 'Travel & Outdoors', objects: ['luggage items', 'travel accessories', 'vehicle parts', 'road objects', 'tourist items', 'airport objects', 'train station items', 'hotel room items', 'weather elements', 'camping gear'] },
    // FUN & VIRAL
    { theme: 'Fun & Viral', objects: ['emojis', 'alphabet letters', 'numbers', 'colors', 'sounds', 'emotions', 'habits', 'daily routines', 'time periods', 'life stages'] }
];

// —— Pixar Cinematic Image Prompt Variants ———————————————————————
const PIXAR_IMAGE_VARIANTS = [
    {
        id: 'A', name: "Cozy Inventor's Workshop",
        template: (character) => `${character}, medium shot, standing proudly in a cozy warmly-lit inventor's workshop filled with wooden workbenches, blueprints on walls, glowing Edison bulbs, whimsical science gadgets, warm atmospheric lighting, shallow depth of field, cinematic 9:16 portrait composition`
    },
    {
        id: 'B', name: 'Smart Lifehack Kitchen',
        template: (character) => `${character}, eye-level portrait shot, inside a modern bright aesthetic kitchen with neat wooden shelves, organized pantry jars, soft golden morning sunlight filtering through the window, cheerful ambient lighting, cinematic 9:16 vertical framing`
    },
    {
        id: 'C', name: 'Creative Tech Lab & Desk',
        template: (character) => `${character}, sitting or standing at a creative colorful study desk with colorful notebooks, craft tools, warm desk lamp glow, soft bokeh background, curious and proud expression, high-end 3D animated look`
    },
    {
        id: 'D', name: 'Direct Discovery Studio',
        template: (character) => `${character}, stylish modern discovery room with subtle chalkboard diagrams and blueprints in background, warm soft spotlight, sharp focus, energetic confident posture`
    },
    {
        id: 'E', name: 'Macro Problem Focus & Disaster Inspection',
        template: (character, problemDetail) => {
            const problem = problemDetail && problemDetail.trim().length > 10
                ? problemDetail.trim()
                : 'the physical problem or damaged area examined in sharp close-up detail';
            return `Extreme high-detail inspection shot, cinematic 9:16 vertical framing. In the sharp macro foreground: ${problem}. Just behind, standing at eye level with dramatic soft-bokeh focus: ${character} leaning forward closely, inspecting the damage with an attentive, shocked or analytical expression. Cinematic dramatic lighting, rich textures, photorealistic 3D Pixar render style.`;
        }
    },
    {
        id: 'F', name: 'Cinematic Hero Close-Up',
        // ECU + Dutch tilt + venetian blind shadow drama — from 100K_PromptGuide shadow storytelling technique
        template: (character) => `${character}, extreme close-up ECU, Dutch tilt 5 degrees, face filling 70% of the 9:16 frame, dramatic shadow pattern from narrow venetian blind slats cast across her face and upper body, single hard sidelight at 90 degrees creating 2:1 light-to-shadow ratio, background completely soft black bokeh, sharp focus on eyes and expression, ultra-cinematic 3D Pixar render, high contrast mood`
    },
    {
        id: 'G', name: 'Atmospheric Wide — Inventor Lab',
        // Wide shot with atmospheric depth (secret #1 from guide) + volumetric light rays
        template: (character) => `${character}, wide shot showing full environment, standing at center of a spacious warmly-lit inventor's laboratory, atmospheric haze between camera and subject adding cinematic depth, volumetric light rays streaming through a side window hitting lab surfaces, dust particles visible in the light beam, background equipment and shelves softened by aerial perspective, foreground slightly defocused glass or tube element creating depth layers, 9:16 vertical portrait, ultra-detailed 3D Pixar cinematic render`
    },
    {
        id: 'H', name: 'Split Diopter — Product Focus',
        // Split diopter technique: foreground product macro + background character both sharp
        template: (character, productDetail) => {
            const product = productDetail && productDetail.trim().length > 5
                ? productDetail.trim()
                : 'a household item or cleaning product';
            return `Split focus composition, 9:16 vertical portrait: in the sharp macro foreground at bottom-left of frame — ${product}, extreme close-up revealing texture and detail. In the sharp background center-right — ${character} standing at full height, equally sharp, looking directly at the camera with a proud knowing smile. Soft out-of-focus middle zone between them creates visual depth. Warm ambient lab lighting. 3D Pixar render, high-end cinematic quality.`;
        }
    },
    {
        id: 'I', name: 'Golden Hour Window — Warm Lifestyle',
        // Golden hour SSS + bokeh color theory (warm tungsten balls + cool background) from guide
        template: (character) => `${character}, medium close-up MCU, positioned near a large bright window, golden hour backlight creating warm amber subsurface scattering glow through her hair and ears, soft wrap-around fill from the left, warm tungsten bokeh balls from background practicals (Edison string lights), one subtle cool-tinted window pane reflection creating warm-subject/cool-background color contrast, catchlight is a window reflection — NOT a ring flash, atmospheric cinematic feel, 9:16 vertical portrait, 3D Pixar high-end render`
    }
];

// —— Psychology Character Bible (Pixar-style, видавший жизнь мужик-советчик) ——
const CHARACTER_BIBLE_PSYCHOLOGIST = `"3D cartoon animation style, Pixar style. A weathered, street-smart man in his late 50s who has seen everything life has to offer. Features: deep-set eyes with a penetrating, knowing gaze that misses nothing, a broad slightly crooked nose that's been broken at least once, prominent laugh lines and stubble that suggest decades of hard-won experience, salt-and-pepper unkempt hair, a wry half-smirk that says he already knows what you're going to say. Build: stocky and solid, the kind of man you don't argue with twice. Outfit: worn leather jacket over a simple dark shirt, no tie, sleeves sometimes rolled up — looks like someone who never needed to impress anyone. He gestures directly, speaks without sugarcoating, points at the camera like he's talking to an old friend who's making the same mistake for the third time. High-end 3D CGI render, moody dramatic side-lighting, 9:16 vertical portrait aspect ratio."`;

// —— Psychology Image Variants ————————————————————————————————————
const PSYCH_IMAGE_VARIANTS = [
    {
        id: 'A', name: 'Street Corner Wisdom',
        template: (character) => `${character}, medium shot, leaning against a worn brick wall in a dimly lit urban alley, hands in jacket pockets, confident authoritative posture, atmospheric moody lighting, shallow depth of field, cinematic 9:16 portrait composition`
    },
    {
        id: 'B', name: 'Old Bar Philosopher',
        template: (character) => `${character}, eye-level portrait shot, seated at a weathered wooden bar or cafe table, one elbow resting on the surface, leaning slightly forward as if sharing a hard truth, warm amber light from above, cinematic 9:16 vertical framing`
    },
    {
        id: 'C', name: 'Direct Confrontation',
        template: (character) => `${character}, close-up shot, facing camera directly, finger pointed slightly toward viewer, intense knowing expression, dark studio background with single dramatic spotlight, no-nonsense posture`
    },
    {
        id: 'D', name: 'Rooftop Perspective',
        template: (character) => `${character}, standing on a rooftop at dusk with city lights behind, arms crossed, surveying the world below with the calm confidence of someone who has seen it all, cinematic wide-to-close composition`
    }
];

const PSYCH_IMAGE_BASE = `ultra-cinematic lighting, rich moody tones, dramatic shadows, sharp focus, photorealistic 3D render quality`;
const PIXAR_IMAGE_BASE = `3D cartoon animation style, Pixar style, high-end 3D CGI render, warm studio lighting, vibrant colors, expressive characters, clean smooth surfaces`;

// —— Psychology Video Motion Variants ————————————————————————————————
const PSYCH_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'The Blunt Truth-Teller',
        template: `CAMERA MOVEMENT: Very slow subtle push-in over 8 seconds. CHARACTER ACTION: He speaks directly into camera with calm authority, gesturing with a single pointed finger or open hand as if laying out facts, occasionally shaking his head slightly at human foolishness, maintaining steady eye contact throughout. Face remains centered for lip-sync.`
    },
    {
        id: 'B', name: 'The Knowing Lean',
        template: `CAMERA MOVEMENT: Stable framing, slight tilt correction. CHARACTER ACTION: He leans forward slowly as he makes his key point, one eyebrow rising, a dry half-smile forming — the look of someone who called it years ago. He speaks with unhurried confidence, pausing for effect. Face remains perfectly visible for lip-sync.`
    },
    {
        id: 'C', name: 'The Street Professor',
        template: `CAMERA MOVEMENT: Tightly framed mid-shot. CHARACTER ACTION: He counts points on his fingers with deliberate calm, gestures sideways as if pointing to invisible examples from real life, nods firmly at his own conclusions. Speaks like a man who has no time for lies. Face stays steady for clear lip-sync.`
    },
    {
        id: 'D', name: 'The Unsolicited Advice',
        template: `CAMERA MOVEMENT: Gentle slow dolly in. CHARACTER ACTION: He spreads his hands open, shrugs with the confidence of someone who's been right too many times, then looks straight at the viewer as if to say "you know I'm right." Delivers the line with a wry, unflinching gaze. Face remains visible for perfect lip-sync.`
    }
];

const TALKING_OBJECT_IMAGE_LOCK = ``;

// —— VEO Video Motion Variants ——————————————————————————————————————
const PIXAR_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'The Confident Inventor',
        template: `CAMERA MOVEMENT: Very subtle, slow push-in over 8 seconds. CHARACTER ACTION: She speaks with sharp enthusiastic energy, making confident gestures with her hands — adjusting her round glasses with one finger, holding up a small tool or notebook proudly, explaining the lifehack directly into the camera with a knowing clever smile. Her face is centered in frame, fully lit, mouth clearly visible throughout all 8 seconds.`
    },
    {
        id: 'B', name: 'The Eureka Moment',
        template: `CAMERA MOVEMENT: Slow dramatic push-in to a close-up. CHARACTER ACTION: Her expressive eyes light up with excitement, she taps her temple or raises one finger as if struck by a brilliant idea, then looks directly into the camera with a sharp knowing gaze as she reveals the secret trick. Her face stays front-facing and fully visible in the center of frame throughout all 8 seconds.`
    },
    {
        id: 'C', name: 'The Hands-on Demonstration',
        template: `CAMERA MOVEMENT: Stable mid-shot. CHARACTER ACTION: She holds up a household item or gadget with precise confident hands, enthusiastically demonstrating the trick step by step, then looks straight at the viewer with an encouraging assured smile. Her face is forward-facing, mouth clearly visible, centered in the upper third of the frame throughout all 8 seconds.`
    },
    {
        id: 'D', name: 'The Direct Secret Revelation',
        template: `CAMERA MOVEMENT: Gentle slow dolly. CHARACTER ACTION: She leans slightly forward toward the camera as if sharing an exclusive discovery, gesturing with calm playful confidence — perhaps tapping her notebook or pointing at something with curiosity — while maintaining steady direct eye contact with the viewer. Her face fills the upper half of the frame, fully lit and front-facing for all 8 seconds.`
    },
    {
        id: 'E', name: 'Macro Problem Inspection & Revelation',
        template: `CAMERA MOVEMENT: Slow macro rack-focus from the foreground problem directly to the character. CHARACTER ACTION: The scene begins focused closely on the vivid physical problem in the immediate foreground. She leans into frame, points directly at the issue with an urgent, analytical gesture, then looks straight up at the camera lens with wide knowing eyes, shaking her head before delivering the eye-opening warning. Face and mouth stay clearly visible for lip-sync.`
    },
    {
        id: 'F', name: 'Crash Zoom — Impact Reveal',
        // Crash zoom: rapid snap-zoom in then hold — maximum impact for hook/revelation scenes
        template: `CAMERA MOVEMENT: Rapid crash zoom in at the very start of the clip (0–1 second), then hold tight close-up for the remaining 7 seconds. The snap-zoom creates an immediate visual jolt of energy. CHARACTER ACTION: She reacts to the sudden closeness with wide expressive eyes and a sharp knowing look, then settles into a direct confident address to the camera, gesturing firmly with one hand as she delivers the key revelation. Face fills the upper half of the frame, mouth clearly visible for lip-sync throughout.`
    },
    {
        id: 'G', name: 'Orbit Arc — Triumphant Result',
        // 90° slow orbit arc — from camera movement glossary, music video / transition energy
        template: `CAMERA MOVEMENT: Smooth slow arc orbit of 60–90 degrees around the character over 8 seconds, camera staying at face level, subject remains centered in frame throughout the arc. The environment dramatically changes in the background as the camera moves, creating a cinematic music-video feel. CHARACTER ACTION: She holds up the finished result or product with both hands, turning slightly to follow the camera arc naturally, wearing a wide triumphant smile and radiating proud inventor energy. Face visible and lit at all times for clear lip-sync.`
    },
    {
        id: 'H', name: 'Parallax Depth — Editorial',
        // Parallax lateral movement: foreground moves faster than background — editorial depth
        template: `CAMERA MOVEMENT: Slow lateral parallax slide over 8 seconds — camera drifts sideways so foreground elements (lab tools, glass jars, plants) move faster than the background, creating cinematic depth separation through movement. CHARACTER ACTION: She stands still, centered in the mid-ground, speaking directly to camera with calm charismatic authority. Her stable presence contrasts the moving world around her. She gestures with one hand naturally, nodding with confident clarity. Face remains front-facing and fully lit for perfect lip-sync.`
    }
];
const PIXAR_VIDEO_STYLE = `Mood: vibrant, delightfully clever, energetic, witty, charismatic adult scientist.`;

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

// POLLINATIONS, STT, and VOICE LOGIC MOVED TO ai-client.cjs

async function synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
    const apiKey = process.env.ElevenLabs_API;
    if (!apiKey) throw new Error('[Voice] ElevenLabs_API key not set');

    console.log(`[Voice] Direct ElevenLabs TTS: voice=${voiceId} text=${text.length}chars`);
    
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
    if (buf.length < 100) throw new Error(`[Voice] Direct ElevenLabs result too small: ${buf.length}B`);
    
    // Check if it's actually audio (ID3 or MPEG sync)
    const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
    if (!isID3 && !isSync) {
        throw new Error(`[Voice] Direct ElevenLabs returned invalid audio buffer`);
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, buf);
    console.log(`[Voice] Direct ElevenLabs Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
}

async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
    if (process.env.ElevenLabs_API) {
        return await synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
    }
    const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
    if (!apiKey) throw new Error('[Voice] VOICEAPI_KEY not set');

    const templateId = process.env.UUID;
    if (!templateId) throw new Error('[Voice] UUID not set for Lumean Template');

    const LUMEAN_BASE = 'https://api.lumean.app/api/public';

    const hdrs = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    };

    const body = {
        template_id: templateId,
        input_text: text
    };

    console.log(`[Voice] POST /orders template=${templateId} text=${text.length}chars`);
    const cr = await axios.post(`${LUMEAN_BASE}/orders`, body, { headers: hdrs });
    const orderId = cr.data && cr.data.data && cr.data.data.id;
    if (!orderId) throw new Error('[Voice] No order_id: ' + JSON.stringify(cr.data).slice(0, 200));
    console.log(`[Voice] order_id=${orderId}`);

    let finalOrder = null;
    for (let n = 0; n < 60; n++) {
        await new Promise(r => setTimeout(r, 2000));
        const sr = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers: hdrs });
        const st = ((sr.data.data.status || '')).toLowerCase();
        console.log(`[Voice] order=${orderId} status=${st} (${n+1}/60)`);
        
        if (st === 'failed' || st === 'cancelled') throw new Error('[Voice] Task failed: ' + JSON.stringify(sr.data).slice(0, 200));

        if (st === 'completed' || st === 'partially_completed') {
            finalOrder = sr.data.data;
            console.log(`[Voice] Status "${st}" — downloading result`);
            break;
        }
    }

    if (!finalOrder) throw new Error(`[Voice] Timeout: order ${orderId}`);

    const resultItem = finalOrder.result.files[0];
    const resultPath = typeof resultItem === 'string' ? resultItem : resultItem.path;
    const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: resultPath }, { headers: hdrs });
    const downloadUrl = urlRes.data.data.url;

    const ar = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const buf = Buffer.from(ar.data);
    if (buf.length < 100) throw new Error(`[Voice] Too small: ${buf.length}B`);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, buf);
    console.log(`[Voice] Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
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

// ── TikTok Content Safety Directive ───────────────────────────────────────────
const TIKTOK_SAFETY_DIRECTIVE = `
CONTENT SAFETY RULES (MANDATORY — TikTok Community Guidelines Compliance):
- NEVER give medical advice, diagnoses, treatment recommendations, or drug/supplement suggestions.
- NEVER use the words: "health", "wellness", "diet", "lose weight", "calories", "fat loss", "skinny", "mental health", "therapy", "depression", "anxiety", "medication", "prescription", "cure", "heal", "doctor says", "research shows", "scientifically proven", "doctors don't want you to know".
- NEVER make before/after body transformation claims.
- NEVER reference controlled substances, pharmacies, or medical procedures.
- ALWAYS frame content as: clever everyday tricks, smart life shortcuts, genius home hacks, kitchen efficiency, time-saving tips, productivity boosts — NOT health advice.
- Hashtags MUST NOT include: #health #wellness #diet #weightloss #fitness #mentalhealth #medical #doctor #nutrition #cleaneating #bodygoals.
- Use instead: #lifehack #geniustrick #everydaytips #homehacks #smartliving #diytrick #kitchenhacks #organizationtips #productivityhack #timetips #smartideas
`;

// ── Real-time trend search via Tavily / Firecrawl / Web ──────────────────────
const searchTrends = async (langName, mode, season, month, year) => {
    const searchQuery = mode === 'health'
        ? `viral tiktok genius everyday tricks productivity life optimization ${month} ${year} ${langName} trending`
        : `viral tiktok household lifehacks home diy tips ${season} ${month} ${year} ${langName} trending`;

    try {
        console.log(`[Trend Search] Searching web (Tavily/Firecrawl) for trends in ${langName} (${month} ${year})...`);
        const webResults = await searchWeb(searchQuery);
        if (webResults && webResults.length > 50) {
            return webResults;
        }
        console.warn(`[Trend Search] Web results short or empty, calling AI chat...`);
        const trendQuery = mode === 'health'
            ? `What are the top 5 trending everyday life optimization, smart productivity and genius daily tricks topics on TikTok RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Return ONLY a short bullet list of trending topics, no explanations.`
            : `What are the top 5 trending lifehack and DIY topics on TikTok RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Return ONLY a short bullet list of trending topics, no explanations.`;
        return await ai.chat([{ role: 'user', content: trendQuery }]);
    } catch (e) {
        console.warn(`[Trend Search] Failed: ${e.message}, falling back to seasonal context`);
        return null;
    }
};

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

/**
 * Robust JSON extraction and repair for LLM responses
 */
function repairTruncatedJson(jsonStr) {
    if (!jsonStr) return null;
    let s = jsonStr.trim();
    let inString = false;
    let escaped = false;
    let openBraces = 0;
    let openBrackets = 0;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (c === '\\') {
            escaped = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (c === '{') openBraces++;
            else if (c === '}') openBraces = Math.max(0, openBraces - 1);
            else if (c === '[') openBrackets++;
            else if (c === ']') openBrackets = Math.max(0, openBrackets - 1);
        }
    }

    if (inString) s += '"';
    s = s.replace(/,\s*$/, '');
    while (openBrackets > 0) {
        s += ']';
        openBrackets--;
    }
    while (openBraces > 0) {
        s += '}';
        openBraces--;
    }
    return s;
}

function cleanAndParseJSON(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('Empty AI response');
    let str = raw.trim();

    // 1. Remove Markdown code blocks
    str = str.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
    if (str.startsWith('```json')) str = str.slice(7).trim();
    if (str.startsWith('```')) str = str.slice(3).trim();
    if (str.endsWith('```')) str = str.slice(0, -3).trim();

    // 2. Try direct JSON.parse
    try {
        return JSON.parse(str);
    } catch (e) {}

    // 3. Find outermost JSON object or array
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = str.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = str.lastIndexOf(']');
    }

    if (startIdx !== -1) {
        let candidate = (endIdx > startIdx) ? str.substring(startIdx, endIdx + 1).trim() : str.substring(startIdx).trim();
        try {
            return JSON.parse(candidate);
        } catch (e) {}

        // Clean trailing commas before closing braces/brackets
        candidate = candidate.replace(/,\s*([\}\]])/g, '$1');
        try {
            return JSON.parse(candidate);
        } catch (e) {}

        // Repair truncated JSON by closing open strings and structures
        const repaired = repairTruncatedJson(candidate);
        if (repaired) {
            try {
                return JSON.parse(repaired);
            } catch (e) {}
            try {
                return JSON.parse(repaired.replace(/,\s*([\}\]])/g, '$1'));
            } catch (e) {}
        }
    }

    throw new Error('Could not parse structural JSON from AI response');
}

/**
 * Sanitizes image generation prompts to eliminate automated Google / G-Labs
 * safety filter triggers (PUBLIC_ERROR_UNSAFE_GENERATION, NSFW, CHILD_SAFETY).
 * Converts domestic private rooms (bathroom, shower, vanity) to clean lab/kitchen workstations,
 * and neutralizes intimate/cosmetic/body words (aloe gel, skin, charming, etc.).
 */
function sanitizePromptForImageSafety(prompt) {
    if (!prompt || typeof prompt !== 'string') return prompt;

    let p = prompt;

    // 1. Sanitize domestic private/intimate spaces to safe laboratory / workshop / studio spaces
    p = p
        .replace(/\b(in a warmly lit, bright bathroom|in a warmly lit bright bathroom|in a bright bathroom|in the bathroom|in a bathroom|bathroom)\b/gi, 'in a modern bright kitchen laboratory')
        .replace(/\b(restroom|washroom)\b/gi, 'clean science workshop')
        .replace(/\b(vanity counter|vanity table|vanity)\b/gi, 'clean laboratory counter')
        .replace(/\b(dressing room|powder room)\b/gi, 'creative discovery room')
        .replace(/\b(shower stall|shower cabin|shower)\b/gi, 'tiled test basin')
        .replace(/\b(bathtub|tub)\b/gi, 'water testing basin')
        .replace(/\b(bedroom|bed)\b/gi, 'studio workspace');

    // 2. Sanitize intimate / cosmetic / body trigger words that trigger automated NSFW/sexual filters
    p = p
        .replace(/\b(clear aloe gel sitting in a glass bowl|clear aloe gel|aloe vera gel|aloe gel)\b/gi, 'botanical aloe vera plant extract in a glass beaker')
        .replace(/\b(aloe vera|aloe)\b/gi, 'botanical aloe')
        .replace(/\b(bare skin|naked skin|exposed skin)\b/gi, 'complexion')
        .replace(/\b(rubbing|spreading|massaging)\s+(gel|cream|lotion|oil)\s+(on|onto)\s+skin\b/gi, 'holding a skincare applicator')
        .replace(/\b(on skin|onto skin|on the skin)\b/gi, 'for skincare testing')
        .replace(/\b(naked|nude|undressed|lingerie|underwear|bikini|swimsuit)\b/gi, 'fully clothed')
        .replace(/\b(sexy|sensual|erotic|seductive)\b/gi, 'professional')
        .replace(/\bcharming\b/gi, 'confident professional');

    // 3. Age and character safety (avoid CHILD_SAFETY or ambiguity)
    p = p
        .replace(/\bcute gestures\b/gi, 'expressive confident gestures')
        .replace(/\bcute\b/gi, 'expressive')
        .replace(/\bThe Little Genius\b/gi, 'Génie, the adult woman scientist')
        .replace(/\blittle genius\b/gi, 'adult scientist')
        .replace(/\blittle\b/gi, 'compact')
        .replace(/\bchild\b/gi, 'adult')
        .replace(/\bchildren\b/gi, 'people')
        .replace(/\bteenager\b/gi, 'adult')
        .replace(/\bteen\b/gi, 'adult')
        .replace(/\byoung woman\b/gi, 'adult woman')
        .replace(/\byoung charismatic\b/gi, 'charismatic adult')
        .replace(/\byoung adult\b/gi, 'adult professional')
        .replace(/\byoung\b/gi, 'adult')
        .replace(/\bgirl\b/gi, 'woman')
        .replace(/\bkid\b/gi, 'person')
        .replace(/\bkids\b/gi, 'people');

    return p;
}

/**
 * Universal normalizer for Studio scenes across all LLM models and output variations
 */
function normalizeStudioScenes(parsed, topic, mode, langName) {
    let scenesArray = null;
    let intro = (parsed && (parsed.intro || parsed.title || parsed.topic)) || topic;

    if (Array.isArray(parsed)) {
        scenesArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.scenes)) scenesArray = parsed.scenes;
        else if (Array.isArray(parsed.segments)) scenesArray = parsed.segments;
        else if (Array.isArray(parsed.script?.scenes)) scenesArray = parsed.script.scenes;
        else if (Array.isArray(parsed.script)) scenesArray = parsed.script;
        else if (Array.isArray(parsed.data?.scenes)) scenesArray = parsed.data.scenes;
        else {
            const foundArr = Object.values(parsed).find(Array.isArray);
            if (foundArr) scenesArray = foundArr;
        }
    }

    if (!scenesArray || !Array.isArray(scenesArray) || scenesArray.length === 0) {
        throw new Error("AI output format error: could not find scenes array in response.");
    }

    const processedScenes = scenesArray.map((scene, idx) => {
        let line = '';
        if (typeof scene === 'string') {
            line = scene;
        } else if (scene.line) {
            line = typeof scene.line === 'string' ? scene.line : JSON.stringify(scene.line);
        } else if (scene.text) {
            line = scene.text;
        } else if (scene.dialogue) {
            if (Array.isArray(scene.dialogue)) {
                line = scene.dialogue.map(d => (typeof d === 'string' ? d : (d.line || d.text || ''))).join(' ');
            } else if (typeof scene.dialogue === 'string') {
                line = scene.dialogue;
            }
        } else if (scene.original) {
            line = scene.original;
        } else if (scene.script) {
            line = scene.script;
        }

        // Clean duplicate dialogue
        if (line) {
            const parts = line.split(/\s+/);
            const halfLen = Math.floor(parts.length / 2);
            const firstHalf = parts.slice(0, halfLen).join(' ');
            const secondHalf = parts.slice(halfLen).join(' ');
            if (firstHalf && secondHalf && (firstHalf === secondHalf || secondHalf.includes(firstHalf))) {
                line = firstHalf;
            }
        }

        // Programmatic safety limit: Word count validation for 8-second video (optimal: 18-22 words, soft cap 24 words)
        if (line) {
            const cleanTextNoTags = line.replace(/\[[^\]]+\]/g, '').trim();
            const words = cleanTextNoTags.split(/\s+/).filter(Boolean);
            const MAX_ALLOWED_WORDS = 24;
            if (words.length > MAX_ALLOWED_WORDS) {
                console.warn(`[Studio Scene ${idx + 1}] Line exceeded 8s limit (${words.length} words > ${MAX_ALLOWED_WORDS}). Trimming to fit 8s.`);
                // Extract emotion tag if present
                const emotionMatch = line.match(/^(\[[^\]]+\]\s*)/) || line.match(/(\s*\[[^\]]+\])$/);
                const emotionTag = emotionMatch ? emotionMatch[0].trim() : '';

                // Smart truncation at sentence/clause boundary or word limit
                const trimmedWords = words.slice(0, MAX_ALLOWED_WORDS);
                let trimmedLine = trimmedWords.join(' ');
                // Ensure proper punctuation at the end
                if (!/[.!?—]$/.test(trimmedLine)) {
                    trimmedLine += ' !';
                }
                line = emotionTag ? (line.startsWith('[') ? `${emotionTag} ${trimmedLine}` : `${trimmedLine} ${emotionTag}`) : trimmedLine;
            }
        }

        let character = (scene && (scene.character || scene.speaker || scene.character_name)) || (mode === 'objects' ? `Talking Object ${idx + 1}` : 'Presenter');
        let imageVariant = (scene && scene.imageVariant) || pickVariant(PIXAR_IMAGE_VARIANTS, idx).id;
        let videoVariant = (scene && scene.videoVariant) || pickVariant(PIXAR_VIDEO_VARIANTS, idx).id;
        
        let rawImagePrompt = (scene && (scene.imagePrompt || scene.image_prompt || scene.description || scene.setting || scene.visual)) || `${character} in its natural environment`;
        let rawVideoPrompt = (scene && (scene.videoPrompt || scene.video_prompt || scene.motion || scene.animation)) || '';

        // Inject line into videoPrompt if template has placeholder
        if (rawVideoPrompt.includes('[line]') && line) {
            rawVideoPrompt = rawVideoPrompt.replace(/\[line\]/g, line);
        }
        if (rawVideoPrompt.includes('[INSERT ACTUAL DIALOGUE LINE HERE') && line) {
            rawVideoPrompt = rawVideoPrompt.replace(/\[INSERT ACTUAL DIALOGUE LINE HERE[^\]]*\]/g, line);
        }

        const imgVar = mode === 'psychology'
            ? (PSYCH_IMAGE_VARIANTS.find(v => v.id === imageVariant) || PSYCH_IMAGE_VARIANTS[0])
            : (PIXAR_IMAGE_VARIANTS.find(v => v.id === imageVariant) || PIXAR_IMAGE_VARIANTS[0]);
        const vidVar = mode === 'psychology'
            ? (PSYCH_VIDEO_VARIANTS.find(v => v.id === videoVariant) || PSYCH_VIDEO_VARIANTS[0])
            : (PIXAR_VIDEO_VARIANTS.find(v => v.id === videoVariant) || PIXAR_VIDEO_VARIANTS[0]);

        const objectLock = mode === 'objects'
            ? ` CHARACTER: ${character}. ${TALKING_OBJECT_IMAGE_LOCK}`
            : '';

        const voiceDesc = mode === 'health'
            ? `VOICE IDENTITY (MUST match exactly every scene): A single consistent adult woman's voice — confident, articulate, energetic, with a warm melodic timbre and expressive inflections that make every lifehack feel like an exciting discovery. ` +
              `VOCAL QUALITIES: Clear soprano with natural warmth, confident quick-paced delivery with well-timed dramatic pauses before revealing the key trick, genuine enthusiasm and sparkling wit in every word. ` +
              `EMOTIONAL RANGE: Engaging energy when teasing the viewer with a problem, proud confident tone when delivering the solution, warm delighted energy when the trick lands. ` +
              `REFERENCE: Think a charismatic female science presenter and adult inventor — brilliant, fun, and impossible to ignore.`
            : mode === 'psychology'
            ? `VOICE IDENTITY (MUST match exactly every scene): A weathered, gravelly male voice — a man in his late 50s who speaks with the unhurried authority of someone who has seen every human mistake twice. ` +
              `VOCAL QUALITIES: Deep, slightly hoarse timbre, deliberate pacing with meaningful pauses, dry sardonic wit underneath every word, speaks directly like he's calling you out personally. ` +
              `EMOTIONAL RANGE: Blunt and matter-of-fact when stating hard truths, faintly amused when pointing out human predictability, firm and almost impatient when giving advice — like a man who has no patience for excuses. ` +
              `REFERENCE: Think an older seasoned detective mixed with a street philosopher — someone whose advice you didn't ask for but absolutely needed.`
            : `A professional character voice with clear articulation and expressive delivery`;

        const imageBase = mode === 'psychology' ? PSYCH_IMAGE_BASE : PIXAR_IMAGE_BASE;
        const referenceDirective = mode === 'health'
            ? ` The character's face, hair, and appearance strictly match the provided reference image.`
            : '';
        const isMacroInspection = imageVariant === 'E';
        const characterScaleDirective = ` The character stands at full natural human height. STYLE: ${imageBase}`;

        let basePromptForVariant;
        if (isMacroInspection) {
            if (rawImagePrompt && rawImagePrompt.length > 25) {
                basePromptForVariant = `${rawImagePrompt}, cinematic 9:16 vertical macro inspection shot, dramatic atmospheric lighting, sharp focus on the problem, high-end 3D animated look`;
            } else {
                basePromptForVariant = imgVar.template(character, rawImagePrompt);
            }
        } else if (rawImagePrompt && rawImagePrompt.length > 40 && (rawImagePrompt.includes('standing') || rawImagePrompt.includes('sitting') || rawImagePrompt.includes('holding') || rawImagePrompt.includes('in ') || rawImagePrompt.includes('at '))) {
            // rawImagePrompt is already a rich scene description from the LLM; keep its action/subject and add framing/lighting without room clashes
            basePromptForVariant = `${rawImagePrompt}, cinematic 9:16 vertical portrait composition, atmospheric lighting, sharp focus, high-end 3D animated look`;
        } else {
            basePromptForVariant = imgVar.template(rawImagePrompt || character);
        }

        let finalImagePrompt = mode === 'psychology'
            ? `${imgVar.template(rawImagePrompt)}. STYLE: ${imageBase}`
            : `${basePromptForVariant}.${objectLock}${referenceDirective}${characterScaleDirective}`;

        finalImagePrompt = sanitizePromptForImageSafety(finalImagePrompt);
        const finalVideoPrompt = `${mode === 'psychology' ? 'Mood: raw, direct, street-wise, unflinching.' : PIXAR_VIDEO_STYLE} CHARACTER: ${character} — the animated protagonist, present throughout all 8 seconds. ${vidVar.template} ${rawVideoPrompt} AUDIO TRACK: ${voiceDesc} speaking in ${langName} language exactly: "${line}". LIP-SYNC: Accurate mouth movement synchronized to the audio.`;

        return {
            id: idx + 1,
            character,
            line,
            imageVariant,
            videoVariant,
            imagePrompt: finalImagePrompt,
            video_prompt: finalVideoPrompt,
            videoPrompt: finalVideoPrompt
        };
    });

    return {
        intro,
        socialPost: parsed?.socialPost,
        scenes: processedScenes
    };
}

/**
 * Fallback parser in case AI returns non-JSON or heavily broken text.
 * Strictly prevents JSON keys/syntax from ever leaking into dialogue lines.
 */
function fallbackExtractScenes(raw, topic, mode, langName) {
    if (!raw || typeof raw !== 'string') throw new Error("AI failed to generate structural script.");

    // 1. If response contains JSON structures with "scenes" array or "line" fields,
    // extract dialogue directly instead of parsing raw JSON syntax line-by-line!
    const jsonLines = [];
    const lineRegex = /"(?:line|dialogue|text)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let m;
    while ((m = lineRegex.exec(raw)) !== null) {
        const lineText = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        if (lineText.length > 5 && !lineText.includes('":') && !lineText.endsWith('{') && !lineText.endsWith('[')) {
            jsonLines.push(lineText);
        }
    }
    if (jsonLines.length >= 3) {
        console.log(`[Studio] Recovered ${jsonLines.length} dialogue lines from damaged JSON output.`);
        const scenes = jsonLines.map((line, idx) => ({
            id: idx + 1,
            character: mode === 'objects' ? `Talking Object ${idx + 1}` : 'Presenter',
            line: line
        }));
        return normalizeStudioScenes({ intro: topic, scenes }, topic, mode, langName);
    }

    // 2. Otherwise plain text extraction — strictly filter out JSON keys, brackets and braces!
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const extractedLines = [];
    for (const l of lines) {
        const cleaned = l.replace(/^[-*•\d\.\)\s]+/, '').replace(/^Scene\s*\d+[:\-]?\s*/i, '').trim();
        const isJsonSyntax =
            cleaned.startsWith('{') || cleaned.startsWith('}') ||
            cleaned.startsWith('[') || cleaned.startsWith(']') ||
            cleaned.endsWith('{') || cleaned.endsWith('[') ||
            cleaned.startsWith('```') ||
            cleaned.toLowerCase().startsWith('output json') ||
            /^"(?:intro|socialPost|title|description|hashtags|scenes|id|character|imagePrompt|videoPrompt)"\s*:/.test(cleaned);

        if (cleaned.length > 8 && !isJsonSyntax) {
            const unquoted = cleaned.replace(/^["']|["']$/g, '').trim();
            if (unquoted.length > 8) {
                extractedLines.push(unquoted);
            }
        }
    }

    if (extractedLines.length === 0) {
        throw new Error("AI failed to generate structural script.");
    }

    const scenes = extractedLines.slice(0, 6).map((line, idx) => ({
        id: idx + 1,
        character: mode === 'objects' ? `Talking Object ${idx + 1}` : 'Presenter',
        line: line
    }));

    return normalizeStudioScenes({ intro: topic, scenes }, topic, mode, langName);
}

/**
 * Saves script.json, prompts.json and prompts.txt into the project folder.
 */
function saveStudioProjectPrompts(projectFolder, scriptData, mode, topic, language, amazonProduct = null) {
    if (!projectFolder || !scriptData) return;
    try {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        const projectDir = path.join(skeletonDir, projectFolder);
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // 1. Machine-readable script.json
        const scriptJsonPath = path.join(projectDir, 'script.json');
        fs.writeFileSync(scriptJsonPath, JSON.stringify(scriptData, null, 2), 'utf8');

        // 2. Structured prompts.json
        const promptsJsonPath = path.join(projectDir, 'prompts.json');
        const promptsMeta = {
            topic: topic || scriptData.intro || '',
            mode: mode || 'health',
            language: language || '',
            createdAt: new Date().toISOString(),
            socialPost: scriptData.socialPost || null,
            amazonProduct: amazonProduct ? {
                code: amazonProduct.code,
                title: amazonProduct.title,
                category: amazonProduct.category,
                img: amazonProduct.img || `img/prod_${amazonProduct.code}.jpg`,
                url: amazonProduct.amazonUrl
            } : null,
            scenes: (scriptData.scenes || []).map((s, idx) => ({
                id: s.id || idx + 1,
                character: s.character || '',
                line: s.line || '',
                imageVariant: s.imageVariant || '',
                videoVariant: s.videoVariant || '',
                imagePrompt: s.imagePrompt || '',
                videoPrompt: s.videoPrompt || s.video_prompt || ''
            }))
        };
        fs.writeFileSync(promptsJsonPath, JSON.stringify(promptsMeta, null, 2), 'utf8');

        // 3. Human-readable prompts.txt
        const promptsTxtPath = path.join(projectDir, 'prompts.txt');
        const modeTitle = mode === 'health' ? 'AI PSYCHOTALK' : 'AI OBJECTWARS';
        let txtContent = `========================================================================\n`;
        txtContent += `${modeTitle} — GENERATION PROMPTS\n`;
        txtContent += `========================================================================\n`;
        txtContent += `Topic: ${topic || scriptData.intro || 'Untitled'}\n`;
        txtContent += `Mode: ${mode || 'health'}\n`;
        if (language) txtContent += `Language: ${language}\n`;
        txtContent += `Folder: ${projectFolder}\n`;
        txtContent += `Generated: ${new Date().toLocaleString()}\n`;
        if (amazonProduct) {
            txtContent += `------------------------------------------------------------------------\n`;
            txtContent += `🛒 AMAZON SHOWCASE PRODUCT: #${amazonProduct.code} — ${amazonProduct.title}\n`;
            if (amazonProduct.amazonUrl) txtContent += `🔗 Affiliate URL: ${amazonProduct.amazonUrl}\n`;
            txtContent += `🏷️ Keypad Code: ${amazonProduct.code} (silom2000.github.io/mes-trouvailles/#${amazonProduct.code})\n`;
        }
        if (scriptData.socialPost) {
            txtContent += `------------------------------------------------------------------------\n`;
            txtContent += `📱 SOCIAL POST\n`;
            if (scriptData.socialPost.title) txtContent += `Title: ${scriptData.socialPost.title}\n`;
            if (scriptData.socialPost.description) txtContent += `Description: ${scriptData.socialPost.description}\n`;
            if (scriptData.socialPost.hashtags) txtContent += `Hashtags: ${scriptData.socialPost.hashtags}\n`;
        }
        txtContent += `========================================================================\n\n`;

        (scriptData.scenes || []).forEach((scene, idx) => {
            const num = scene.id || idx + 1;
            const char = scene.character || 'Character';
            const vidPrompt = scene.videoPrompt || scene.video_prompt || '';
            txtContent += `🎬 SCENE #${num} (${char})\n`;
            txtContent += `------------------------------------------------------------------------\n`;
            if (scene.line) {
                txtContent += `🗣 Dialogue: "${scene.line}"\n\n`;
            }
            txtContent += `🖼️ IMAGE PROMPT:\n${scene.imagePrompt || ''}\n\n`;
            txtContent += `🎬 VIDEO PROMPT:\n${vidPrompt}\n`;
            txtContent += `------------------------------------------------------------------------\n\n`;
        });

        fs.writeFileSync(promptsTxtPath, txtContent, 'utf8');
        console.log(`[Studio Prompts] ✅ Successfully saved script.json, prompts.json and prompts.txt to: ${projectDir}`);
    } catch (e) {
        console.error(`[Studio Prompts] ❌ Error saving prompts to ${projectFolder}:`, e.message);
    }
}

/**
 * Builds 4 viral cover prompt variations following 100K_PromptGuide.md
 * (Curiosity Eureka, Before/After Split, Product Hero Showcase, Insider Secret).
 */
function buildCoverPromptsFromGuide({ topic, amazonProduct, script }) {
    let productDesc = '';
    let productCode = '';
    if (amazonProduct) {
        productDesc = `Amazon product "${amazonProduct.title}" (${amazonProduct.category}): ${amazonProduct.quote || ''}. ${amazonProduct.verdict || ''}`;
        productCode = `#${amazonProduct.code}`;
    } else {
        productDesc = topic || (script && script.intro) || 'Scientific home lifehack and cleaning transformation';
        const match = (topic || '').match(/#(\d+)/);
        if (match) productCode = `#${match[1]}`;
    }

    const baseQuality = 'professional 8K character render, 3D Pixar animated film style, cinematic 9:16 vertical framing, character appearance strictly from the provided reference image';
    const baseNegative = 'NOT: plastic skin, mannequin, oversaturated, deformed fingers, extra limbs, blurry, dark murky, 2d cartoon';
    const productFidelity = amazonProduct ? ' (exact physical match to the product reference image, authentic design and real-world proportions)' : '';

    return [
        {
            id: 0,
            styleId: 'eureka',
            styleTitle: 'Шок-открытие',
            badge: 'Любопытство (Curiosity Gap)',
            description: 'Крупный план с широко распахнутыми глазами и светящейся реакцией',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Close-up portrait (Leica M11 50mm Summilux f/1.4 look), ${baseQuality}, looking straight into camera with mouth open and wide expressive eyes in absolute amazement, holding up ${productDesc}${productFidelity} with foaming sparkling reaction and glowing discovery. Dynamic volumetric light rays, softbox at 45 degrees, warm amber subsurface scattering on face, vibrant cool cyan bokeh background of modern research laboratory. High editorial contrast. ${baseNegative}.`
        },
        {
            id: 1,
            styleId: 'before_after',
            styleTitle: 'Контраст До / После',
            badge: 'До / После (Visual Proof)',
            description: 'Разделенный экран: безнадежная грязь слева и сияющий результат справа',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Dynamic Dutch angle 12 degrees split-frame composition, ${baseQuality}. On the left side: heavily stained ruined surface and dirty problem area. On the right side: pristine, gleaming, miraculously clean transformation achieved with ${productDesc}${productFidelity}. Génie stands between them smiling proudly, pointing to the sparkling clean side. Razor-sharp micro-textures, glossy reflections, clean editorial fashion lighting, 3D pop. ${baseNegative}.`
        },
        {
            id: 2,
            styleId: 'product_hero',
            styleTitle: 'Герой Продукта',
            badge: productCode ? `Товар ${productCode} (Product Hero)` : 'Герой Продукта (Hero Showcase)',
            description: 'Фокус на товаре или инструменте крупным планом с кодом в руках',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Snorkel lens extreme close foreground perspective, Sony A7R V 85mm GM f/1.4, ${baseQuality}. Holding directly towards camera the hero cleaning device or tool: ${productDesc}${productFidelity}${productCode ? ` with prominent glowing badge "${productCode}"` : ''}. Razor-sharp foreground focus with creamy bokeh. Génie in the background winks playfully and gives a confident thumbs-up. Studio commercial lighting, crisp rim light separating subject, luxury vibrant colors. ${baseNegative}.`
        },
        {
            id: 3,
            styleId: 'insider_secret',
            styleTitle: 'Заговорщический секрет',
            badge: 'Секрет (Insider Hook)',
            description: 'Таинственный жест «Тссс!», призыв узнать закрытый лайфхак',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Intimate eye-level 3/4 angle portrait, ${baseQuality}. Génie leans forward towards viewer with her index finger gently held to her lips in a mysterious "shhh! don't tell anyone this secret" gesture, intense knowing eye contact, with ${productDesc}${productFidelity} resting visibly on the counter next to her. Cinematic moody lighting, dramatic subtle Venetian blind shadow pattern across skin, warm golden hour highlights, mysterious laboratory background with glowing jars and bokeh balls. High curiosity trigger. ${baseNegative}.`
        }
    ].map(item => ({
        ...item,
        prompt: sanitizePromptForImageSafety(item.prompt)
    }));
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
        return await ai.chat([{ role: 'user', content: prompt }]);
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
Each segment MUST be exactly ONE flowing sentence of 17-20 words (MAXIMUM 21 words). This is vital to fit the 8-second video duration. NO exceptions.

CONTENT PER CHECKPOINT:
- Briefly mention the physical feeling, mental state, or a quick comparison.
- Use plain language. No medical jargon. No disease names.
- Every line must be easy to imagine visually.

Output ONLY a JSON object with a "segments" array containing exactly 6 objects:
{ "segments": [ { "original": "exact script segment in ${langName}", "translation": "exact Russian translation of this segment" } ] }`;

        const scriptRaw = await ai.chat([{ role: 'user', content: scriptPrompt }], true);
        const scriptJson = cleanAndParseJSON(scriptRaw);
        
        let segmentsArray = [];
        if (Array.isArray(scriptJson)) segmentsArray = scriptJson;
        else if (scriptJson.segments) segmentsArray = scriptJson.segments;
        else if (scriptJson.script) segmentsArray = scriptJson.script;
        else if (scriptJson.ideas) segmentsArray = scriptJson.ideas;
        else {
            const found = Object.values(scriptJson).find(Array.isArray);
            if (found) segmentsArray = found;
        }

        const scriptForUI = segmentsArray.map(s => typeof s === 'string' ? s : `${s.original || s.text || ''}\n[🇷🇺 ${s.translation || ''}]`).join('\n\n');
        const scriptForPrompts = segmentsArray.map(s => typeof s === 'string' ? s : (s.original || s.text || '')).join('\n\n');

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

        const promptsRaw = await ai.chat([{ role: 'user', content: promptsPrompt }], true);
        const promptsJson = cleanAndParseJSON(promptsRaw);
        let rawScenes = [];
        if (Array.isArray(promptsJson)) rawScenes = promptsJson;
        else if (promptsJson.scenes) rawScenes = promptsJson.scenes;
        else if (promptsJson.script) rawScenes = promptsJson.script;
        else {
            const found = Object.values(promptsJson).find(Array.isArray);
            if (found) rawScenes = found;
        }

        let scenes = rawScenes.map((s, idx) => ({
            ...s,
            id: idx + 1,
            // TASK 2: IMAGE PROMPTS (Full character description repeated verbatim per prompt.md)
            image_prompt: `A full-body Pixar-style animated humanoid figure with a crystal-clear glass outer shell revealing a smooth ivory-white internal structural framework. Face: two large glowing yellow eyes with dark pupils, friendly neutral expression, rounded smooth head. Body framework: polished ivory-colored rigid structural elements — arms, legs, torso core, joints — all proportioned and stylized. Medical-illustration aesthetic: clean, modern, clinical, bright studio lighting. Pixar 3D CGI, physically-based rendering, 8K cinematic quality. NOT horror, NOT scary. Environment: ${s.environment || 'studio'}. Pose: ${s.pose_action || 'standing'}. ${s.visual_detail || ''} Vibrant saturated colors, high contrast, BOLD LARGE OBJECTS in the background to ground the scene, masterpiece quality.`,

            // TASK 3: IMAGE-TO-VIDEO PROMPTS
            video_prompt: `Cinematic motion: ${s.motion_detail || 'subtle motion'}. Action: character ${s.pose_action || 'acting'}. Cinematic camera move (smooth dolly or slow-motion zoom), vibrant saturated colors, high resolution, masterpiece quality, fluid movement.`,

            // LTX-2 SPECIFIC RULES (Prompt.md requirements: Anchor at start, Audio label, Negative prompt)
            ltx_video_prompt: `STRICTLY NO TEXT, NO SUBTITLES, NO CAPTIONS. ${CHARACTER_ANCHOR} Mood: confident and energetic, NOT scary, NOT monstrous. ACTION: ${s.pose_action || 'acting'}. ENVIRONMENT: ${s.environment || 'studio'}. CINEMATIC CAMERA: Smooth tracking or slow-motion zoom. VIBRANT COLORS, HIGH SATURATION. AUDIO NARRATION ONLY (DO NOT SHOW AS TEXT): "${s.script_line || ''}". NEGATIVE PROMPT: blurry, low quality, watermark, text, subtitles, captions, asymmetric face, distorted features, uncanny valley expression.`
        }));

        // Audio is now synthesized separately via 'skeleton-generate-audio'
        return { script: scriptForUI, scenes };
    });

    ipcMain.handle('skeleton-generate-audio', async (event, { script, scenes, language }) => {
        console.log('[Skeleton] Audio synthesis is DISABLED (G-Labs handles lip-sync).');
        return { fullAudioUrl: '', sceneAudioUrls: (scenes || []).map(() => '') };
    });

    ipcMain.handle('skeleton-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder, mode, amazonProduct }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir);
        const filePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

        // We use G-Labs for image generation
        const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';

        let referenceImages = [];
        let refImgPath = null;

        if (mode === 'psychology') {
            // Use psychology_character.jpg from src/assets as reference
            const psychPath = path.join(__dirname, 'src', 'assets', 'psychology_character.jpg');
            if (fs.existsSync(psychPath)) {
                refImgPath = psychPath;
            }
        } else {
            const getRefImg = () => {
                const searchNames = [
                    'genie_reference.png', 'genie_reference.jpg', 'genie_reference.jpeg', 'genie_reference.webp',
                    'character_reference.png', 'character_reference.jpg', 'character_reference.jpeg',
                    'reference.png', 'reference.jpg'
                ];
                let list = [];
                for (const name of searchNames) {
                    const fullPath = path.join(__dirname, name);
                    if (fs.existsSync(fullPath)) {
                        try {
                            const stat = fs.statSync(fullPath);
                            list.push({ path: fullPath, mtime: stat.mtimeMs });
                        } catch (_) {}
                    }
                }
                if (list.length === 0) return null;
                // Always choose the most recently modified reference image!
                list.sort((a, b) => b.mtime - a.mtime);
                const best = list[0];
                let mime = best.path.endsWith('.png') ? 'image/png' : 'image/jpeg';
                try {
                    const buf = Buffer.alloc(16);
                    const fd = fs.openSync(best.path, 'r');
                    fs.readSync(fd, buf, 0, 16, 0);
                    fs.closeSync(fd);
                    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) mime = 'image/png';
                    else if (buf[0] === 0xFF && buf[1] === 0xD8) mime = 'image/jpeg';
                    else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
                } catch (_) {}
                return { path: best.path, mime };
            };

            const refInfo = getRefImg();
            if (refInfo) {
                const imageBase64 = fs.readFileSync(refInfo.path, { encoding: 'base64' });
                referenceImages.push({ data: `data:${refInfo.mime};base64,${imageBase64}` });
                console.log(`[Skeleton Image] Injected global reference image for character from ${refInfo.path} (${refInfo.mime})`);
            }
        }

        if (refImgPath && fs.existsSync(refImgPath)) {
            const ext = refImgPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const imageBase64 = fs.readFileSync(refImgPath, { encoding: 'base64' });
            referenceImages.push({ data: `data:${ext};base64,${imageBase64}` });
            console.log(`[Skeleton Image] Injected reference image for Psychology character`);
        }

        // Secondary Reference: In addition to character reference, inject Amazon product reference image
        let effectiveAmazonProduct = amazonProduct || null;
        if (!effectiveAmazonProduct && projectFolder) {
            try {
                const metaPath = path.join(skeletonDir, projectFolder, 'prompts.json');
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                }
            } catch (_) {}
        }
        if (!effectiveAmazonProduct && typeof imagePrompt === 'string') {
            const codeMatch = imagePrompt.match(/#(\d+)/);
            if (codeMatch) {
                effectiveAmazonProduct = amazonManager.getByCode(codeMatch[1]);
            }
        }

        let finalImagePrompt = imagePrompt;
        if (effectiveAmazonProduct) {
            // Determine if this scene belongs to the product block (Scene 5+ for 8-scene, Scene 3+ for 5-scene)
            let totalScenes = 8;
            if (projectFolder) {
                try {
                    const metaPath = path.join(skeletonDir, projectFolder, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (Array.isArray(meta.scenes)) totalScenes = meta.scenes.length;
                    }
                } catch (_) {}
            }
            const productStartSceneIndex = totalScenes <= 5 ? 2 : 4; // 0-based: Scene 5 (index 4) for 8-scene, Scene 3 (index 2) for 5-scene
            const isProductScene = sceneIndex >= productStartSceneIndex;

            if (isProductScene) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Skeleton Image] Injected Amazon product reference #${effectiveAmazonProduct.code} (${effectiveAmazonProduct.title}) into scene ${sceneIndex + 1}`);
                        finalImagePrompt += ` The item/tool must accurately match the exact physical design, color, and features of the product shown in the product reference image (Amazon #${effectiveAmazonProduct.code} - ${effectiveAmazonProduct.title}).`;
                    }
                } catch (prodErr) {
                    console.warn(`[Skeleton Image] Could not load product image reference:`, prodErr.message);
                }
            } else {
                // Scenes 1-4 are 100% pure home lifehack — strictly forbid injecting the commercial tool!
                console.log(`[Skeleton Image] Scene ${sceneIndex + 1} is in the pure DIY lifehack block (Scenes 1-4). Product reference NOT injected.`);
                finalImagePrompt += ` (STRICT: Pure home lifehack demonstration scene — absolutely NO commercial electrical tools, gadgets, or Amazon products in this scene. The character has empty hands or uses simple natural DIY household items like a bowl, spoon, or rag).`;
            }
        }

        finalImagePrompt = sanitizePromptForImageSafety(finalImagePrompt);

        event.sender.send('skeleton-image-progress', { sceneIndex, status: 'generating' });

        const savedPaths = await ai.generateImage({
            prompt: finalImagePrompt,
            model: cleanModel,
            count: 1,
            sectionDir: skeletonDir,
            subFolder: projectFolder,
            sceneIndex: sceneIndex,
            referenceImages: referenceImages,
            onProgress: (p) => {
                event.sender.send('skeleton-image-progress', { sceneIndex, status: p.status, attempt: p.attempt });
            }
        });
        
        if (!savedPaths || savedPaths.length === 0 || !fs.existsSync(savedPaths[0])) {
            console.warn(`[Skeleton Image] Image generation skipped/failed for scene ${sceneIndex + 1}`);
            return null;
        }
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
            if (!promptToUse.toLowerCase().includes('cgi') && !promptToUse.toLowerCase().includes('animation')) {
                promptToUse = `High-end 3D CGI animation. ` + promptToUse;
            }
            if (!videoPrompt.includes('CHARACTER:') && !videoPrompt.includes('NEGATIVE PROMPT:')) {
                promptToUse = `${promptToUse} AUDIO TRACK: A highly emotional, panicked, and intense adult male voice ALMOST SCREAMING in ${langStr}. STRICTLY NO BACKGROUND NOISE, NO MUSIC, NO SOUND EFFECTS, JUST PURE RAW SHOUTING VOICE. Spoken text: "${scriptLine}"`;
            } else if (!videoPrompt.includes('AUDIO TRACK:')) {
                // Ensure audio track is present for lip-sync if not already there
                promptToUse += ` AUDIO TRACK: Professional character voice speaking exactly: "${scriptLine}". LIP-SYNC: Accurate mouth movement.`;
            }
            // Explicit age, maturity, and safety sanitation to prevent false-positive CHILD_SAFETY triggers on Omni Flash / Veo
            promptToUse = promptToUse
                .replace(/\band cute\b/gi, 'and charming')
                .replace(/\bcute gestures\b/gi, 'expressive confident gestures')
                .replace(/\bcute\b/gi, 'expressive')
                .replace(/\bThe Little Genius\b/gi, 'Génie, the adult woman scientist')
                .replace(/\blittle genius\b/gi, 'adult scientist')
                .replace(/\blittle\b/gi, 'compact')
                .replace(/\bchild\b/gi, 'adult')
                .replace(/\bchildren\b/gi, 'people')
                .replace(/\bteenager\b/gi, 'adult')
                .replace(/\bteen\b/gi, 'adult')
                .replace(/\byoung woman\b/gi, 'adult woman')
                .replace(/\byoung charismatic\b/gi, 'charismatic adult')
                .replace(/\byoung adult\b/gi, 'adult professional')
                .replace(/\byoung\b/gi, 'adult')
                .replace(/\bmid-twenties\b/gi, 'late twenties')
                .replace(/\bgirl\b/gi, 'woman')
                .replace(/\bkid\b/gi, 'person')
                .replace(/\bkids\b/gi, 'people')
                .replace(/\bPixar 3D animation style\b/gi, 'high-end 3D CGI animation')
                .replace(/\bPixar style\b/gi, 'high-end 3D CGI')
                .replace(/\bPixar\b/gi, 'high-end CGI')
                .replace(/\b3D cartoon animation style\b/gi, 'high-end 3D CGI animation')
                .replace(/\bcartoon animation style\b/gi, 'CGI animation style')
                .replace(/\bcartoon animation\b/gi, 'CGI animation')
                .replace(/\bcartoon\b/gi, 'animated CGI');

            // Prepend explicit adult framing for Omni Flash safety classifiers
            if (!promptToUse.includes('ADULT PERSON') && !promptToUse.includes('mature adult')) {
                promptToUse = `[Character: mature adult professional scientist in her late 20s, fully adult facial features, confident professional demeanor]. ` + promptToUse;
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
            
            videoFile = await ai.generateVideo({
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
        console.log(`[Studio SEO] Fetching SEO keywords for lang=${langName} mode=${mode}`);

        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const currentMonth = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        const seasonMap = { 0:'winter',1:'winter',2:'spring',3:'spring',4:'spring',5:'summer',6:'summer',7:'summer',8:'autumn',9:'autumn',10:'autumn',11:'winter' };
        const currentSeason = seasonMap[now.getMonth()];

        try {
            // 🔍 Real-time web search for current trends via Perplexity
            const liveTrends = await searchTrends(langName, mode, currentSeason, currentMonth, currentYear);
            
            const niche = mode === 'health'
                ? 'smart lifehacks, clever household tricks, home organization secrets, kitchen hacks, daily routine efficiency, genius problem solving, life shortcuts, viral everyday tips'
                : 'household items, daily problems, lifehacks, room organization, productivity';

            const topicsPrompt = `You are an expert TikTok SEO analyst for ${langName}-speaking audience.
Based on recent search trends and web data for ${currentMonth} ${currentYear} (${currentSeason}):
${liveTrends || 'No live data, use your best knowledge of current viral trends.'}

Identify the top 5 to 10 absolute MOST SEARCHED queries that users are actively typing into the TikTok search bar right now regarding: ${niche}. 
These should be queries with high search volume (Search Intent), such as popular questions, viral topics, or highly searched phrases.
The "original" query MUST be in ${langName} language.
The "translation" MUST be an accurate Russian translation (перевод на русский язык) of the query so a Russian creator understands what it means.

Output ONLY a raw JSON array of objects with "original" and "translation" keys (no markdown, no other text).
Example: [{"original": "climatiseur maison sans électricité", "translation": "домашний кондиционер без электричества"}, {"original": "astuce canicule pour dormir", "translation": "лайфхак как спать в жару"}]`;

            const rawJson = await ai.chat([
                { role: 'user', content: topicsPrompt }
            ], true, provider);

            const match = rawJson.match(/\[[\s\S]*\]/);
            if (!match) throw new Error('Failed to parse SEO keywords JSON from AI: ' + rawJson);
            
            const keywords = JSON.parse(match[0]);
            if (!Array.isArray(keywords)) throw new Error('Result is not an array');
            
            // Map to the { original, translation } format expected by StudioTab
            const ideas = keywords.slice(0, 10).map(item => {
                if (typeof item === 'string') {
                    return { original: item, translation: '' };
                }
                return {
                    original: item.original || item.query || '',
                    translation: item.translation || item.russian_translation || item.ru || ''
                };
            });

            return ideas;
        } catch (e) {
            console.error('[Studio SEO] Error fetching keywords:', e);
            throw e;
        }
    });

    // ── Helper: Extract text and story from Screenshot using Vision OCR ────────
    async function extractScreenshotInfo(screenshotBase64, event) {
        if (!screenshotBase64 || typeof screenshotBase64 !== 'string') return null;

        console.log(`[Studio Screenshot] Analyzing screenshot via Vision OCR...`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '🔍 Сканирую текст и правила со скриншота через Vision AI...', progress: 30 });
        }

        const ocrPrompt = `You are a world-class OCR and content analyst.
Analyze this image carefully. Extract ALL text, rules, lifehacks, clever tricks, household secrets, quotes, or tips verbatim.
If the image contains numbered lists or bullet points (e.g. "1. Секрет идеальной чистки...", "2. Как сложить вещи..."), extract EVERY SINGLE point in full detail without skipping or truncating anything.
Also provide a short 1-sentence summary of the main core message/theme.

OUTPUT FORMAT:
Main Theme: [Core topic]
Extracted Points:
1. [Full text of point 1]
2. [Full text of point 2]
...`;

        try {
            const cleanBase64 = screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/jpeg;base64,${screenshotBase64}`;
            const visionResponse = await ai.chat([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: ocrPrompt },
                        { type: 'image_url', image_url: { url: cleanBase64 } }
                    ]
                }
            ]);

            console.log(`[Studio Screenshot] OCR result extracted (${visionResponse.length} chars): "${visionResponse.slice(0, 150)}..."`);
            return {
                text: visionResponse
            };
        } catch (err) {
            console.error(`[Studio Screenshot] Vision OCR failed:`, err.message);
            throw new Error(`Ошибка распознавания скриншота: ${err.message}`);
        }
    }

    // ── Helper: Extract Speech and Visual Context from Local Video Upload ────────
    async function extractLocalVideoInfo(videoBase64, event) {
        if (!videoBase64 || typeof videoBase64 !== 'string') return null;

        console.log(`[Studio Local Video] Processing uploaded local video file...`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '📥 Извлекаю аудиодорожку и ключевые кадры из загруженного видео...', progress: 20 });
        }

        const tempDir = path.join(__dirname, 'SkeletonShorts', 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `local_vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const tempVideoPath = path.join(tempDir, `${tempFilePrefix}.mp4`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);
        const framesDir = path.join(tempDir, `${tempFilePrefix}_frames`);
        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

        try {
            // 1. Write video buffer from base64
            const cleanBase64 = videoBase64.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '');
            const videoBuffer = Buffer.from(cleanBase64, 'base64');
            fs.writeFileSync(tempVideoPath, videoBuffer);

            // 2. Extract audio to MP3 using ffmpeg
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', [
                    '-i', tempVideoPath,
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-ar', '16000',   // 16 kHz — native Whisper/Gemini STT input rate
                    '-ac', '1',       // mono — cuts file size in half vs stereo
                    '-b:a', '32k',    // 32 kbps — sufficient for speech recognition
                    '-y', targetMp3
                ], { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0 && fs.existsSync(targetMp3)) resolve(true);
                    else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-300)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
            });

            // 3. Transcribe audio speech via STT
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🗣️ Распознаю речь и правила из видео через STT...', progress: 45 });
            }
            let transcriptText = '';
            try {
                const sttResult = await ai.transcribe(targetMp3);
                transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();
            } catch (sttErr) {
                console.warn(`[Studio Local Video] STT transcription failed or no speech: ${sttErr.message}`);
            }

            // 4. Extract 4-6 evenly spaced keyframes from video for Vision analysis
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🔍 Анализирую визуальные демонстрации и объекты в видео через Vision AI...', progress: 60 });
            }

            // Get video duration via ffprobe
            let duration = 10;
            try {
                const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`).toString().trim();
                duration = Math.max(1, parseFloat(durationStr) || 10);
            } catch (_) {}

            // Sample 4 representative timestamps across video
            const sampleCount = 4;
            const timestamps = [];
            for (let i = 0; i < sampleCount; i++) {
                const t = Math.min(duration - 0.2, Math.max(0.2, (duration / (sampleCount + 1)) * (i + 1)));
                timestamps.push(t.toFixed(2));
            }

            const frameBase64List = [];
            for (let i = 0; i < timestamps.length; i++) {
                const t = timestamps[i];
                const framePath = path.join(framesDir, `frame_${i + 1}.jpg`);
                try {
                    execSync(`ffmpeg -ss ${t} -i "${tempVideoPath}" -vframes 1 -q:v 3 -y "${framePath}"`, { windowsHide: true });
                    if (fs.existsSync(framePath)) {
                        const frameBuf = fs.readFileSync(framePath);
                        frameBase64List.push(`data:image/jpeg;base64,${frameBuf.toString('base64')}`);
                    }
                } catch (frameErr) {
                    console.warn(`[Studio Local Video] Frame extraction failed at ${t}s: ${frameErr.message}`);
                }
            }

            // 5. Vision AI analysis of extracted frames
            let visualDescription = '';
            if (frameBase64List.length > 0) {
                try {
                    const contentParts = [
                        {
                            type: 'text',
                            text: `You are an expert video and lifehack analyst.
Analyze these consecutive frames from a reference video.
Identify and describe in detail:
1. What objects, tools, or household items are shown.
2. What specific lifehack, secret technique, cleaning/organizing trick, or practical action is being demonstrated.
3. Any on-screen text, labels, measurements, or captions.
4. The step-by-step procedure shown in the visuals.

Provide a clear, dense summary of the exact lifehack/trick demonstrated in the video.`
                        }
                    ];
                    for (const fBase64 of frameBase64List) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url: fBase64 }
                        });
                    }

                    visualDescription = await ai.chat([
                        {
                            role: 'user',
                            content: contentParts
                        }
                    ]);
                    console.log(`[Studio Local Video] Vision frame analysis completed (${visualDescription.length} chars).`);
                } catch (visionErr) {
                    console.warn(`[Studio Local Video] Vision analysis failed: ${visionErr.message}`);
                }
            }

            // 6. Cleanup temporary video and audio files
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
                if (fs.existsSync(framesDir)) {
                    const fFiles = fs.readdirSync(framesDir);
                    for (const f of fFiles) fs.unlinkSync(path.join(framesDir, f));
                    fs.rmdirSync(framesDir);
                }
            } catch (_) {}

            return {
                transcript: transcriptText,
                visualDescription: visualDescription,
                combinedSummary: `Video Spoken Content: "${transcriptText || 'None'}"\n\nVisual Actions & Demonstration: "${visualDescription || 'None'}"`
            };
        } catch (err) {
            console.error(`[Studio Local Video] Error processing video:`, err.message);
            // Cleanup on error
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
                if (fs.existsSync(framesDir)) {
                    const fFiles = fs.readdirSync(framesDir);
                    for (const f of fFiles) fs.unlinkSync(path.join(framesDir, f));
                    fs.rmdirSync(framesDir);
                }
            } catch (_) {}
            throw new Error(`Ошибка обработки локального видео: ${err.message}`);
        }
    }

    // ── Helper: Download and Transcribe Reference Video URL ──────────────────
    async function extractReferenceVideoInfo(referenceUrl, event) {
        if (!referenceUrl || typeof referenceUrl !== 'string' || !referenceUrl.trim().startsWith('http')) {
            return null;
        }

        const cleanUrl = referenceUrl.trim();
        console.log(`[Studio Reference] Extracting audio/story from URL: ${cleanUrl}`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '📥 Скачиваю аудио из референсного видео...', progress: 15 });
        }

        const tempDir = path.join(__dirname, 'SkeletonShorts', 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const outputTemplate = path.join(tempDir, `${tempFilePrefix}.%(ext)s`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);

        const tempVideoPath = path.join(tempDir, `${tempFilePrefix}_video.mp4`);

        try {
            // Download audio-only stream (avoids DASH video+audio merge which requires ffmpeg in yt-dlp's PATH)
            // bestaudio[ext=m4a] = YouTube's native AAC stream, no conversion needed, ~15 MB for 15 min
            const isInstagram = cleanUrl.includes('instagram.com');
            const audioOutputTemplate = path.join(tempDir, `${tempFilePrefix}_audio.%(ext)s`);
            const baseArgs = [
                '--no-playlist',
                '--socket-timeout', '60',
                '--no-update',
                '-f', 'bestaudio[ext=m4a]/bestaudio/best',  // audio-only, no DASH merge
                '-o', audioOutputTemplate,                   // native extension — no forced container conversion
            ];

            const runYtDlp = (extraArgs) => new Promise((resolve, reject) => {
                const proc = spawn('yt-dlp', [...baseArgs, ...extraArgs, cleanUrl], { windowsHide: true });
                let stderr = '';
                let stdout = '';
                proc.stdout.on('data', (d) => { stdout += d.toString(); }); // yt-dlp progress goes to stdout!
                proc.stderr.on('data', (d) => { stderr += d.toString(); });
                proc.on('close', (code) => {
                    if (code === 0) {
                        // Log both streams for diagnostics
                        if (stdout) console.log('[Studio yt-dlp] Output:', stdout.slice(-600));
                        if (stderr) console.log('[Studio yt-dlp] Stderr:', stderr.slice(-300));
                        resolve(true);
                    } else {
                        console.error('[Studio yt-dlp] Error stdout:', stdout.slice(-400));
                        console.error('[Studio yt-dlp] Error stderr:', stderr.slice(-400));
                        reject(new Error(`yt-dlp failed (code ${code}): ${(stdout + stderr).slice(-400)}`));
                    }
                });
                proc.on('error', (err) => reject(new Error(`Failed to start yt-dlp: ${err.message}`)));
            });

            if (isInstagram) {
                // Priority 1: cookies file (most reliable — works regardless of browser state)
                const cookiesFile = path.join(__dirname, 'instagram_cookies.txt');
                if (fs.existsSync(cookiesFile)) {
                    console.log('[Studio] Using instagram_cookies.txt for Instagram download');
                    await runYtDlp(['--cookies', cookiesFile]);
                } else {
                    // Priority 2: Firefox only — Chrome/Edge lock their DB while open
                    try {
                        console.log('[Studio] Trying Firefox cookies for Instagram');
                        await runYtDlp(['--cookies-from-browser', 'firefox']);
                    } catch (e) {
                        console.warn('[Studio] Firefox cookies failed:', e.message);
                        throw new Error(
                            'Instagram требует авторизацию. Варианты:\n' +
                            '1. Экспортируй cookies из браузера в файл instagram_cookies.txt и положи рядом с приложением (расширение "Get cookies.txt LOCALLY" для Chrome).\n' +
                            '2. Войди в Instagram в Firefox и попробуй снова.'
                        );
                    }
                }
            } else {
                const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
                if (isYouTube) {
                    // YouTube: modern yt-dlp requires explicit player_client to avoid bot-detection
                    const ytArgs = ['--extractor-args', 'youtube:player_client=web,default'];
                    try {
                        await runYtDlp(ytArgs);
                    } catch (ytErr) {
                        console.warn('[Studio] YouTube direct failed, trying with Firefox cookies:', ytErr.message);
                        try {
                            await runYtDlp([...ytArgs, '--cookies-from-browser', 'firefox']);
                        } catch (ffErr) {
                            console.warn('[Studio] Firefox cookies failed, trying Chrome:', ffErr.message);
                            try {
                                await runYtDlp([...ytArgs, '--cookies-from-browser', 'chrome']);
                            } catch (chrErr) {
                                // Re-throw original error with full detail
                                throw new Error(`Не удалось скачать YouTube видео. Попробуй:\n1. Обнови yt-dlp: yt-dlp -U\n2. Войди в YouTube в Firefox и повтори.\n\nОшибка: ${ytErr.message.slice(-300)}`);
                            }
                        }
                    }
                } else {
                    await runYtDlp([]);
                }
            }

            // Check video was downloaded — search broadly across all common video/audio extensions
            if (!fs.existsSync(tempVideoPath)) {
                const videoExts = ['.mp4', '.webm', '.mkv', '.m4v', '.avi', '.ts', '.m4a', '.mp3'];
                const found = fs.readdirSync(tempDir).find(f =>
                    f.startsWith(tempFilePrefix) && videoExts.some(ext => f.endsWith(ext))
                );
                if (!found) {
                    // List what IS in tempDir for diagnostics
                    const available = fs.readdirSync(tempDir).filter(f => f.startsWith(tempFilePrefix));
                    console.error('[Studio yt-dlp] tempDir files after download:', available);
                    throw new Error('Не удалось скачать референсное видео. Возможно yt-dlp устарел — запусти: yt-dlp -U');
                }
                fs.renameSync(path.join(tempDir, found), tempVideoPath);
            }

            // Extract audio from video via ffmpeg (guarantees we get the correct audio track)
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🔊 Извлекаю аудиодорожку из видео...', progress: 35 });
            }
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', [
                    '-i', tempVideoPath,
                    '-vn', '-acodec', 'libmp3lame',
                    '-ar', '16000',   // 16 kHz — native Whisper/Gemini STT rate
                    '-ac', '1',       // mono
                    '-b:a', '32k',    // 32 kbps — enough for speech
                    '-y', targetMp3
                ], { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0 && fs.existsSync(targetMp3)) resolve(true);
                    else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-200)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
            });

            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🗣️ Распознаю речь и ключевые хуки...', progress: 45 });
            }

            const sttResult = await ai.transcribe(targetMp3);
            const transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();

            // Cleanup temp files
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
            } catch (e) {}

            if (!transcriptText) {
                throw new Error('Не удалось распознать текст из референсного видео.');
            }

            console.log(`[Studio Reference] Transcript extracted (${transcriptText.length} chars): "${transcriptText.slice(0, 120)}..."`);
            return {
                url: cleanUrl,
                transcript: transcriptText
            };
        } catch (err) {
            console.error(`[Studio Reference] Extraction error:`, err.message);
            throw new Error(`Ошибка разбора референсного видео: ${err.message}`);
        }
    }

    ipcMain.handle('studio-parse-reference-video', async (event, { referenceUrl }) => {
        return await extractReferenceVideoInfo(referenceUrl, event);
    });

    ipcMain.handle('studio-parse-screenshot', async (event, { screenshotBase64 }) => {
        return await extractScreenshotInfo(screenshotBase64, event);
    });

    ipcMain.handle('studio-generate-script', async (event, { mode, topic, language, provider, projectFolder, referenceUrl, screenshotBase64, videoBase64, durationMode, amazonProduct, autoSourceAmazon }) => {
        const langName = LANG_NAMES[language] || 'English';
        const isShort = durationMode === '30s';

        // 1. If local video is provided, extract STT speech and vision keyframes FIRST
        let localVideoData = null;
        if (videoBase64 && typeof videoBase64 === 'string') {
            try {
                localVideoData = await extractLocalVideoInfo(videoBase64, event);
            } catch (vidErr) {
                console.warn(`[Studio] Local video extraction failed: ${vidErr.message}`);
                throw vidErr;
            }
        }

        // 2. If screenshot is provided, extract OCR and core rules
        let screenshotData = null;
        if (screenshotBase64 && typeof screenshotBase64 === 'string') {
            try {
                screenshotData = await extractScreenshotInfo(screenshotBase64, event);
            } catch (shotErr) {
                console.warn(`[Studio] Screenshot OCR extraction failed: ${shotErr.message}`);
                throw shotErr;
            }
        }

        // 3. If reference URL is provided, parse it
        let refData = null;
        if (referenceUrl && typeof referenceUrl === 'string' && referenceUrl.trim().startsWith('http')) {
            try {
                refData = await extractReferenceVideoInfo(referenceUrl, event);
            } catch (refErr) {
                console.warn(`[Studio] Reference extraction failed: ${refErr.message}`);
                throw refErr;
            }
        }

        // 3.5 Auto-extract ALL lifehacks from transcript / video summary (health mode only)
        // Takes lifehack #1 for this generation, queues the rest automatically
        let autoQueuedCount = 0;
        const rawTranscriptForQueue = (refData && refData.transcript) || (localVideoData && localVideoData.combinedSummary) || null;
        if (mode === 'health' && rawTranscriptForQueue) {
            try {
                if (event && event.sender) {
                    event.sender.send('studio-progress', { status: '🔍 Нахожу все лайфхаки в видео...', progress: 50 });
                }
                const extracted = await lhExtract({
                    videoTranscript: rawTranscriptForQueue,
                    sourceLabel: referenceUrl || (localVideoData ? 'uploaded video' : 'reference video'),
                    language,
                    provider
                });
                if (extracted && extracted.added > 0) {
                    const firstItem = lhGetNext(); // First pending in queue
                    if (firstItem) {
                        lhMarkUsed(firstItem.id);           // Mark it used (for this generation)
                        topic = firstItem.topicForLlm;      // Override topic for script generation
                        autoQueuedCount = lhGetStats().pending; // Remaining items in queue
                        console.log(`[Studio] Auto-queue: found ${extracted.added} lifehacks, generating "${firstItem.title}", ${autoQueuedCount} queued for later`);
                        if (event && event.sender) {
                            event.sender.send('studio-progress', {
                                status: `✅ Найдено ${extracted.added} лайфхаков! Снимаю первый, ещё ${autoQueuedCount} — в очереди...`,
                                progress: 60
                            });
                        }
                    }
                }
            } catch (queueErr) {
                console.warn('[Studio] Auto-queue extraction failed (using original topic):', queueErr.message);
            }
        }

        // 4. Resolve Amazon product if passed explicitly or embedded in topic
        let effectiveAmazonProduct = amazonProduct || null;
        if (!effectiveAmazonProduct && topic && typeof topic === 'string') {
            const codeMatch = topic.match(/#(\d+)|code\s*:?\s*#?(\d+)/i);
            if (codeMatch) {
                const codeNum = parseInt(codeMatch[1] || codeMatch[2], 10);
                effectiveAmazonProduct = amazonManager.getByCode(codeNum);
            }
        }

        // Determine actual lifehack topic for Amazon sourcing (NOT generic placeholders!)
        let sourcingTopic = '';
        if (topic && topic !== 'Video Demonstration Reference' && topic !== 'Screenshot Rules Reference') {
            sourcingTopic = topic;
        } else if (localVideoData && localVideoData.combinedSummary) {
            sourcingTopic = localVideoData.combinedSummary;
        } else if (screenshotData && screenshotData.text) {
            sourcingTopic = screenshotData.text;
        } else if (refData && refData.transcript) {
            sourcingTopic = refData.transcript;
        }

        // Autonomous Amazon Product Sourcing (Reverse Sourcing Engine)
        if (!effectiveAmazonProduct && autoSourceAmazon && sourcingTopic && sourcingTopic.trim().length > 5 && mode === 'health') {
            try {
                if (event && event.sender) {
                    event.sender.send('studio-progress', { status: '🔍 ИИ анализирует тему лайфхака и ищет усиливающий товар на Amazon.fr...', progress: 65 });
                }
                const sourced = await amazonSourcing.sourceProductForLifehack(sourcingTopic.slice(0, 500), { provider, projectFolder }, (p) => {
                    if (event && event.sender) event.sender.send('studio-progress', p);
                });
                if (sourced && sourced.product) {
                    effectiveAmazonProduct = sourced.product;
                    console.log(`[Studio] Auto-sourced Amazon product #${effectiveAmazonProduct.code}: "${effectiveAmazonProduct.title}"`);
                }
            } catch (sourceErr) {
                console.warn('[Studio] Auto-sourcing failed (generating script with pure lifehack):', sourceErr.message);
            }
        }

        if (event && event.sender) {
            event.sender.send('studio-progress', { status: mode === 'psychology' ? '✍️ ИИ пишет сценарий для Психолога, видавшего жизнь...' : '✍️ ИИ пишет сценарий вирусных лайфхаков для Génie — молодого учёного-изобретателя...', progress: 70 });
        }

        let systemInstruction = "";
        let userPrompt = "";

        const CHARACTER_BIBLE_GENIE = `"Génie — an adult woman scientist in her late 20s, Pixar 3D animation style. Appearance: round circular glasses, warm olive skin, dark wavy hair pulled back loosely, white lab coat over a colorful top. Expression: clever, enthusiastic, bright-eyed inventor energy. The image in reference_images shows her exact face and design — match it precisely."`;

        if (mode === 'psychology') {
            systemInstruction = `You are a Master Viral Scriptwriter specialized in raw, street-smart psychology and human behavior.
            You write scripts delivered by a blunt, weathered man who has seen every human mistake twice and has zero patience for sugarcoating.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. CHARACTER BIBLE (ALWAYS COPY-PASTE INTO PROMPTS):
               ${CHARACTER_BIBLE_PSYCHOLOGIST}
            5. THE CONCEPT: The narrator is "The Psychologist" — a street-smart, no-BS man in his late 50s who dishes out brutally honest psychological insights, human behavior truths, and real-life advice that nobody asked for but everyone needs to hear.
            6. TONE & VOICE:
               - Blunt, dry, direct. Speaks like he's had this conversation a hundred times and is mildly annoyed you still don't get it.
               - No motivational fluff. No "you can do it." Just raw, honest, slightly sardonic truth.
               - Uses second-person "you" to make it personal. Short punchy sentences.
            7. CONTENT — PSYCHOLOGY TOPICS:
               - Why people stay in toxic relationships. Why manipulation works. Red flags everyone ignores.
               - Self-sabotage patterns. Why people fear success. How social pressure controls behavior.
               - Reading people. Body language tells. What people say vs. what they mean.
               - Hard truths about human nature that feel uncomfortable but undeniably real.
            8. IMAGE STYLE (MOODY & CINEMATIC):
               - Every "imagePrompt" MUST start with Character Bible, followed by the specific moody location (urban alley, dimly lit bar, rooftop at dusk, dark office) and his confident body language.
               - Atmosphere: dramatic shadows, film-noir inspired lighting, real-world gritty environments.
               - IP SAFETY: No real people, no brand logos, no political symbols.
            9. CHARACTER ACTING (CRITICAL):
               - Deliberate, unhurried gestures. Pointed finger when making a key point. Arms crossed when judging. Shrug when stating the obvious.
               - Image-to-Video alignment: videoPrompt MUST start from the exact pose in imagePrompt.
            10. Each "line" must include an emotion tag: [blunt], [dry], [direct], [sardonic], [firm], [knowing], [impatient], [wry], [matter-of-fact].
            11. DIALOGUE LENGTH (8 SECONDS PER CLIP): 18-22 words per scene. Short sentences. No filler.

                ${isShort ? `
                📍 FAST 30-SECOND FORMAT (4-5 SCENES):
                - Scene 1 — THE UNCOMFORTABLE TRUTH (18-22 words): Blunt statement of a hard psychological reality.
                - Scene 2 — WHY IT HAPPENS (18-22 words): The real reason behind the behavior, no excuses.
                - Scene 3 — THE PATTERN YOU'RE NOT SEEING (18-22 words): What you keep doing wrong without realizing.
                - Scene 4 — THE HARD ADVICE (18-22 words): What to actually do about it — direct, no sugarcoating.
                - Scene 5 — THE CLOSING TRUTH (18-22 words): Final blunt takeaway that lands like a gut punch.
                ` : `
                📍 FULL 8-SCENE FORMAT:
                - Scene 1 — THE HOOK & HARD TRUTH (18-22 words)
                - Scene 2 — WHY PEOPLE DO THIS (18-22 words)
                - Scene 3 — THE SELF-DECEPTION (18-22 words)
                - Scene 4 — THE PATTERN (18-22 words)
                - Scene 5 — WHAT IT COSTS YOU (18-22 words)
                - Scene 6 — THE REAL SOLUTION (18-22 words)
                - Scene 7 — WHY MOST WON'T DO IT (18-22 words)
                - Scene 8 — THE FINAL VERDICT (18-22 words)
                `}`;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Psychology insight extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : topic));

            userPrompt = `Create a viral psychology short script with EXACTLY ${isShort ? '5' : '8'} scenes for: "${effectiveTopic}".
            ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS — ADAPT THIS CONTENT FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${localVideoData.combinedSummary}\n"""\n` : ''}
            ${screenshotData ? `\nSCREENSHOT CONTENT — ADAPT THESE INSIGHTS FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${screenshotData.text}\n"""\n` : ''}
            ${refData ? `\nREFERENCE VIDEO TRANSCRIPT — ADAPT THIS FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${refData.transcript}\n"""\n` : ''}
            The narrator is "The Psychologist" — a blunt, weathered man in his late 50s delivering uncomfortable truths about human behavior with the calm authority of someone who has seen it all.

            DIALOGUE: 18-22 words per scene. Blunt. Direct. Second-person "you". No fluff.

            Rotate Variants (A, B, C, D) for each scene. VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=stable mid-shot, D=gentle dolly.

            Output JSON:
            {
              "intro": "[VIRAL TITLE — provocative, direct]",
              "socialPost": {
                "title": "Title with emoji",
                "description": "Engaging description for tiktok/reels",
                "hashtags": "#tag1 #tag2 #tag3"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "The Psychologist",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "A",
                  "videoVariant": "A",
                  "imagePrompt": "(In English) [PASTE CHARACTER BIBLE HERE]. Describe the moody urban location, dramatic lighting, and his confident body posture.",
                  "videoPrompt": "(In English) High-end 3D CGI animation. Describe the animation starting from the exact pose in imagePrompt. Deliberate gestures: pointed finger, arms crossed, wry shrug. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        } else if (mode === 'health') {
            systemInstruction = `You are a Master Viral Hook Scriptwriter and world-class creator of viral lifehacks and clever everyday genius tricks.
            You write scripts that feel vibrant, delightfully clever, and hyper-viral — every line unpacks a genius everyday trick, household hack, time-saver, or mind-blowing daily solution.

            ${TIKTOK_SAFETY_DIRECTIVE}

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line]. NO TRUNCATION. NO '...'.
            4. CHARACTER APPEARANCE — USE TEXT DESCRIPTION (CRITICAL FOR GOOGLE FLOW MODELS):
               - Always start the imagePrompt with the CHARACTER BIBLE exactly as written below — include her physical description, because the image model uses the text as the primary character spec:
               - CHARACTER BIBLE: ${CHARACTER_BIBLE_GENIE}
               - After the CHARACTER BIBLE, describe: her action, gesture, facial expression, and the scene environment.
               - The reference image in reference_images is provided as a secondary style hint, but the TEXT description is the primary anchor for character consistency.
            5. THE CONCEPT: The narrator delivers transformative, brilliant lifehacks, household shortcuts, smart cleaning/organizing secrets, and everyday wisdom directly to the viewer with charisma and confident authority.
            6. CLEVER LIFEHACK & PRACTICAL EXPERTISE:
               - She addresses everyday frustrations: stubborn stains, cable mess, bad smells, kitchen struggles, wasted money, inefficient routines.
               - She reveals simple, accessible solutions using common household items with wit, excitement, and clear logic.
            7. IMAGE STYLE, ENVIRONMENT VARIETY & COHERENCE:
               - Every "imagePrompt" MUST start with: ${CHARACTER_BIBLE_GENIE}, followed by the specific location and her physical action.
               - **SMART LOCATION SELECTION (match location to lifehack topic)**:
                 * 🏠 INDOOR — kitchen hack, cleaning, organizing, cooking, stain removal → cozy modern kitchen, pantry shelves, bright laundry room, living room, organized closet
                 * 🔬 LAB / WORKSHOP — chemistry trick, science hack, DIY gadget → inventor's workshop with workbenches, craft desk, home lab with Edison bulbs
                 * 🌿 OUTDOOR / GARDEN — gardening, plants, soil, watering, pest control, outdoor cleaning, yard maintenance → sunlit garden with green plants behind her, vegetable patch, greenhouse, flower bed, sunny backyard patio, outdoor terrace
                 * 🛒 LIFESTYLE / MARKET — money-saving, shopping trick, food storage → outdoor farmer's market, open-air terrace, balcony garden
                 * 💻 DESK / STUDY — productivity, organization, digital hacks → colorful study desk, home office nook
               - **Visual Environment Variety**: Rotate environments across scenes based on the lifehack topic to maintain high visual retention.
               - **Character Consistency**: Do NOT describe clothes or features; reference image guarantees consistency.
               - **IP SAFETY (CRITICAL)**: NEVER use political symbols, military uniforms, real brand logos, celebrity likenesses, or any copyrighted imagery in imagePrompt or videoPrompt. Use only neutral, everyday objects and environments.
               - **CHARACTER SCALE & GROUND POSITION (CRITICAL — PREVENTS MINIATURIZATION)**:
                 * Standard shots: The character ALWAYS stands at FULL HUMAN HEIGHT on the floor, ground, or grass — she is NEVER placed on, inside, or alongside objects at the same scale (which makes her look tiny). Props, lab items, food, or household objects are either: (a) held in her hand, OR (b) placed on a counter/table/shelf/ground clearly behind her.
                 * Macro Inspection Shots (Variant E in Scene 1 or Scene 2): If the scene highlights the disaster/problem, use a cinematic inspection composition: The physical problem itself is in the SHARP FOREGROUND MACRO FOCUS, while the character leans in right behind it at natural human height, closely examining it with dramatic analytical expressions.
            8. CHARACTER ACTING & MOTION COHERENCE (CRITICAL FOR IMAGE-TO-VIDEO):
               - **Image-to-Video Animation Alignment**: The videoPrompt MUST animate the exact starting pose and environment described in imagePrompt. DO NOT introduce motions that contradict the image.
               - **Gestures & Presence**: Describe energetic, expressive gestures (e.g., pointing up with eureka excitement, proudly holding up household items or gadgets, nodding with knowing satisfaction).
               - **Hook Variety (Scene 1)**: Start with a powerful eye-to-eye address, leaning into the camera with an intriguing, mind-blowing lifehack revelation.
               - **VISUAL PROBLEM EMPHASIS (MANDATORY IN SCENE 1 OR SCENE 2)**:
                 * At least ONE of the first two scenes (Scene 1 or Scene 2) MUST feature a clear visual depiction of the real problem relevant to the topic (e.g. if skincare/pores: show visible dullness or enlarged pores; if cleaning: show the dark stain on fabric; if gardening: show the damaged plant). DO NOT show random unrelated bugs or dirt! The viewer MUST visually see the exact pain point immediately!
            9. Each "line" must include an emotion tag: [excited], [knowing], [proudly], [whispering], [curious], [direct], [encouraging], [playful], etc.
            10. 🎬 DRAMATIC ARC & DIALOGUE LENGTH (8 SECONDS PER CLIP):
                Each video clip is 8 seconds. Dialogue should naturally fill the 8 seconds with smooth, lively speech (recommended: 18-22 words per scene, avoiding empty pauses).

                ${isShort ? `
                📍 DURATION MODE: FAST 30-SECOND TIKTOK SHORT (EXACTLY 4-5 SCENES):
                - Scene 1 — THE HOOK & EVERYDAY PAIN POINT (18-22 words): Call out a frustrating daily mistake or common problem.
                - Scene 2 — THE WHY & THE SECRET (18-22 words): Why standard ways fail and the unexpected smart principle behind it.
                - Scene 3 — THE GENIUS LIFEHACK REVELATION (18-22 words): The exact step-by-step trick to solve it effortlessly.
                - Scene 4 — THE PRO TIP / RESULT (18-22 words): The immediate magical result and bonus convenience.
                - Scene 5 — THE MIC-DROP & CTA (18-22 words): Final witty takeaway + natural call to follow/save for more secrets.
                ` : `
                📍 DURATION MODE: FULL 8-SCENE FORMAT (EXACTLY 8 SCENES):
                - Scene 1 — HOOK & PROBLEM (18-22 words): High-energy opening calling out a common everyday struggle.
                - Scene 2 — THE COMMON MISTAKE (18-22 words): What almost everyone does wrong.
                - Scene 3 — STEP 1: PREPARATION (18-22 words): The simple item you need that everyone has at home.
                - Scene 4 — STEP 2: THE GENIUS TRICK (18-22 words): The secret method in action.
                - Scene 5 — THE MAGIC RESULT (18-22 words): Seeing the instant transformation/fix.
                - Scene 6 — EXTRA PRO TIP (18-22 words): A bonus nuance to make it last longer.
                - Scene 7 — TIME & MONEY SAVED (18-22 words): Why you'll never do it the old way again.
                - Scene 8 — CLOSING & CTA (18-22 words): Final clever punchline + subscribe for more smart hacks.
                `}

            11. DENSE CONTENT & CHARISMATIC WISDOM:
                 * NO filler words, NO non-verbal laughs or sound pauses.
                 * Natural dialogue pacing: aim for 18-22 words per scene to keep the viewer engaged throughout the whole 8 seconds.
                 * Génie speaks directly to the viewer with enthusiastic charisma, clarity, and contagious confidence.

            12. EMOTIONAL PENDULUM (RETENTION TECHNIQUE — MANDATORY):
                 Alternate scenes between TENSION phrases and RELIEF phrases to maximize viewer retention.
                 TENSION phrases (raise curiosity/suspense) — use in odd scenes:
                   "Но не всё так просто...", "Внимательные зрители могут заметить...", "И при всём при этом...",
                   "Обратите особое внимание на...", "И это ещё не всё...", "Но будьте готовы к тому, что...",
                   "Почему же?", "Наоборот...", "Согласитесь, что...", "А что делать если?"
                 RELIEF phrases (resolve tension, give hope) — use in even scenes:
                   "Не стоит отчаиваться!", "Как всегда, есть и хорошие новости!", "Решив этот вопрос, вы сможете...",
                   "Эта проблема легко решается.", "К нашей радости...", "Очевидно, что...",
                   "Конечно, есть и светлая сторона!", "Как же выйти из этой ситуации?", "А вот сейчас самое важное!"
                 RULE: Each scene's "line" must naturally embed one such phrase or its equivalent in ${langName}.
            ${effectiveAmazonProduct ? `
            13. 🛒 MANDATORY OUTRO & CTA FOR AMAZON SHOWCASE PRODUCT #${effectiveAmazonProduct.code} ("${effectiveAmazonProduct.title}"):
                 - The FINAL SCENE (Scene ${isShort ? '5' : '8'}) is the Outro.
                 - Génie MUST deliver a clear, friendly, step-by-step call to action that ANY viewer of any age can follow WITHOUT confusion.
                 - MANDATORY SKELETON — generate the line using exactly these 3 parts in ${langName}, in this order:
                   PART 1 [bio link]:   Imperative verb → tell the viewer to click/open the link in your profile/bio.
                   PART 2 [code + OK]:  Imperative verb → enter number ${effectiveAmazonProduct.code} on the keypad AND press OK (both in one clause, never separated).
                   PART 3 [Amazon]:     Result → they arrive on Amazon to order/buy the product.
                 - In ${langName} (especially French for @bertranna), all 3 parts MUST be present, explicit, and simple enough for any viewer of any age.
                   ✅ GOOD: "Clique sur le lien en bio ! Entre le ${effectiveAmazonProduct.code} sur le clavier et appuie sur OK — tu arrives sur Amazon pour commander !"
                   ✅ GOOD: "Va sur le lien dans mon profil, tape le ${effectiveAmazonProduct.code} sur le clavier, appuie sur OK et commande-le direct sur Amazon !"
                   ❌ FORBIDDEN: "sur le site" or "sur mon labo" instead of "sur le clavier" — the word "clavier" MUST appear explicitly.
                   ❌ FORBIDDEN: splitting PART 2 across two sentences (enter code in one sentence, OK in another).
                 - Dialogue length: STRICTLY 18-22 words, natural conversational pace filling the 8-second video clip.
                 - Example French Outro line: "${amazonManager.getRandomCta(effectiveAmazonProduct.code)}"
            14. 🎯 STRICT 50/50 NARRATIVE FORMULA (MANDATORY WHEN AN AMAZON PRODUCT IS PRESENT):
                 - 🛑 BLOCK 1: SCENES 1 TO 4 — 100% PURE LIFEHACK (ABSOLUTELY ZERO PRODUCT MENTION!):
                   * Scenes 1, 2, 3, and 4 MUST focus EXCLUSIVELY on the lifehack itself: the common daily struggle, the mistake people make, the exact concrete DIY recipe / ingredients / method / biological principle, and how the reaction/trick works in real time.
                   * STRICT RESTRICTION: There must be ABSOLUTELY NO MENTION of any commercial product, Amazon, gadgets, or tools in Scenes 1 to 4! The viewer must receive 100% genuine, viral, generous expert value from Bertranna.
                 - 🚀 BLOCK 2: SCENES 5 TO 7 — THE PIVOT: "TO EASE YOUR EFFORTS, I RECOMMEND..."
                   * Scene 5 is THE TURNING POINT: The DIY trick works, but doing the physical scrubbing/watching by hand is exhausting. Bertranna pivots with empathy: "Pour vous épargner cet effort et vous faciliter la vie, je vous recommande d'utiliser..." and introduces the Amazon tool (${effectiveAmazonProduct.title}).
                   * Scene 6 explains why this tool solves the manual exhaustion (ergonomics, high speed, telescopic handle, convenience).
                   * Scene 7 highlights the triumphant synergy: the smart lifehack + this physical tool = flawless result in minutes without back pain or fatigue.
                 - 🏁 BLOCK 3: SCENE 8 — OUTRO CTA: Génie guides the viewer through 3 simple steps: (1) click the link in bio → (2) type number #${effectiveAmazonProduct.code} on the site → (3) arrive directly on Amazon to purchase.` : ''}`;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Lifehack Rules/Tricks extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : topic));

            const amazonProductContext = effectiveAmazonProduct ? `
🛒 TARGET AMAZON SHOWCASE PRODUCT #${effectiveAmazonProduct.code}:
- Title: "${effectiveAmazonProduct.title}" (Catégorie: ${effectiveAmazonProduct.category})
- Everyday Problem: ${effectiveAmazonProduct.quote}
- Clever Method / Lifehack: ${effectiveAmazonProduct.hackMethod || effectiveAmazonProduct.verdict}
- Scientific Principle: ${effectiveAmazonProduct.verdict}
- Key Highlights: ${Array.isArray(effectiveAmazonProduct.features) ? effectiveAmazonProduct.features.join('; ') : ''}
- Role of the Product: Smart physical amplifier introduced in Scene 5 to ease manual effort (ABSOLUTELY ZERO MENTION in Scenes 1-4!).
- MANDATORY OUTRO REQUIREMENT: Scene ${isShort ? '5' : '8'} MUST guide the viewer through 3 clear steps in ${langName}: (1) click the link in bio → (2) type the number ${effectiveAmazonProduct.code} on the website → (3) you arrive directly on Amazon to purchase the product.\n` : '';

            userPrompt = `Create a viral short LIFEHACK & SMART TIPS script with EXACTLY ${isShort ? '5' : '8'} scenes for: "${effectiveTopic}".
                        ${amazonProductContext}
                        ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS (SPEECH & VISUAL DEMONSTRATION) — ADAPT THIS EXACT LIFEHACK, DEMO AND TRICK FOR THE INVENTOR IN ${langName.toUpperCase()}:\n""" \n${localVideoData.combinedSummary}\n"""\n` : ''}
                        ${screenshotData ? `\nSCREENSHOT CONTENT (OCR & RULES) — ADAPT THESE EXACT LIFEHACKS, RULES, OR TIPS FOR THE INVENTOR IN ${langName.toUpperCase()}:\n""" \n${screenshotData.text}\n"""\n` : ''}
                        ${refData ? `\nREFERENCE VIDEO TRANSCRIPT (ADAPT THIS EXACT STORY, HOOKS, LIFEHACKS AND CONCLUSION FOR THE INVENTOR IN ${langName.toUpperCase()}):\n""" \n${refData.transcript}\n"""\n` : ''}
                        The narrator is a brilliant adult woman inventor and scientist in her late twenties, wearing round glasses and a lab coat, delivering mind-blowing everyday lifehacks and practical secrets.

            DIALOGUE LENGTH GUIDELINES (NATURAL 18-22 WORDS PER SCENE):
            ${effectiveAmazonProduct ? `
            📍 50/50 LIFEHACK-FIRST FORMAT (EXACTLY ${isShort ? '5' : '8'} SCENES):
            ${isShort ? `
            - Scene 1 (HOOK & PAIN — 18-22 words): The daily struggle. ZERO product mention!
            - Scene 2 (CONCRETE DIY TRICK — 18-22 words): Specific recipe/ingredients/method. ZERO product mention!
            - Scene 3 (THE PIVOT: TO EASE YOUR EFFORTS — 18-22 words): "Pour vous épargner cet effort, je vous recommande..." (introducing ${effectiveAmazonProduct.title}).
            - Scene 4 (RESULT & RELIEF — 18-22 words): Flawless result without fatigue.
            - Scene 5 (OUTRO CTA — 18-22 words): 3 clear steps — (1) click link in bio, (2) type number ${effectiveAmazonProduct.code} on the site, (3) arrive on Amazon to buy!
            ` : `
            - Scene 1 (HOOK & EVERYDAY PAIN — 18-22 words): Sharp callout of everyday pain/frustration. ZERO product mention!
            - Scene 2 (THE MISTAKE / WRONG WAY — 18-22 words): Why ordinary ways fail, waste money or damage health/materials. ZERO product mention!
            - Scene 3 (CONCRETE DIY INGREDIENTS / METHOD — 18-22 words): The exact, concrete ingredients, recipe, or physical setup (name specific items/proportions). ZERO product mention!
            - Scene 4 (THE LIFEHACK IN ACTION — 18-22 words): The scientific/practical reaction working in real time. 100% pure lifehack demonstration. ZERO product mention!
            - Scene 5 (THE PIVOT: "TO EASE YOUR EFFORTS..." — 18-22 words): Turning point! The hack works, but doing it manually is exhausting. Bertranna introduces the Amazon tool: "Pour vous épargner cet effort et vous faciliter la vie, je vous recommande..." (introducing ${effectiveAmazonProduct.title}).
            - Scene 6 (ERGONOMICS & HOW THE TOOL AMPLIFIES THE HACK — 18-22 words): Specific features solving manual fatigue (telescopic handle, high-speed motor, self-adhesive strip, etc.).
            - Scene 7 (TRIUMPHANT SYNERGY — 18-22 words): The combined victory: cheap clever trick + smart tool = perfect result in minutes with zero back pain or tiredness!
            - Scene 8 (OUTRO CTA — 18-22 words): 3 clear steps — (1) click link in bio, (2) type number ${effectiveAmazonProduct.code} on the site, (3) arrive on Amazon to buy!
            `}
            ` : `
            ${isShort ? `
            - Scene 1 (HOOK & PROBLEM): 18-22 words.
            - Scene 2 (THE WHY): 18-22 words.
            - Scene 3 (THE GENIUS HACK): 18-22 words.
            - Scene 4 (PRO TIP & RESULT): 18-22 words.
            - Scene 5 (MIC-DROP & CTA): 18-22 words.
            ` : `
            - Scene 1 (HOOK & PROBLEM): 18-22 words.
            - Scene 2 (THE COMMON MISTAKE): 18-22 words.
            - Scene 3 (STEP 1: PREPARATION): 18-22 words.
            - Scene 4 (STEP 2: THE GENIUS TRICK): 18-22 words.
            - Scene 5 (THE MAGIC RESULT): 18-22 words.
            - Scene 6 (EXTRA PRO TIP): 18-22 words.
            - Scene 7 (TIME & MONEY SAVED): 18-22 words.
            - Scene 8 (CLOSING & CTA): 18-22 words.
            `}
            `}

            Rotate Variants (A, B, C, D, E, F, G, H) for each scene. Prefer F, G, H for climax/reveal/result scenes (Scenes 5-8) for cinematic impact. VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=stable demonstration, D=gentle dolly, E=macro rack-focus (problem reveal), F=crash zoom for impact, G=90° orbit arc (triumphant result), H=parallax lateral slide (editorial).
            IMPORTANT: For Scene 1 or Scene 2, actively use imageVariant "E" and videoVariant "E" to highlight the physical problem, pests, or stains up-close!

            Output JSON:
            {
              "intro": "Viral Title",
              "socialPost": {
                "title": "Title with emoji",
                "description": "Engaging, curiosity-driven description for tiktok/reels — frame as clever trick or genius shortcut, NOT health/medical advice",
                "hashtags": "SAFE hashtags only: #lifehack #geniustrick #everydaytips #homehacks #smartliving #diytrick #kitchenhacks #organizationtips #productivityhack #smartideas — NEVER use: #health #wellness #diet #fitness #weightloss #mentalhealth #medical"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "The Inventor",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "E",
                  "videoVariant": "E",
                  "imagePrompt": "(In English) [PASTE CHARACTER BIBLE HERE]. In the sharp foreground macro focus: vivid physical problem (e.g. slimy garden slugs chewing leaves, cracked textures, or dark stubborn fabric stains). In soft bokeh behind it, Génie leans in at adult height inspecting it with shock/intrigue. Describe the detailed scene.",
                  "videoPrompt": "(In English) High-end 3D CGI animation. Describe the animation starting from the exact pose in imagePrompt. Slow rack-focus from foreground problem to Génie pointing and addressing the camera. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        } else {
            systemInstruction = `You are a Master Viral Hook Scriptwriter specialized in lifehacks, smart household secrets & daily productivity.
            You write scripts that feel alive — every line has energy, practical ingenuity, personality, and purpose.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST include the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. CHARACTER APPEARANCE (STRICTLY FROM REFERENCE IMAGE):
               - NEVER describe the character's facial features, age, body, hairstyle, or clothing in imagePrompt.
               - Her entire visual appearance is determined 100% by the provided reference image.
               - Simply refer to her as "The character from the reference image".
               - Focus imagePrompt strictly on: her action, gesture, facial expression, and the scene environment.
            5. THE CONCEPT: The narrator explains practical lifehacks and clever household tricks with irresistible energy and charm.
            6. PRACTICAL CLEVERNESS:
               - She sees through everyday household struggles, clutter, kitchen issues, and daily inefficiencies.
            7. IMAGE STYLE, ENVIRONMENT VARIETY & COHERENCE:
               - Every "imagePrompt" MUST start with: "The character from the reference image, Pixar 3D animation style, cinematic 9:16 vertical framing", followed by the specific location and the physical interaction.
               - **SMART LOCATION SELECTION (match location to lifehack topic)**:
                 * 🏠 INDOOR — kitchen hacks, cleaning, organizing, cooking → modern kitchen, pantry, living room, organized closet
                 * 🔬 LAB / WORKSHOP — DIY, science tricks → inventor's workshop, craft desk
                 * 🌿 OUTDOOR / GARDEN — gardening, plants, soil, yard maintenance → sunlit garden, veggie patch, greenhouse, sunny backyard patio, outdoor terrace
                 * 💻 DESK / STUDY — productivity, digital hacks → study desk, home office
               - **Visual Environment Variety**: Vary the background micro-environments across scenes based on the story topic.
               - **Character Consistency**: Do NOT describe clothes or features; reference image guarantees consistency.
               - **IP SAFETY (CRITICAL)**: NEVER use political symbols, military uniforms, real brand logos, celebrity likenesses, or any copyrighted imagery in imagePrompt or videoPrompt. Use only neutral, everyday objects and environments.
               - **CHARACTER SCALE & GROUND POSITION (CRITICAL — PREVENTS MINIATURIZATION)**: The character ALWAYS stands at FULL HUMAN HEIGHT on the floor, ground, or grass. She is NEVER placed on, inside, or at the same horizontal level as table/counter objects (which makes her look tiny). Props and items are either held in her hand OR clearly positioned on a surface that is in the background. She dominates the vertical frame as a full-size person.
            8. **STRICT BACKGROUND/HABITAT RULE**: Place the scene in the logical, real-world environment that matches the lifehack topic — indoor OR outdoor as appropriate.
            9. CHARACTER ACTING & MOTION COHERENCE (CRITICAL FOR IMAGE-TO-VIDEO):
               - **Image-to-Video Animation Alignment**: The videoPrompt MUST animate the exact starting pose, outfit, and object described in imagePrompt.
               - **Object Physics & Continuity**: Explicitly describe actions clearly with confident, expressive gestures.
               - **Hook Variety (Scene 1)**: Randomly choose a dynamic opening style for Scene 1.
            10. Each "line" must include an emotion tag: [excited], [knowing], [proudly], [curious], [direct], [encouraging], etc.
            11. 🎬 DRAMATIC ARC & DIALOGUE LENGTH (8 SECONDS PER CLIP):
                Each video clip is 8 seconds. Dialogue should naturally fill the 8 seconds with smooth, lively speech (recommended: 18-22 words per scene, avoiding empty pauses).

                ${isShort ? `
                📍 DURATION MODE: FAST 30-SECOND TIKTOK SHORT (EXACTLY 4-5 SCENES):
                - Scene 1 — THE HOOK & INTRIGUE (18-22 words)
                - Scene 2 — THE PROBLEM & COMMON MISTAKE (18-22 words)
                - Scene 3 — THE REVELATION / LIFEHACK (18-22 words)
                - Scene 4 — THE PRACTICAL TIP (18-22 words)
                - Scene 5 — THE MIC-DROP & CTA (18-22 words)
                ` : `
                📍 DURATION MODE: FULL 8-SCENE FORMAT (EXACTLY 8 SCENES):
                - Scene 1 — HOOK & PROBLEM (18-22 words)
                - Scene 2 — THE COMMON MISTAKE (18-22 words)
                - Scene 3 — STEP 1: PREPARATION (18-22 words)
                - Scene 4 — STEP 2: THE GENIUS TRICK (18-22 words)
                - Scene 5 — THE MAGIC RESULT (18-22 words)
                - Scene 6 — EXTRA PRO TIP (18-22 words)
                - Scene 7 — TIME & MONEY SAVED (18-22 words)
                - Scene 8 — CLOSING & CTA (18-22 words)
                `}

            12. DENSE CONTENT & VIRAL STYLE:
                 * NO filler words, NO non-verbal laughs.
                 * Natural dialogue pacing: aim for 18-22 words per scene to keep the viewer engaged throughout the whole 8 seconds.
                 * Génie speaks directly to the viewer with a playful, self-assured, and brilliant inventor tone.`;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Rules/Lifehacks extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : topic));

            userPrompt = `Create a viral short LIFEHACK & PRACTICAL TRICKS script with EXACTLY ${isShort ? '5' : '8'} scenes for: "${effectiveTopic}".
                        ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS (SPEECH & VISUAL DEMONSTRATION) — ADAPT THIS EXACT LIFEHACK, DEMO AND TRICK FOR THE INVENTOR IN ${langName.toUpperCase()}:\n""" \n${localVideoData.combinedSummary}\n"""\n` : ''}
                        ${screenshotData ? `\nSCREENSHOT CONTENT (OCR & RULES) — ADAPT THESE EXACT RULES OR LIFEHACKS FOR THE INVENTOR IN ${langName.toUpperCase()}:\n""" \n${screenshotData.text}\n"""\n` : ''}
                        ${refData ? `\nREFERENCE VIDEO TRANSCRIPT (ADAPT THIS EXACT STORY, HOOKS, LIFEHACKS AND CONCLUSION FOR THE INVENTOR IN ${langName.toUpperCase()}):\n""" \n${refData.transcript}\n"""\n` : ''}
                        The narrator is a brilliant adult woman inventor and scientist in her late twenties who explains the lifehack with humor and sparkling ingenuity. Do not make the object talk.

            DIALOGUE LENGTH GUIDELINES (NATURAL 18-22 WORDS PER SCENE):
            ${isShort ? `
            - Scene 1 (HOOK & INTRIGUE): 18-22 words.
            - Scene 2 (PROBLEM & MISTAKE): 18-22 words.
            - Scene 3 (REVELATION): 18-22 words.
            - Scene 4 (PRACTICAL TIP): 18-22 words.
            - Scene 5 (MIC-DROP & CTA): 18-22 words.
            ` : `
            - Scene 1 (HOOK & PROBLEM): 18-22 words.
            - Scene 2 (THE COMMON MISTAKE): 18-22 words.
            - Scene 3 (STEP 1: PREPARATION): 18-22 words.
            - Scene 4 (STEP 2: THE GENIUS TRICK): 18-22 words.
            - Scene 5 (THE MAGIC RESULT): 18-22 words.
            - Scene 6 (EXTRA PRO TIP): 18-22 words.
            - Scene 7 (TIME & MONEY SAVED): 18-22 words.
            - Scene 8 (CLOSING & CTA): 18-22 words.
            `}

            Rotate Variants (A, B, C, D, E, F, G, H) for each scene. Prefer F, G, H for climax/result scenes (Scenes 5-8). VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=stable mid-shot, D=gentle dolly, E=macro rack-focus, F=crash zoom, G=orbit arc (triumph), H=parallax lateral slide.
            IMPORTANT: Use imageVariant "E" and videoVariant "E" for Scene 1 or Scene 2 to visually reveal the problem, pest, or damage in the foreground!

            Output JSON:
            {
              "intro": "Viral Title",
              "socialPost": {
                "title": "Title with emoji",
                "description": "Engaging description for tiktok/reels",
                "hashtags": "#tag1 #tag2 #tag3"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "The Inventor",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "E",
                  "videoVariant": "E",
                  "imagePrompt": "In English: [PASTE CHARACTER BIBLE HERE]. In sharp foreground: the physical problem or pest up-close. In background bokeh: Génie inspecting the disaster. Describe the environment.",
                  "videoPrompt": "In English: High-end 3D CGI animation. Describe the animation starting from the exact pose in imagePrompt. Animate rack focus from problem to character explaining. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        }

        const raw = await ai.chat([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
        ], true, provider);

        let scriptData = null;
        try {
            const parsed = cleanAndParseJSON(raw);
            scriptData = normalizeStudioScenes(parsed, topic, mode, langName);
        } catch (e) {
            console.warn('[Studio] Direct JSON parse failed, attempting fallback extraction:', e.message);
            try {
                scriptData = fallbackExtractScenes(raw, topic, mode, langName);
            } catch (err2) {
                console.error('[Studio] Failed to parse script response:', raw);
                throw new Error("AI failed to generate structural JSON script: " + err2.message);
            }
        }

        // Phonetics & style review — fix unnatural expressions per target language
        if (scriptData && scriptData.scenes && scriptData.scenes.length > 0) {
            try {
                const linesForReview = scriptData.scenes.map(s => ({ id: s.id, line: s.line }));
                const reviewSystemPrompt = `You are a senior phonetics and speech-style specialist for ${langName}, with deep expertise in spoken media and character voice consistency.

Your task: review short spoken dialogue lines delivered by a witty, self-assured, charismatic adult woman scientist (Génie) — and fix ONLY expressions that sound unnatural, awkward, or like a literal foreign translation for a native ${langName} speaker.

CHARACTER VOICE TO PRESERVE (NON-NEGOTIABLE):
- Playful, clever, charismatic, confident — an adult scientist who delivers brilliant discoveries with infectious enthusiasm.
- Short punchy sentences with sparkling energy and sharp intellect.
- Uses natural everyday vocabulary in ${langName} — no bureaucratic, clinical, or overly stiff phrasing.
- Keeps the "wow factor" — revelations feel exciting, tips feel like secrets being shared.
- Emotion tags like [excited], [playful], [knowing], [whispering] MUST be preserved exactly as-is.

Rules:
- Fix ONLY what sounds like a bad translation or an unnatural expression for a ${langName} native speaker.
- Do NOT flatten the character's personality into plain neutral adult speech.
- Do NOT change lines that already sound natural AND match the character voice.
- Preserve the original meaning and approximate word count (18-22 words).
${effectiveAmazonProduct ? `- CRITICAL: If a line contains product code #${effectiveAmazonProduct.code} or "numéro", you MUST strictly preserve the exact code #${effectiveAmazonProduct.code} and the bio CTA!\n` : ''}- Return ONLY a JSON array: [{"id": 1, "line": "corrected line"}, ...]
- No explanations, no markdown, only the JSON array.`;

                const reviewUserPrompt = `Target language: ${langName}
Dialogue lines to review:
${JSON.stringify(linesForReview, null, 2)}`;

                const reviewRaw = await ai.chat([
                    { role: 'system', content: reviewSystemPrompt },
                    { role: 'user', content: reviewUserPrompt }
                ], true, provider);

                const reviewParsed = cleanAndParseJSON(reviewRaw);
                if (Array.isArray(reviewParsed)) {
                    const reviewMap = {};
                    reviewParsed.forEach(r => { if (r.id && r.line) reviewMap[r.id] = r.line; });
                    scriptData.scenes = scriptData.scenes.map(s => ({
                        ...s,
                        line: reviewMap[s.id] || s.line
                    }));
                    console.log('[Studio] Phonetics review applied to', Object.keys(reviewMap).length, 'scenes');
                }
            } catch (reviewErr) {
                console.warn('[Studio] Phonetics review failed (using original lines):', reviewErr.message);
            }
        }

        if (projectFolder && scriptData) {
            saveStudioProjectPrompts(projectFolder, scriptData, mode, topic, langName, effectiveAmazonProduct);
        }

        return { ...scriptData, autoQueuedCount, amazonProduct: effectiveAmazonProduct };
    });

    ipcMain.handle('studio-save-script', async (event, { projectFolder, script, mode, topic, language }) => {
        if (!projectFolder || !script) {
            return { success: false, error: 'Missing projectFolder or script' };
        }
        const langName = LANG_NAMES[language] || language || 'English';
        saveStudioProjectPrompts(projectFolder, script, mode, topic, langName);
        return { success: true };
    });

    ipcMain.handle('studio-assemble-video', async (event, { useKaraoke, ideaTitle, language, projectFolder }) => {
        let studioDir = path.join(__dirname, 'SkeletonShorts');
        if (projectFolder) {
            studioDir = path.join(studioDir, projectFolder);
        }
        const finalDir = path.join(__dirname, 'FinalVideo');
        const audioDir = path.join(__dirname, 'Audio');
        const musicDir = path.join(__dirname, 'Music');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);
        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

        if (!fs.existsSync(studioDir)) throw new Error(`Project folder not found: ${studioDir}`);

        const files = fs.readdirSync(studioDir)
            .filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub'))
            .sort((a, b) => {
                const matchA = a.match(/scene_(\d+)/);
                const matchB = b.match(/scene_(\d+)/);
                const numA = matchA ? parseInt(matchA[1]) : 0;
                const numB = matchB ? parseInt(matchB[1]) : 0;
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

            let safeTitle = ideaTitle ? ideaTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() : 'studio_final';
            if (!safeTitle) safeTitle = 'studio_final';
            const outputPath = path.join(finalDir, `${safeTitle}_${Date.now()}.mp4`);
            fs.renameSync(concatPath, outputPath);
            cleanTempDir(tempDir);

            return `media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

        } catch (e) {
            cleanTempDir(tempDir);
            throw e;
        }
    });

    // ── Video Covers / Thumbnails Generation (100K_PromptGuide formula) ────────
    ipcMain.handle('studio-generate-covers', async (event, { projectFolder, topic, amazonProduct, script, imageModel }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir, { recursive: true });
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

            // Resolve effective Amazon product
            let effectiveAmazonProduct = amazonProduct || null;
            if (!effectiveAmazonProduct && projectFolder) {
                try {
                    const metaPath = path.join(targetProjectDir, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                    }
                } catch (_) {}
            }
            if (!effectiveAmazonProduct && typeof topic === 'string') {
                const match = topic.match(/#(\d+)/);
                if (match) effectiveAmazonProduct = amazonManager.getByCode(match[1]);
            }

            const coverTemplates = buildCoverPromptsFromGuide({ topic, amazonProduct: effectiveAmazonProduct, script });
            const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';

            // Reference image 1: Génie (Face & character consistency)
            const referenceImages = [];
            const getRefImg = () => {
                const candidates = [
                    { p: path.join(__dirname, 'genie_reference.png'), mime: 'image/png' },
                    { p: path.join(__dirname, 'genie_reference.jpg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.jpeg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.webp'), mime: 'image/webp' }
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c.p)) {
                        try {
                            const buf = Buffer.alloc(16);
                            const fd = fs.openSync(c.p, 'r');
                            fs.readSync(fd, buf, 0, 16, 0);
                            fs.closeSync(fd);
                            let detectedMime = c.mime;
                            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) detectedMime = 'image/png';
                            else if (buf[0] === 0xFF && buf[1] === 0xD8) detectedMime = 'image/jpeg';
                            else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') detectedMime = 'image/webp';
                            return { path: c.p, mime: detectedMime };
                        } catch (_) {
                            return { path: c.p, mime: c.mime };
                        }
                    }
                }
                return null;
            };

            const refInfo = getRefImg();
            if (refInfo) {
                referenceImages.push({ data: `data:${refInfo.mime};base64,${fs.readFileSync(refInfo.path).toString('base64')}` });
                console.log(`[Studio Covers] Injected Génie reference image from ${refInfo.path} (${refInfo.mime})`);
            }

            // Reference image 2: Exact physical Amazon product (Brush, Cleaner, Tape, Aloe, etc.)
            if (effectiveAmazonProduct) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Studio Covers] Injected Amazon product reference #${effectiveAmazonProduct.code} (${effectiveAmazonProduct.title}) into covers generation`);
                    }
                } catch (prodErr) {
                    console.warn(`[Studio Covers] Could not load product image reference:`, prodErr.message);
                }
            }

            console.log(`[Studio Covers] Generating 4 thumbnails for project "${projectFolder}" using model ${cleanModel} (references: ${referenceImages.length})...`);
            const generatedCovers = [];

            for (let i = 0; i < coverTemplates.length; i++) {
                const item = coverTemplates[i];
                event.sender.send('studio-covers-progress', {
                    coverIndex: i,
                    total: coverTemplates.length,
                    status: 'generating',
                    styleTitle: item.styleTitle
                });

                try {
                    const savedPaths = await ai.generateImage({
                        prompt: item.prompt,
                        model: cleanModel,
                        count: 1,
                        sectionDir: skeletonDir,
                        subFolder: projectFolder ? path.join(projectFolder, 'covers') : 'covers',
                        sceneIndex: 100 + i,
                        referenceImages: referenceImages,
                        onProgress: (p) => {
                            event.sender.send('studio-covers-progress', { coverIndex: i, total: coverTemplates.length, status: p.status, attempt: p.attempt });
                        }
                    });

                    if (savedPaths && savedPaths.length > 0 && fs.existsSync(savedPaths[0])) {
                        const targetCoverFile = path.join(coversDir, `cover_${i + 1}.jpg`);
                        fs.copyFileSync(savedPaths[0], targetCoverFile);
                        const imgBuffer = fs.readFileSync(targetCoverFile);
                        const base64Data = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

                        generatedCovers.push({
                            ...item,
                            imageUrl: base64Data,
                            fileName: `cover_${i + 1}.jpg`,
                            isSelected: i === 0
                        });

                        // Set first generated cover as initial default cover.jpg in project folder
                        if (i === 0) {
                            try {
                                fs.copyFileSync(targetCoverFile, path.join(targetProjectDir, 'cover.jpg'));
                            } catch (_) {}
                        }
                    } else {
                        generatedCovers.push({
                            ...item,
                            imageUrl: '',
                            fileName: `cover_${i + 1}.jpg`,
                            isSelected: false,
                            error: 'Failed to generate image'
                        });
                    }
                } catch (imgErr) {
                    console.error(`[Studio Covers] Failed cover #${i + 1}:`, imgErr.message);
                    generatedCovers.push({
                        ...item,
                        imageUrl: '',
                        fileName: `cover_${i + 1}.jpg`,
                        isSelected: false,
                        error: imgErr.message
                    });
                }
            }

            // Save covers metadata to covers.json
            const coversMetaPath = path.join(coversDir, 'covers.json');
            fs.writeFileSync(coversMetaPath, JSON.stringify({
                updatedAt: new Date().toISOString(),
                selectedCoverIndex: 0,
                covers: generatedCovers.map(c => ({
                    id: c.id,
                    styleId: c.styleId,
                    styleTitle: c.styleTitle,
                    badge: c.badge,
                    description: c.description,
                    prompt: c.prompt,
                    fileName: c.fileName,
                    isSelected: c.isSelected
                }))
            }, null, 2));

            event.sender.send('studio-covers-progress', { status: 'completed', total: 4 });
            return generatedCovers;
        } catch (e) {
            console.error('[Studio Covers] Error generating covers:', e);
            throw e;
        }
    });

    ipcMain.handle('studio-regenerate-single-cover', async (event, { projectFolder, coverIndex, prompt, imageModel, amazonProduct }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

            const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';
            const referenceImages = [];
            const getRefImg = () => {
                const candidates = [
                    { p: path.join(__dirname, 'genie_reference.png'), mime: 'image/png' },
                    { p: path.join(__dirname, 'genie_reference.jpg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.jpeg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.webp'), mime: 'image/webp' }
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c.p)) {
                        try {
                            const buf = Buffer.alloc(16);
                            const fd = fs.openSync(c.p, 'r');
                            fs.readSync(fd, buf, 0, 16, 0);
                            fs.closeSync(fd);
                            let detectedMime = c.mime;
                            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) detectedMime = 'image/png';
                            else if (buf[0] === 0xFF && buf[1] === 0xD8) detectedMime = 'image/jpeg';
                            else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') detectedMime = 'image/webp';
                            return { path: c.p, mime: detectedMime };
                        } catch (_) {
                            return { path: c.p, mime: c.mime };
                        }
                    }
                }
                return null;
            };

            const refInfo = getRefImg();
            if (refInfo) {
                referenceImages.push({ data: `data:${refInfo.mime};base64,${fs.readFileSync(refInfo.path).toString('base64')}` });
                console.log(`[Studio Covers] Injected Génie reference image into single cover from ${refInfo.path} (${refInfo.mime})`);
            }

            // Reference image 2: Exact physical Amazon product
            let effectiveAmazonProduct = amazonProduct || null;
            if (!effectiveAmazonProduct && projectFolder) {
                try {
                    const metaPath = path.join(targetProjectDir, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                    }
                } catch (_) {}
            }
            if (!effectiveAmazonProduct && typeof prompt === 'string') {
                const match = prompt.match(/#(\d+)/);
                if (match) effectiveAmazonProduct = amazonManager.getByCode(match[1]);
            }

            if (effectiveAmazonProduct) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Studio Covers] Injected Amazon product reference #${effectiveAmazonProduct.code} into single cover #${coverIndex + 1} regeneration`);
                    }
                } catch (prodErr) {
                    console.warn(`[Studio Covers] Could not load product image for single cover:`, prodErr.message);
                }
            }

            console.log(`[Studio Covers] Regenerating cover #${coverIndex + 1}...`);
            const savedPaths = await ai.generateImage({
                prompt,
                model: cleanModel,
                count: 1,
                sectionDir: skeletonDir,
                subFolder: projectFolder ? path.join(projectFolder, 'covers') : 'covers',
                sceneIndex: 200 + coverIndex,
                referenceImages: referenceImages
            });

            if (!savedPaths || savedPaths.length === 0 || !fs.existsSync(savedPaths[0])) {
                throw new Error('Image generation returned empty result');
            }

            const targetCoverFile = path.join(coversDir, `cover_${coverIndex + 1}.jpg`);
            fs.copyFileSync(savedPaths[0], targetCoverFile);
            const imgBuffer = fs.readFileSync(targetCoverFile);
            const base64Data = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

            return {
                coverIndex,
                imageUrl: base64Data,
                fileName: `cover_${coverIndex + 1}.jpg`
            };
        } catch (e) {
            console.error(`[Studio Covers] Failed to regenerate cover #${coverIndex + 1}:`, e);
            throw e;
        }
    });

    ipcMain.handle('studio-select-cover', async (event, { projectFolder, coverIndex }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            const sourceFile = path.join(coversDir, `cover_${coverIndex + 1}.jpg`);

            if (fs.existsSync(sourceFile)) {
                fs.copyFileSync(sourceFile, path.join(targetProjectDir, 'cover.jpg'));
                console.log(`[Studio Covers] Selected cover #${coverIndex + 1} as default project cover.jpg`);
            }

            const metaPath = path.join(coversDir, 'covers.json');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    meta.selectedCoverIndex = coverIndex;
                    if (Array.isArray(meta.covers)) {
                        meta.covers.forEach((c, idx) => {
                            c.isSelected = idx === coverIndex;
                        });
                    }
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                } catch (_) {}
            }

            return { success: true, selectedCoverIndex: coverIndex };
        } catch (e) {
            console.error('[Studio Covers] Error selecting cover:', e);
            throw e;
        }
    });

    ipcMain.handle('studio-get-covers', async (event, { projectFolder }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            const metaPath = path.join(coversDir, 'covers.json');

            if (!fs.existsSync(metaPath)) return null;
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const loadedCovers = [];

            if (Array.isArray(meta.covers)) {
                for (let i = 0; i < meta.covers.length; i++) {
                    const c = meta.covers[i];
                    const filePath = path.join(coversDir, c.fileName || `cover_${i + 1}.jpg`);
                    let imageUrl = '';
                    if (fs.existsSync(filePath)) {
                        const buf = fs.readFileSync(filePath);
                        imageUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
                    }
                    loadedCovers.push({
                        ...c,
                        imageUrl,
                        isSelected: (meta.selectedCoverIndex ?? 0) === i
                    });
                }
            }

            return {
                selectedCoverIndex: meta.selectedCoverIndex ?? 0,
                covers: loadedCovers
            };
        } catch (e) {
            console.error('[Studio Covers] Failed to get existing covers:', e);
            return null;
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
        let stderr = '';
        const child = spawn('ffmpeg', [
            '-f', 'lavfi', '-i', 'anoisesrc=d=0.35:c=pink:a=0.8,lowpass=f=2000,afade=t=in:d=0.1,afade=t=out:d=0.2',
            '-acodec', 'libmp3lame', '-ar', '44100', '-y', outputPath
        ]);
        
        child.stderr.on('data', data => { stderr += data.toString(); });
        
        child.on('close', code => {
            if (code === 0) resolve();
            else {
                console.error('[FFmpeg Whoosh Error]', stderr);
                reject(new Error('Whoosh generation failed: ' + stderr));
            }
        });
        child.on('error', reject);
    });
}

function createLateralTransition(clipA, clipB, whooshPath, outputPath, duration) {
    return new Promise((resolve, reject) => {
        const durA = getVideoDuration(clipA);
        const filter = [
            `[0:v]trim=${durA - duration}:${durA},setpts=PTS-STARTPTS[tail]`,
            `[1:v]trim=0:${duration},setpts=PTS-STARTPTS[head]`,
            `[tail]dblur=0:30[t_blur]`,
            `[head]format=rgba,colorchannelmixer=aa=1[head_rgba]`,
            `[t_blur][head_rgba]overlay=x='W*(1-t/${duration})':y=0,setpts=PTS-STARTPTS,format=yuv420p[outv]`,
            `[0:a]atrim=${durA - duration}:${durA},asetpts=PTS-STARTPTS[atail]`,
            `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS[ahead]`,
            `[atail][ahead]acrossfade=d=${duration}:c1=tri:c2=tri[across]`,
            `[2:a]volume=0.8,afade=t=in:d=0.02[whoosh]`,
            `[across][whoosh]amix=inputs=2:duration=first:weights=1 0.5[outa]`
        ].join(';');

        let stderr = '';
        const child = spawn('ffmpeg', [
            '-i', clipA, '-i', clipB, '-i', whooshPath,
            '-filter_complex', filter,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-y', outputPath
        ]);
        
        child.stderr.on('data', data => { stderr += data.toString(); });
        
        child.on('close', code => {
            if (code === 0) resolve();
            else {
                console.error('[FFmpeg Transition Error]', stderr);
                reject(new Error(`Transition failed: ` + stderr));
            }
        });
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

module.exports = { registerSkeletonHandlers };

