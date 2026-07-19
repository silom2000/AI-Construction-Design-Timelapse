const { ipcMain } = require('electron');
let currentMode = "construction";
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const ai = require('./ai-client.cjs');
const historyManager = require('./history-manager.cjs');

const TIMELAPSE_DIR = path.join(__dirname, 'CinematicTimelapse');
if (!fs.existsSync(TIMELAPSE_DIR)) fs.mkdirSync(TIMELAPSE_DIR, { recursive: true });
const STAGE_COUNT = 6;
const PROCESS_PROMPT_PATH = path.join(__dirname, 'AI_TIMELAPSE_PROCESS.md');
const PROCESS_PROMPT = fs.existsSync(PROCESS_PROMPT_PATH)
    ? fs.readFileSync(PROCESS_PROMPT_PATH, 'utf8')
    : '';
const SURREAL_MASTER_PROMPT_PATH = path.join(__dirname, 'AI_SURREAL_MASTER.md');
const SURREAL_PROCESS_PROMPT_PATH = path.join(__dirname, 'AI_SURREAL_PROCESS.md');
const SURREAL_MASTER_PROMPT = fs.existsSync(SURREAL_MASTER_PROMPT_PATH)
    ? fs.readFileSync(SURREAL_MASTER_PROMPT_PATH, 'utf8')
    : '';
const SURREAL_PROCESS_PROMPT = fs.existsSync(SURREAL_PROCESS_PROMPT_PATH)
    ? fs.readFileSync(SURREAL_PROCESS_PROMPT_PATH, 'utf8')
    : '';
const TRANSFORM_MASTER_PROMPT_PATH = path.join(__dirname, 'AI_TRANSFORM_MASTER.md');
const TRANSFORM_MASTER_PROMPT = fs.existsSync(TRANSFORM_MASTER_PROMPT_PATH)
    ? fs.readFileSync(TRANSFORM_MASTER_PROMPT_PATH, 'utf8')
    : '';

const MASTER_PROMPT = `
You are a Site-Specific Structural Engineer. Your goal is to recreate a construction process based STRICTLY on the provided environment.

--- SOURCE PROCESS DOCUMENT ---
Use this process document as the foundation for planning the timelapse:
${PROCESS_PROMPT}

--- STRICT SITE-SPECIFIC CONSISTENCY ---
- BACKGROUND: You MUST preserve the background shown in the reference media.
- STAGE 1 (MIRROR RULE): Stage 1 is a literal, detailed description of the FIRST uploaded file. Do NOT 'undo' construction. Recreate the house, materials, and trees EXACTLY.
- ARCHITECTURAL DNA: Identify the colors and materials in the reference (e.g., "red brick", "white stucco") and keep them identical across all 6 stages.

--- CONSTRUCTION PHASES (6 STAGES) ---
1. STAGE 1: AS-IS STATE. Pixel-faithful description of the 'Start' media.
2. STAGE 2: SITE PREPARATION. Clearing, marking, initial machinery arrival.
3. STAGE 3: FOUNDATION WORK. Excavation, foundation pour, ground-level structures.
4. STAGE 4: STRUCTURAL FRAME. Core skeleton, walls rising, scaffolding.
5. STAGE 5: SHELL COMPLETE. Roof on, exterior walls closed, windows placed.
6. STAGE 6: FINAL REVEAL. Exterior finishing, landscaping, and pristine completed state matching the user's goal.

--- PHYSICAL RULES ---
- MACHINERY: Must be realistically placed on the ground shown in the media.
- CAMERA STAGES 1-5: "locked-down professional tripod, static camera, zero movement, structural anchor stability." Background stays 100% static.
- CAMERA STAGE 6: "smooth cinematic drone orbital reveal, slow arc around the completed structure."
- ENGINEER: Visible in Stages 2-4 (white hardhat, hi-vis vest).

--- TECHNICAL KEYWORDS ---
- IMAGES: "8k realistic architectural photography, sharp details, consistent lighting, original environment preservation."
- VIDEOS: "Temporal stability, natural physics, consistent background. Sound design is a continuous raw construction-site ambience: engines, hydraulics, drills, saws, hammers, concrete mixers, cranes, metal clanks, gravel, wind, and dust."

--- IMAGE FRAME RULES ---
- Every image prompt must describe ONE full-screen vertical 9:16 TikTok frame.
- Never create a collage, triptych, split screen, storyboard, contact sheet, multi-panel layout, before/after comparison, grid, or several images inside one frame.
- Stage 1 is the master visual reference for all later stages: preserve the same background, camera height, lens, perspective, object scale, horizon line, and main proportions.
- Stage 1 camera must be a close elevated 30-degree oblique construction view, not a distant drone/helicopter shot and not straight down, vertical 9:16 TikTok frame. The main construction object must fill most of the frame while still showing nearby machinery, workers, and immediate work zones.
- Stages 2-5 must keep a locked camera and change only the construction progress, not the viewpoint.
- Stage 6 may add a subtle cinematic reveal feeling, but it must still preserve the original site identity and proportions.

--- OUTPUT FORMAT (STATE 2) ---
When the user asks for ideas, output exactly this JSON object (ensure it contains exactly 4 full ideas):
{
  "environments": [
    {
      "id": 1,
      "ru": "Полноценная русская карточка идеи №1...",
      "en": "Full English idea card #1..."
    },
    {
      "id": 2,
      "ru": "Полноценная русская карточка идеи №2...",
      "en": "Full English idea card #2..."
    },
    {
      "id": 3,
      "ru": "Полноценная русская карточка идеи №3...",
      "en": "Full English idea card #3..."
    },
    {
      "id": 4,
      "ru": "Полноценная русская карточка идеи №4...",
      "en": "Full English idea card #4..."
    }
  ]
}

STATE 2 rules:
- Generate exactly 4 rich viral TikTok video-project ideas, not short prompts.
- Each idea must be a different construction/design transformation with fantastic surrealism: impossible architecture, dreamlike materials, scale shifts, gravity-defying structures, mythic locations, or uncanny visual twists.
- The surrealism must still be buildable as a 6-stage construction timelapse: clear start, escalation, strange mid-build spectacle, and unforgettable final reveal.
- Every idea must include a strong viewer-retention hook: a mystery, visual contradiction, or escalating question that makes the viewer want to watch until the final frame.
- Every idea must feel like content that could make a TikTok viewer stop scrolling, rewatch, comment, and subscribe.
- Avoid ordinary renovations, generic luxury villas, plain pools, and predictable before/after ideas unless they contain a highly unusual surreal twist.
- Each "ru" and "en" field must be 2-3 vivid sentences, suitable for displaying as a card, and should mention the hook plus the final reveal.
- Do not output image prompts, video prompts, stage prompts, or the STATE 3 schema in STATE 2.

STATE 2 style examples:
- A ruined bus stop slowly becomes a floating glass cathedral while workers anchor glowing cables into the asphalt; the final reveal shows the entire street bending upward like a bridge into the sky.
- An abandoned swimming pool is rebuilt into a miniature ocean with a lighthouse in the deep end; viewers wait to see whether the tiny storm inside the pool becomes real.
- A cracked backyard shed transforms into a portal-shaped micro-mansion, with each stage revealing a larger impossible interior than the outside should allow.

--- OUTPUT FORMAT (STATE 3) ---
Output exactly as JSON:
{
  "projectTitle": "English viral title, 4-6 words, no hashtags",
  "tiktokDescription": "English short video description, maximum 15 words",
  "tiktokHashtags": "5-7 English hashtags separated by spaces, include # on each hashtag",
  "contextConfirmation": "A technical confirmation that strictly follows the provided visual environment.",
   "images": [
      { "id": 1, "title": "Image 1 (AS-IS)", "prompt": "..." },
      { "id": 2, "title": "Image 2 (SITE PREP)", "prompt": "..." },
      { "id": 3, "title": "Image 3 (FOUNDATION)", "prompt": "..." },
      { "id": 4, "title": "Image 4 (STRUCTURAL FRAME)", "prompt": "..." },
      { "id": 5, "title": "Image 5 (SHELL COMPLETE)", "prompt": "..." },
      { "id": 6, "title": "Image 6 (FINAL REVEAL)", "prompt": "..." }
   ],
   "videos": [
      { "id": 1, "title": "Video 1 (Preparation)", "prompt": "..." },
      { "id": 2, "title": "Video 2 (Foundation)", "prompt": "..." },
      { "id": 3, "title": "Video 3 (Framing)", "prompt": "..." },
      { "id": 4, "title": "Video 4 (Shell)", "prompt": "..." },
      { "id": 5, "title": "Video 5 (Exterior Finishing)", "prompt": "..." },
      { "id": 6, "title": "Video 6 (Final Orbit)", "prompt": "..." }
    ],
    "engineerNotes": "Technical summary referencing the specific structural challenges of the site shown."
}

STATE 3 metadata rules:
- projectTitle is required, English only, 4-6 words, TikTok-ready, filename-safe, no hashtags, no emoji.
- tiktokDescription is required, English only, maximum 15 words, short and curiosity-driven.
- tiktokHashtags is required, exactly 5-7 English hashtags separated by spaces, each starting with #.
- These metadata fields must match the selected idea and final reveal.

STATE 3 image prompt rules:
- Each image prompt must describe only its own single stage, not the whole 6-stage sequence.
- Every image prompt must explicitly include: "single full-frame vertical 9:16 TikTok image, no collage, no split screen, no storyboard, no multiple panels".
- Image 1 must be a clean master frame/reference frame. It must not show multiple stages or any before/after layout.
- Image 1 must use a close elevated 30-degree oblique construction camera view, not a distant drone/helicopter shot and not a straight-down 90-degree top view, vertical 9:16. The main structure must be large and readable, occupying roughly 65-80% of the frame height, with construction details clearly visible.
- Images 2-6 must preserve Image 1 composition, background, close elevated 30-degree oblique camera, perspective, proportions, lens angle, and horizon line.
- Never use a flat top-down map view, nadir view, bird's-eye 90-degree view, blueprint view, drone looking straight down, or orthographic plan view.
- Never write an image prompt that asks to show a sequence, timeline, progression strip, multiple moments, several stages at once, or a comparison between stages.
- Do not mention "six stages", "before and after", "step-by-step", "panels", "frames", "sequence", or "timeline" inside individual image prompts.
- If the project idea contains several phases, convert it into one frozen photographic moment for the current stage only.

STATE 3 video prompt audio rules:
- Every video prompt must include this exact audio instruction: "SOUND DESIGN: continuous raw construction-site ambience only: excavator engines, crane hydraulics, concrete mixers, drills, saws, hammers, metal clanks, gravel movement, wind, and dust."
- Describe the audio as environmental machinery and tool noise from the construction site.
- If a prompt needs atmosphere, describe construction ambience and machinery noise only.
`;

// Simple async wait to simulate process if needed
const delay = ms => new Promise(r => setTimeout(r, ms));

function normalizeEnvironmentIdeas(parsed) {
    const source = Array.isArray(parsed) ? parsed : parsed?.environments;
    if (!Array.isArray(source)) return null;

    return source.slice(0, 4).map((item, index) => {
        if (typeof item === 'string') {
            return { id: index + 1, ru: item, en: item };
        }

        const ru = item.ru || item.russian || item.title_ru || item.title || item.name || '';
        const en = item.en || item.english || item.title_en || item.description || ru;
        return {
            id: item.id || index + 1,
            ru: String(ru).trim(),
            en: String(en).trim(),
        };
    }).filter((item) => item.ru && item.en);
}

function normalizePromptData(parsed) {
    const images = Array.isArray(parsed?.images) ? parsed.images.slice(0, STAGE_COUNT) : [];
    const videos = Array.isArray(parsed?.videos) ? parsed.videos.slice(0, STAGE_COUNT) : [];

    return {
        ...parsed,
        images: images.map((item, index) => ({ ...item, id: index + 1 })),
        videos: videos.map((item, index) => ({ ...item, id: index + 1 })),
    };
}

function normalizeTimelapseMode(mode) {
    if (mode === 'surreal') return 'surreal';
    if (mode === 'transform') return 'transform';
    return 'construction';
}

function getModeInstruction(mode) {
    if (mode === 'surreal') {
        return `MODE: PURE SURREALISM.
This is NOT construction, NOT architecture, NOT renovation, and NOT engineering content.
Generate surreal physical metamorphosis timelapse ideas about one monolithic object, natural form, artifact, landscape fragment, statue, machine-like relic, or impossible material mass transforming over time.
ABSOLUTELY FORBIDDEN in surreal mode: construction, building, rebuilding, renovation, house, mansion, residence, architecture, workers, engineers, helmets, cranes, excavators, scaffolding, concrete pours, foundations, stairs, windows, rooms, roofs, walls, construction sites, and machinery.
The transformation should feel like matter rearranging itself: liquid glass, obsidian, titanium, frozen smoke, mercury, stone, crystal, gravity distortion, impossible geometry, shadow, reflections, and material mutation.`;
    }

    if (mode === 'transform') {
        return `MODE: MECHANICAL TRANSFORMATION.
This is a sci-fi mechanical capsule transformation series. Each of the 6 videos is INDEPENDENT — it shows one unique capsule transforming into a robotic animal, vehicle, or weapon.
ABSOLUTELY FORBIDDEN: construction, architecture, surrealism, cartoons, bright rainbow palettes, cheap CGI, real-world buildings or workers.
Each capsule image must be UNIQUE: different shape (cube/cylinder/sphere/octagon/hexagon), different armored color scheme, different country flag emblem or faction symbol.
Each video starts from its own dedicated capsule image. The camera stays static. The transformation is explosive, hyper-detailed, mechanical.`;
    }

    return `MODE: CONSTRUCTION.
Generate grounded cinematic construction/design timelapse ideas only. Do NOT use surrealism, fantasy, impossible architecture, dreamlike materials, portals, levitation, scale-shift magic, mythic locations, or uncanny visual twists.
Every idea must be physically plausible, realistic, and focused on construction process, site work, machinery, materials, engineering, and an impressive but believable final reveal.`;
}

function getTimelapseSystemPrompt(mode) {
    if (mode === 'surreal') {
        return `${SURREAL_MASTER_PROMPT}

${SURREAL_PROCESS_PROMPT}

--- OUTPUT FORMAT (STATE 2) ---
Return exactly this JSON object with exactly 4 ideas:
{
  "environments": [
    { "id": 1, "ru": "...", "en": "..." },
    { "id": 2, "ru": "...", "en": "..." },
    { "id": 3, "ru": "...", "en": "..." },
    { "id": 4, "ru": "...", "en": "..." }
  ]
}

STATE 2 rules:
- Generate exactly 4 rich viral TikTok surreal metamorphosis ideas, not short prompts.
- Each idea must be 2-3 vivid sentences in both Russian and English.
- Each idea must include a viewer-retention hook and an unforgettable final reveal.
- Do not mention construction, building, architecture, workers, cranes, concrete, or machinery.
- Do not output image prompts, video prompts, stage prompts, or the STATE 3 schema in STATE 2.

--- OUTPUT FORMAT (STATE 3) ---
When the user selects an idea, return exactly this JSON object:
{
  "projectTitle": "English viral title, 4-6 words, no hashtags",
  "tiktokDescription": "English short video description, maximum 15 words",
  "tiktokHashtags": "5-7 English hashtags separated by spaces, include # on each hashtag",
  "contextConfirmation": "A technical confirmation that preserves the selected surreal subject and environment.",
  "images": [
    { "id": 1, "title": "Image 1 (ORIGIN STATE)", "prompt": "..." },
    { "id": 2, "title": "Image 2 (FIRST SHIFT)", "prompt": "..." },
    { "id": 3, "title": "Image 3 (EMERGENCE)", "prompt": "..." },
    { "id": 4, "title": "Image 4 (STRUCTURAL RUPTURE)", "prompt": "..." },
    { "id": 5, "title": "Image 5 (NEAR COMPLETE)", "prompt": "..." },
    { "id": 6, "title": "Image 6 (FINAL REVELATION)", "prompt": "..." }
  ],
  "videos": [
    { "id": 1, "title": "Video 1 (First Shift)", "prompt": "..." },
    { "id": 2, "title": "Video 2 (Emergence)", "prompt": "..." },
    { "id": 3, "title": "Video 3 (Rupture)", "prompt": "..." },
    { "id": 4, "title": "Video 4 (Near Complete)", "prompt": "..." },
    { "id": 5, "title": "Video 5 (Final Morph)", "prompt": "..." },
    { "id": 6, "title": "Video 6 (Final Orbit)", "prompt": "..." }
  ],
  "engineerNotes": "Surreal material continuity notes, no construction language."
}`;
    }

    if (mode === 'transform') {
        return `${TRANSFORM_MASTER_PROMPT}

--- WEAPON DESIGN VARIETY ---
You must generate 6 COMPLETELY DIFFERENT weapon designs. Each artifact and weapon must be unique:
- ARTIFACT SHAPES: token, disc, cube, crystal, sphere, hexagonal chip, triangular prism, flat capsule (no repeats)
- WEAPON NAMES: Give each weapon a unique sci-fi name (e.g. Ghost Pistol, Plasma Repeater, Void Revolver, Rail Sidearm, Thermal Lance, Cryo Carbine, Sonic Disruptor, Photon Blade)
- COLOR SCHEMES: matte black titanium + blue plasma, orange glowing rings, dark matter purple, white electromagnetic, red molten plasma, ice-blue crystal, green resonance, golden energy arc
- DESIGN LANGUAGE: Each weapon must have a distinct visual identity and silhouette

--- OUTPUT FORMAT (STATE 2) ---
Return exactly this JSON object with exactly 4 themed weapon series ideas:
{
  "environments": [
    { "id": 1, "ru": "...", "en": "..." },
    { "id": 2, "ru": "...", "en": "..." },
    { "id": 3, "ru": "...", "en": "..." },
    { "id": 4, "ru": "...", "en": "..." }
  ]
}

STATE 2 rules:
- Generate exactly 4 viral TikTok weapon forge series concepts (e.g. "6 alien artifacts transform into legendary pistols", "6 ancient tokens become plasma weapons").
- Each idea must be 2-3 vivid sentences in both Russian and English.
- Each idea is a SERIES concept describing the theme shared by all 6 clips.
- Do not output image prompts or video prompts in STATE 2.

--- OUTPUT FORMAT (STATE 3) ---
When the user selects an idea, return exactly this JSON object.
CRITICAL: Each image shows a DIFFERENT compact artifact lying on a wooden lacquered table with worn lacquer and scratches. Each video shows THAT artifact being picked up by a hand and transforming into a DIFFERENT named weapon.
{
  "projectTitle": "English viral series title, 4-6 words, no hashtags",
  "tiktokDescription": "English short series description, maximum 15 words",
  "tiktokHashtags": "5-7 English hashtags separated by spaces, include # on each hashtag",
  "contextConfirmation": "Technical description of the 6-weapon transformation series selected.",
  "images": [
    { "id": 1, "title": "#1 [WEAPON_NAME]", "prompt": "Ultra realistic cinematic shot of a compact futuristic [ARTIFACT_SHAPE], appearing as advanced alien technology, lying alone in the center of a wooden lacquered table. The wooden surface has worn lacquer and visible scratches from time. DESIGN: [WEAPON_NAME]. [DESIGN_DETAILS: e.g. transparent energy chamber, matte black titanium, blue plasma core, minimalist futuristic pistol silhouette]. Moody lighting, dramatic shadows, reflections on the worn wood, shallow depth of field, cinematic composition. High-end sci-fi design language, premium industrial design, hard surface details, glowing energy lines, futuristic materials. The object looks inactive and compact, as if it is about to transform into a larger advanced device. Shot on professional cinema camera, ultra realistic, HDR, extremely detailed, 8k, sharp focus. Vertical 9:16 aspect ratio. No text, no watermark, no hands in the frame, no distortion, no deformed fingers, no blurry details." },
    { "id": 2, "title": "#2 [WEAPON_NAME]", "prompt": "..." },
    { "id": 3, "title": "#3 [WEAPON_NAME]", "prompt": "..." },
    { "id": 4, "title": "#4 [WEAPON_NAME]", "prompt": "..." },
    { "id": 5, "title": "#5 [WEAPON_NAME]", "prompt": "..." },
    { "id": 6, "title": "#6 [WEAPON_NAME]", "prompt": "..." }
  ],
  "videos": [
    { "id": 1, "title": "#1 [WEAPON_NAME] — Transform", "prompt": "The camera remains completely stationary. A compact futuristic artifact lies on a wooden lacquered table with worn lacquer and scratches. A person's hand (or both hands) enters the frame, takes the artifact from the wooden table, and the transformation starts immediately. Glowing energy pulses appear across its surface. Mechanical panels unfold smoothly. Hidden components extend outward. Precision engineered parts rotate and lock into place. The object rapidly transforms into [WEAPON_NAME]: [DESIGN_DETAILS]. The person naturally closes their fingers and firmly grips the fully formed weapon. Subtle hand movement, realistic weight response, detailed reflections on the worn wood and metallic parts, cinematic lighting. Photorealistic skin, realistic mechanical motion, Hollywood sci-fi quality, industrial hard-surface design. Smooth camera, no shaking, no cuts, no scene changes. Ultra realistic, high detail, dramatic lighting, premium VFX, viral TikTok style. No text, no watermark, no deformed fingers, no extra digits." },
    { "id": 2, "title": "#2 [WEAPON_NAME] — Transform", "prompt": "..." },
    { "id": 3, "title": "#3 [WEAPON_NAME] — Transform", "prompt": "..." },
    { "id": 4, "title": "#4 [WEAPON_NAME] — Transform", "prompt": "..." },
    { "id": 5, "title": "#5 [WEAPON_NAME] — Transform", "prompt": "..." },
    { "id": 6, "title": "#6 [WEAPON_NAME] — Transform", "prompt": "..." }
  ],
  "engineerNotes": "Series design notes: artifact shapes, weapon names, color schemes, and design details for all 6 clips."
}

FILL IN all [PLACEHOLDERS] with actual creative values. Every artifact shape, weapon name, color scheme, and design language must be DIFFERENT across all 6 entries. Write complete prompts for every entry, not just the first one.`;
    }

    return MASTER_PROMPT;
}

function getState2Request(mode, exclusionClause) {
    if (mode === 'surreal') {
        return `STATE 2: Generate exactly 4 pure surreal physical metamorphosis timelapse idea cards for MODE=surreal. The ideas must not be about construction, buildings, architecture, renovation, workers, cranes, concrete, or machinery. Return only JSON in the STATE 2 format.${exclusionClause}`;
    }

    if (mode === 'transform') {
        return `STATE 2: Generate exactly 4 viral TikTok weapon forge SERIES concepts for MODE=transform. Each idea describes a themed set of 6 clips where a compact futuristic artifact lying on a wooden lacquered table with worn lacquer and scratches is picked up by a hand and transforms into a unique sci-fi weapon. Return only JSON in the STATE 2 format.${exclusionClause}`;
    }

    return `STATE 2: Generate exactly 4 full cinematic construction/design timelapse project idea cards for MODE=construction. Return only JSON in the STATE 2 format.${exclusionClause}`;
}

function registerTimelapseHandlers(ipcMain) {
    let conversationHistory = [];

    ipcMain.handle('timelapse-get-environments', async (event, { mode } = {}) => {
        currentMode = normalizeTimelapseMode(mode);
        const excludedTopics = historyManager.getTopics('timelapse_ru');
        const excludedTopicsEn = historyManager.getTopics('timelapse_en');
        const allExcluded = [...new Set([...excludedTopics, ...excludedTopicsEn])].slice(-40);
        const exclusionClause = allExcluded.length > 0
            ? `\n\nEXCLUSION LIST (DO NOT USE these ideas or anything similar — generate completely NEW and UNIQUE concepts):\n${allExcluded.join('\n')}`
            : '';

        conversationHistory = [
            { role: 'system', content: getTimelapseSystemPrompt(currentMode) },
            { role: 'system', content: getModeInstruction(currentMode) },
            {
                role: 'user',
                content: getState2Request(currentMode, exclusionClause)
            }
        ];

        console.log(`[Timelapse] Requesting State 2 Environments. Mode: ${currentMode}`);
        const response = await ai.chat(conversationHistory, true);
        conversationHistory.push({ role: 'assistant', content: response });

        // Parse JSON array from response
        try {
            const cleanJson = response.match(/\[[\s\S]*\]/)?.[0] || response.match(/\{[\s\S]*\}/)?.[0] || response;
            const parsed = JSON.parse(cleanJson);
            const ideas = normalizeEnvironmentIdeas(parsed);
            if (ideas && ideas.length === 4) {
                ideas.forEach(idea => {
                    historyManager.addTopic('timelapse_ru', idea.ru);
                    historyManager.addTopic('timelapse_en', idea.en);
                });
                return ideas;
            }
        } catch (e) {
            console.warn('[Timelapse] JSON parse failed, falling back to line parse:', e.message);
        }
        // Fallback: wrap plain lines as objects
        const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 10).slice(0, 4);
        const fallbackIdeas = lines.map((l, i) => ({ id: i + 1, en: l, ru: l }));
        fallbackIdeas.forEach(idea => {
            historyManager.addTopic('timelapse_ru', idea.ru);
            historyManager.addTopic('timelapse_en', idea.en);
        });
        return fallbackIdeas;
    });

    ipcMain.handle('timelapse-generate-prompts', async (event, { selectionIndex, selectedEnv }) => {
        console.log(`[Timelapse] Requesting State 3 for Env #${selectionIndex}`);
        conversationHistory.push({
            role: 'user',
            content: `STATE 3: I select option ${selectionIndex}. Selected idea: ${JSON.stringify(selectedEnv)}. Return only JSON in the STATE 3 format.`
        });

        const rawJsonString = await ai.chat(conversationHistory, true);
        conversationHistory.push({ role: 'assistant', content: rawJsonString });

        try {
            const cleanJson = rawJsonString.match(/\{[\s\S]*\}/)?.[0] || rawJsonString;
            return normalizePromptData(JSON.parse(cleanJson));
        } catch (e) {
            console.error('[Timelapse] Failed to parse JSON:', rawJsonString);
            throw new Error('LLM failed to output valid JSON for State 3. Please reset and try again.');
        }
    });

    ipcMain.handle('timelapse-generate-custom-prompts', async (event, { customIdea, images, video, mode } = {}) => {
        currentMode = normalizeTimelapseMode(mode);
        console.log(`[Timelapse] Requesting State 3 with CUSTOM IDEA. Mode: ${currentMode}. Images: ${images?.length || 0}, Video: ${!!video}`);
        
        const referenceFrames = [];
        const finalImagesForLLM = [...(images || [])];
        const tid = `Timelapse_${Date.now()}`;
        const baseDir = path.join(TIMELAPSE_DIR, tid);
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

        // Save ALL reference images (from manual upload or video) to the session dir
        if (images && images.length > 0) {
            images.forEach((imgB64, i) => {
                const frameName = `ref_frame_${i + 1}.jpg`;
                const framePath = path.join(baseDir, frameName);
                const data = imgB64.split(';base64,').pop();
                fs.writeFileSync(framePath, data, 'base64');
                const uri = `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`;
                referenceFrames.push(uri);
            });
        }

        // If video is provided, extract key frames (evenly spaced)
        if (video) {
            try {
                console.log(`[Timelapse] Extracting ${STAGE_COUNT} frames from reference video...`);
                const tempVideoPath = path.join(os.tmpdir(), `ref_video_${Date.now()}.mp4`);
                const videoData = video.split(';base64,').pop();
                fs.writeFileSync(tempVideoPath, videoData, 'base64');

                const duration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`).toString().trim());

                for (let i = 0; i < STAGE_COUNT; i++) {
                    const timestamp = (duration * (i / (STAGE_COUNT - 1))).toFixed(2);
                    const frameName = `ref_frame_${i + 1}.jpg`;
                    const framePath = path.join(baseDir, frameName);

                    execSync(`ffmpeg -ss ${timestamp} -i "${tempVideoPath}" -frames:v 1 -q:v 4 "${framePath}" -y`);

                    const frameBase64 = fs.readFileSync(framePath, 'base64');
                    finalImagesForLLM.push(`data:image/jpeg;base64,${frameBase64}`);

                    const uri = `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`;
                    referenceFrames.push(uri);
                }
                fs.unlinkSync(tempVideoPath);
            } catch (vErr) {
                console.error('[Timelapse] Video frame extraction failed:', vErr.message);
            }
        }

        // Build mode-specific user message
        let userTextContent;
        if (currentMode === 'transform') {
            userTextContent = `You are a Sci-Fi Weapon Design Director.
 
 USER IDEA:
 ${customIdea || 'No written idea provided. Generate a creative 6-weapon transformation series.'}
 
 CRITICAL TASK:
 Based on the user's idea above, design a complete 6-weapon transformation series.
 1. Create 6 DIFFERENT compact futuristic artifacts (token, disc, cube, crystal, etc.) — each lying alone in the center of a wooden lacquered table with worn lacquer and scratches. Absolutely no hands in the frame for the image prompts.
 2. Each artifact transforms into a DIFFERENT named sci-fi weapon (give each weapon a unique name like Ghost Pistol, Plasma Repeater, Void Revolver, etc.).
 3. IMAGE PROMPTS must follow this template: "Ultra realistic cinematic shot of a compact futuristic [ARTIFACT] lying on a wooden lacquered table with worn lacquer and scratches... DESIGN: [WEAPON_NAME]. [DESIGN_DETAILS]... Moody lighting, 8k, vertical 9:16, no hands in the frame."
 4. VIDEO PROMPTS must follow this template: "The camera remains completely stationary. A compact futuristic artifact lies on a wooden lacquered table with worn lacquer and scratches. A person's hand enters the frame, takes the artifact, and the transformation starts immediately... transforms into [WEAPON_NAME]... The person holds the weapon. Ultra realistic, viral TikTok style."
 
 OUTPUT: Return the complete STATE 3 JSON with projectTitle, tiktokDescription, tiktokHashtags, contextConfirmation, 6 images, 6 videos, and engineerNotes. Return ONLY valid JSON.`;
        } else if (currentMode === 'surreal') {
            userTextContent = `You are a Surreal Metamorphosis Specialist.

USER IDEA:
${customIdea || 'No written idea provided. Use the uploaded reference media and the selected generation mode.'}

CRITICAL TASK:
Analyze the provided images/frames (sent in chronological order) and extract the 'Visual DNA'.
1. What is the main surreal subject and its material essence?
2. Replicate the textures, forms, and lighting EXACTLY.
3. Observe the metamorphosis progression from the first frame to the last.

STRICT RULE:
Stage 1 MUST be a 100% literal description of the FIRST image/frame provided.

Output the 6-stage pipeline in JSON format as per the system instructions.`;
        } else {
            userTextContent = `You are a Visual Replication Specialist.

USER IDEA:
${customIdea || 'No written idea provided. Use the uploaded reference media and the selected generation mode.'}

CRITICAL TASK:
Analyze the provided images/frames (sent in chronological order) and extract the 'Visual DNA'.
1. What is the main structure and site?
2. Replicate the materials, architecture, and lighting EXACTLY.
3. Observe the progression from the first frame to the last.

STRICT RULE:
Stage 1 MUST be a 100% literal description of the FIRST image/frame provided.

Output the 6-stage pipeline in JSON format as per the system instructions.`;
        }

        const content = [
            { type: 'text', text: userTextContent }
        ];

        finalImagesForLLM.forEach((base64) => {
            const cleanBase64 = base64.includes('base64,') ? base64 : `data:image/jpeg;base64,${base64}`;
            content.push({
                type: 'image_url',
                image_url: { url: cleanBase64, detail: 'high' }
            });
        });

        const customConversation = [
            { role: 'system', content: getTimelapseSystemPrompt(currentMode) },
            { role: 'system', content: getModeInstruction(currentMode) },
            { role: 'user', content: content }
        ];

        const rawJsonString = await ai.chat(customConversation, true);
        
        try {
            const cleanJson = rawJsonString.match(/\{[\s\S]*\}/)?.[0] || rawJsonString;
            const parsed = JSON.parse(cleanJson);
            return { ...normalizePromptData(parsed), referenceFrames, subFolder: tid }; 
        } catch (e) {
            console.error('[Timelapse] Failed to parse custom JSON. Raw string:', rawJsonString);
            throw new Error('LLM response format error. Please try again.');
        }
    });

    ipcMain.handle('timelapse-generate-image', async (event, { imgIndex, prompt, model, subFolder, referenceImage }) => {
        // imgIndex is 0 to 3, representing Image 1 to 4
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        console.log(`[Timelapse] Generating Image ${imgIndex + 1} with model ${model || 'nano_banana_2'}...`);

        // --- Reference image: prioritize user reference if provided ---
        const finalRefImages = [];
        if (referenceImage) {
            console.log(`[Timelapse] Using USER REFERENCE for Stage ${imgIndex + 1} (STRICT REPLICATION)`);
            finalRefImages.push({ data: referenceImage.includes('base64,') ? referenceImage : `data:image/jpeg;base64,${referenceImage}` });
        } else if (imgIndex > 0 && fs.existsSync(baseDir) && currentMode !== 'transform') {
            // Look for the previous stage image. It is mandatory for stable timelapse geometry.
            const prevFiles = fs.readdirSync(baseDir)
                .filter(f =>(
                    f.startsWith(`scene_${imgIndex}_`) ||
                    f.startsWith(`ref_frame_${imgIndex}`) ||
                    f.startsWith(`image_${imgIndex}`)
                ) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                .sort();
            if (prevFiles.length > 0) {
                const prevPath = path.join(baseDir, prevFiles[prevFiles.length - 1]);
                const ext = prevPath.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(prevPath, { encoding: 'base64' });
                finalRefImages.push({ data: `data:image/${ext};base64,${b64}` });
                console.log(`[Timelapse] Using previous image as reference: ${prevFiles[prevFiles.length - 1]}`);
            }

            if (finalRefImages.length === 0) {
                throw new Error(`Previous reference image for Stage ${imgIndex + 1} was not found. Generate Stage ${imgIndex} first to preserve camera and background.`);
            }
        }

        // Reinforce spatial consistency in the prompt
        const constructionStageLabels = [
            'STAGE 1: AS-IS STATE',
            'STAGE 2: SITE PREPARATION',
            'STAGE 3: FOUNDATION WORK',
            'STAGE 4: STRUCTURAL FRAME',
            'STAGE 5: SHELL COMPLETE',
            'STAGE 6: FINAL REVEAL'
        ];
        const surrealStageLabels = [
            'STAGE 1: ORIGIN STATE',
            'STAGE 2: FIRST SHIFT',
            'STAGE 3: EMERGENCE',
            'STAGE 4: STRUCTURAL RUPTURE',
            'STAGE 5: NEAR COMPLETE',
            'STAGE 6: FINAL REVELATION'
        ];
        const transformStageLabels = [
            'CAPSULE 1: INDEPENDENT SCI-FI CAPSULE',
            'CAPSULE 2: INDEPENDENT SCI-FI CAPSULE',
            'CAPSULE 3: INDEPENDENT SCI-FI CAPSULE',
            'CAPSULE 4: INDEPENDENT SCI-FI CAPSULE',
            'CAPSULE 5: INDEPENDENT SCI-FI CAPSULE',
            'CAPSULE 6: INDEPENDENT SCI-FI CAPSULE'
        ];
        const stageLabels = currentMode === 'surreal' ? surrealStageLabels
            : currentMode === 'transform' ? transformStageLabels
            : constructionStageLabels;
        // In transform mode each capsule is independent — no cross-stage consistency prefix needed
        const consistencyPrefix = (imgIndex > 0 && currentMode !== 'transform')
            ? `CRITICAL CONSISTENCY RULE: Use the provided previous image as the direct image-to-image reference. Keep the EXACT SAME SITE, same background, same close elevated 30-degree oblique camera, same lens, same perspective, same horizon line, same object scale, and same composition. Do not invent a new view or new plan. Only change ${currentMode === 'surreal' ? 'the surreal material transformation' : 'construction progress'} for: ${stageLabels[imgIndex]}. `
            : '';

        const constructionFrameRule = 'Single full-frame vertical 9:16 TikTok image. One continuous scene only. Close elevated 30-degree oblique construction camera, like a camera mounted on a nearby crane or scaffolding looking diagonally down from the side, not a distant drone or helicopter. The main construction object must be close, large, and readable, occupying roughly 65-80% of the frame height, with workers, machinery, and immediate work zones visible around it. Absolutely NO far aerial establishing shot, NO tiny distant construction site, NO 90-degree top-down view, NO nadir view, NO orthographic plan, NO blueprint/map view. Show exactly ONE photographic moment for this stage. Do NOT visualize the timelapse sequence. Do NOT show multiple stages, multiple moments, progression strips, comparisons, or several images inside the same canvas. NO collage, NO triptych, NO split screen, NO storyboard, NO before-and-after layout, NO grid, NO multiple panels. Preserve the same background, camera height, lens angle, perspective, horizon line, object scale, and proportions for timelapse stability. ';
        const surrealFrameRule = 'Single full-frame vertical 9:16 TikTok image. One continuous scene only. Close elevated 30-degree oblique cinematic camera, not a distant drone or helicopter. The single surreal subject must be close, large, and readable, occupying roughly 65-80% of the frame height, with its material transformation clearly visible. Absolutely NO construction site, NO workers, NO helmets, NO cranes, NO excavators, NO scaffolding, NO concrete pour, NO foundation, NO architectural building process. Absolutely NO far aerial establishing shot, NO tiny distant subject, NO 90-degree top-down view, NO nadir view, NO orthographic plan, NO blueprint/map view. Show exactly ONE photographic moment for this stage. Do NOT visualize the timelapse sequence. Do NOT show multiple stages, multiple moments, progression strips, comparisons, or several images inside the same canvas. NO collage, NO triptych, NO split screen, NO storyboard, NO before-and-after layout, NO grid, NO multiple panels. Preserve the same background, camera height, lens angle, perspective, horizon line, object scale, and proportions for timelapse stability. ';
        const transformFrameRule = 'Ultra realistic cinematic shot, elevated 25-degree angle looking down from above, 35mm full-frame lens. A compact futuristic artifact, appearing as advanced alien technology, lies alone on a wooden lacquered table. The wooden surface has worn lacquer and visible scratches from time. The artifact occupies roughly 35-40% of the frame height, with the full wooden table surface and moody dark background clearly visible. Absolutely NO hands or people in the frame. Moody lighting, dramatic shadows, reflections on the wood, shallow depth of field, cinematic composition. High-end sci-fi design language, premium industrial design, hard surface details, glowing energy lines, futuristic materials. The object looks inactive and compact, as if it is about to transform. Shot on professional cinema camera, ultra realistic, HDR, extremely detailed, 8k, sharp focus. Vertical 9:16 aspect ratio. No text, no watermark, no hands, no distortion, no deformed fingers, no blurry details. ';
        const frameRule = currentMode === 'surreal' ? surrealFrameRule
            : currentMode === 'transform' ? transformFrameRule
            : constructionFrameRule;
        const stageOneRule = imgIndex === 0 && currentMode !== 'transform'
            ? `This is the master reference frame for the entire video. Use a close elevated 30-degree oblique view so the viewer can clearly see ${currentMode === 'surreal' ? 'the surreal subject and material details' : 'construction details'} without the ${currentMode === 'surreal' ? 'subject' : 'site'} becoming tiny. Create one clean full-screen frame only; do not show the ${currentMode === 'surreal' ? 'transformation sequence' : 'construction sequence'}. `
            : '';
        const finalPrompt = frameRule + stageOneRule + consistencyPrefix + prompt;

        // In transform mode: no I2I needed (each capsule is a fresh generation from text only).
        // For other modes: lower I2I strength keeps the previous frame closer and prevents camera drift.
        const useStrength = currentMode === 'transform' ? 0.9
            : referenceImage ? (imgIndex === 0 ? 0.2 : 0.35)
            : (imgIndex > 0 ? 0.35 : 0.6);

        const savedPaths = await ai.generateImage({
            prompt: finalPrompt,
            model: model || 'nano_banana_2',
            aspectRatio: '9:16',
            count: 1,
            sectionDir: TIMELAPSE_DIR,
            subFolder: subFolder,
            sceneIndex: imgIndex,
            referenceImages: finalRefImages,
            strength: useStrength
        });
        
        // Return as data URL — bypasses the media:// protocol handler entirely,
        // guaranteeing the image displays on Windows regardless of net.fetch behaviour.
        const imgBuffer = fs.readFileSync(savedPaths[0]);
        const imgExt = path.extname(savedPaths[0]).toLowerCase();
        const imgMime = imgExt === '.png' ? 'image/png' : imgExt === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
    });

    ipcMain.handle('timelapse-generate-video', async (event, { videoIndex, prompt, subFolder, videoModel }) => {
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        
        // Helper to find the latest version of an image file (e.g. image_1_TIMESTAMP.jpg or scene_1_TIMESTAMP.jpg)
        const findImage = (idx) => {
            if (!fs.existsSync(baseDir)) return null;
            // Prioritize ref_frame for direct assembly, then scene_ for generated ones
            const prefixes = [`ref_frame_${idx}`, `scene_${idx}`, `image_${idx}`];
            const match = fs.readdirSync(baseDir)
                .filter(f => (prefixes.some(p => f.startsWith(p))) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                .sort()
                .pop();
            return match ? path.join(baseDir, match) : null;
        };

        const getExt = (p) => p.endsWith('.png') ? 'png' : 'jpeg';
        const videoPath = path.join(baseDir, `video_${videoIndex + 1}.mp4`);

        const constructionAudioRule = 'SOUND DESIGN: continuous raw construction-site ambience only: excavator engines, crane hydraulics, concrete mixers, drills, saws, hammers, metal clanks, gravel movement, wind, and dust.';
        const surrealAudioRule = 'SOUND DESIGN: surreal cinematic ambience only: deep sub-bass resonance, crystalline harmonics, distorted wind, slow material morphing textures, and low transformation drones.';
        const transformAudioRule = 'AUDIO: mechanical activation sounds — energy hum building up, clicking panels unlocking, precision gear mechanisms locking, plasma charge-up whine, heavy metallic clank when weapon fully forms, subtle electronic power-on tone.';
        const activeAudioRule = currentMode === 'surreal' ? surrealAudioRule
            : currentMode === 'transform' ? transformAudioRule
            : constructionAudioRule;

        // ── TRANSFORM MODE: each video uses ONLY its own corresponding capsule image ──
        if (currentMode === 'transform') {
            const capsuleImgPath = findImage(videoIndex + 1);
            if (!capsuleImgPath || !fs.existsSync(capsuleImgPath)) {
                throw new Error(`Capsule Image ${videoIndex + 1} not found. Please generate it first.`);
            }
            console.log(`[Timelapse/Transform] Generating Video ${videoIndex + 1} — Transformation from Capsule ${videoIndex + 1}...`);
            const capsuleB64 = fs.readFileSync(capsuleImgPath, { encoding: 'base64' });

            const transformVideoPrefix = `DURATION: exactly 8 seconds. CAMERA: completely stationary, locked, 35mm lens, elevated 25-degree angle looking down from above, the artifact lies on a wooden lacquered table with worn lacquer and scratches.

CRITICAL PACING (NO INITIAL DELAY): The action must start IMMEDIATELY at 0:00. Do NOT wait or pause at the beginning.
SCENE STRUCTURE:
0.0-1.5 sec — Video starts. A person's hand (or both hands) enters the frame, takes the artifact from the wooden table, and it instantly activates with a bright energy flash as the transformation begins. No idle waiting.
1.5-6.5 sec — EXTREMELY DETAILED, SLOW TRANSFORMATION. The object expands piece by piece into a sci-fi weapon while being held. Show complex internal mechanisms, micro-motors, gears, and glowing energy cores. The barrel extends, the handle forms, and the sights lock into place. This process must be highly detailed, deliberate, and clearly visible, taking up the majority of the video.
6.5-7.5 sec — The transformation completes. The person firmly grips the fully formed weapon. Realistic weight response and hand movement.
7.5-8.0 sec — The weapon is held still in the hand, locked and loaded. Final energy pulse.

QUALITY: Photorealistic skin, realistic mechanical motion, Hollywood sci-fi quality, industrial hard-surface design. Smooth camera, no shaking, no cuts, no scene changes. Ultra realistic, high detail, dramatic lighting, premium VFX, viral TikTok style.
Negative: ugly hands, deformed fingers, blurry hand, extra digits, text, watermark. `;

            const generatedVideoPath = await ai.generateVideo({
                prompt: `${transformVideoPrefix}${activeAudioRule} ${prompt}`,
                model: videoModel || 'veo_31_lite',
                sectionDir: TIMELAPSE_DIR,
                subFolder: subFolder,
                sceneIndex: videoIndex,
                mode: 'start_image',
                resolution: '720p',
                referenceImages: [
                    { data: `data:image/${getExt(capsuleImgPath)};base64,${capsuleB64}` }
                ]
            });
            if (generatedVideoPath !== videoPath) fs.copyFileSync(generatedVideoPath, videoPath);
            return `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        }

        // ── Final video: Cinematic tour, uses only final image as start frame ──
        if (videoIndex === STAGE_COUNT - 1) {
            const startImgPath = findImage(STAGE_COUNT);
            if (!startImgPath || !fs.existsSync(startImgPath)) {
                throw new Error(`Image ${STAGE_COUNT} (FINAL REVEAL) not found. Please generate it first.`);
            }
            console.log(`[Timelapse] Generating Video ${STAGE_COUNT} — Cinematic Tour (start: Image ${STAGE_COUNT})...`);
            const startB64 = fs.readFileSync(startImgPath, { encoding: 'base64' });
            const generatedVideoPath = await ai.generateVideo({
                prompt: `CINEMATIC ORBITAL REVEAL. SMOOTH DRONE ARC MOVEMENT. ${activeAudioRule} ${prompt}`,
                model: videoModel || 'veo_31_lite',
                sectionDir: TIMELAPSE_DIR,
                subFolder: subFolder,
                sceneIndex: videoIndex,
                mode: 'start_image',
                resolution: '720p',
                referenceImages: [
                    { data: `data:image/${getExt(startImgPath)};base64,${startB64}` }
                ]
            });
            if (generatedVideoPath !== videoPath) fs.copyFileSync(generatedVideoPath, videoPath);
            return `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        }

        // ── Transition videos between two frames ───────────────────────────────
        const startImgPath = findImage(videoIndex + 1);
        const endImgPath = findImage(videoIndex + 2);

        if (!startImgPath || !fs.existsSync(startImgPath)) {
            throw new Error(`Start Image ${videoIndex + 1} not found in ${baseDir}.`);
        }
        if (!endImgPath || !fs.existsSync(endImgPath)) {
            throw new Error(`End Image ${videoIndex + 2} not found. Please generate it first for the transition.`);
        }

        console.log(`[Timelapse] Generating Video ${videoIndex + 1} (Transition ${videoIndex + 1} -> ${videoIndex + 2})...`);

        const startB64 = fs.readFileSync(startImgPath, { encoding: 'base64' });
        const endB64 = fs.readFileSync(endImgPath, { encoding: 'base64' });

        // Mode `start_end_image` enables smooth transition between two frames; omni_flash does not support it, so use components
        const generatedVideoPath = await ai.generateVideo({
            prompt: `STATIC CAMERA. TIMELAPSE TRANSITION. ${activeAudioRule} ${prompt}`,
            model: videoModel || 'veo_31_lite', 
            sectionDir: TIMELAPSE_DIR,
            subFolder: subFolder,
            sceneIndex: videoIndex,
            mode: videoModel === 'omni_flash' ? 'components' : 'start_end_image',
            resolution: '720p',
            referenceImages: [
                { data: `data:image/${getExt(startImgPath)};base64,${startB64}` },
                { data: `data:image/${getExt(endImgPath)};base64,${endB64}` }
            ]
        });

        if (generatedVideoPath !== videoPath) {
            fs.copyFileSync(generatedVideoPath, videoPath);
        }
        
        return `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    ipcMain.handle('timelapse-assemble', async (event, { subFolder, projectTitle }) => {
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        const safeTitle = typeof projectTitle === 'string' && projectTitle.trim()
            ? projectTitle
                .trim()
                .replace(/[^a-z0-9\s_-]/gi, '')
                .replace(/\s+/g, '_')
                .slice(0, 80)
            : 'timelapse_final';
        const finalPath = path.join(baseDir, `${safeTitle}_${Date.now()}.mp4`);
        const listPath = path.join(baseDir, 'filelist.txt');
        
        const videos = Array.from({ length: STAGE_COUNT }, (_, i) => path.join(baseDir, `video_${i + 1}.mp4`));

        for (let i = 0; i < videos.length; i++) {
            if (!fs.existsSync(videos[i])) {
                // Fallback to root TIMELAPSE_DIR if video was generated before the path fix
                const fallback = path.join(TIMELAPSE_DIR, `video_${i + 1}.mp4`);
                if (fs.existsSync(fallback)) {
                    videos[i] = fallback;
                } else {
                    throw new Error(`Missing video_${i + 1}.mp4 in project folder or root folder.`);
                }
            }
        }

        fs.writeFileSync(listPath, videos.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
        const tempPath = path.join(baseDir, `temp_${Date.now()}.mp4`);

        const musicDir = path.join(__dirname, 'Music');
        const musicFiles = fs.existsSync(musicDir)
            ? fs.readdirSync(musicDir).filter(f => /\.(mp4|mp3|wav)$/i.test(f))
            : [];
        const bgMusicPath = musicFiles.length > 0
            ? path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)])
            : null;

        return new Promise((resolve, reject) => {
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', tempPath]);

            concat.on('close', code => {
                if (code !== 0) return reject(new Error('FFmpeg concat failed.'));
                try {
                    if (!bgMusicPath) {
                        fs.copyFileSync(tempPath, finalPath);
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        return resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                    }

                    const { execSync } = require('child_process');
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString().trim();
                    const duration = parseFloat(durationStr);
                    const fadeStart = Math.max(0, duration - 2);

                    const mixArgs = [
                        '-i', tempPath,
                        '-stream_loop', '-1',
                        '-i', bgMusicPath,
                        '-filter_complex', `[0:a]volume=1.0[main];[1:a]volume=0.9[bgm];[main][bgm]amix=inputs=2:duration=first[raw];[raw]afade=t=out:st=${fadeStart}:d=2[a]`,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-shortest',
                        '-y', finalPath
                    ];

                    const mix = spawn('ffmpeg', mixArgs);

                    mix.on('close', (mixCode) => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        if (mixCode === 0) {
                            resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                        } else reject(new Error('Audio mix failed'));
                    });
                } catch (e) {
                    console.error('Timelapse audio mix error:', e);
                    reject(e);
                }
            });
        });
    });
}

module.exports = { registerTimelapseHandlers };
