const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const { callPollinations } = require('./skeleton-handlers.cjs'); // Reuse the LLM caller
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

const TIMELAPSE_DIR = path.join(__dirname, 'CinematicTimelapse');
if (!fs.existsSync(TIMELAPSE_DIR)) fs.mkdirSync(TIMELAPSE_DIR, { recursive: true });

const MASTER_PROMPT = `
You are a Master Construction Engineer and Cinematic Director specializing in hyper-realistic construction timelapse sequences.

═══════════════════════════════════════════════════════════════════════════════
CORE MISSION: Create PHYSICALLY ACCURATE, STRUCTURALLY CORRECT construction sequences
═══════════════════════════════════════════════════════════════════════════════

CRITICAL RULES — PHYSICAL REALISM:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NO MAGIC TRANSFORMATIONS — Every stage must show realistic construction progression
2. NO FLOATING EQUIPMENT — All machinery MUST be on solid ground with visible contact
3. NO WALKING ON WATER — Workers and equipment only on solid surfaces or proper scaffolding
4. NO INSTANT MATERIALIZATION — Materials appear through realistic delivery and installation
5. GRAVITY EXISTS — All objects obey physics, proper support structures visible
6. SEQUENTIAL LOGIC — Each stage must be buildable from the previous stage
7. PROPER FOUNDATION — Nothing can be built without proper ground preparation first

CONSTRUCTION SEQUENCE TEMPLATES BY PROJECT TYPE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🏗️ NEW BUILDING CONSTRUCTION (House, Commercial, Multi-story):
────────────────────────────────────────────────────────────────────────────────
STAGE 1 — SITE PREPARATION & FOUNDATION (Week 1-2):
• Excavation equipment (excavator, bulldozer) on site with visible tracks
• Deep excavation pit with exposed earth layers, proper slope angles
• Foundation formwork visible, rebar grid laid out on compacted gravel base
• Concrete mixer trucks positioned on access road (NOT in the pit)
• Workers in hard hats and hi-vis vests measuring and checking levels
• Temporary fencing, material stockpiles, site office trailer
• CAMERA: High drone angle 45°, showing full site context and access roads

STAGE 2 — STRUCTURAL FRAME & WALLS (Week 3-6):
• Concrete foundation fully cured, visible above ground level
• Structural frame erected: steel beams OR concrete columns OR timber frame
• Scaffolding surrounding the structure with safety netting
• Crane positioned on stable ground, lifting materials (if multi-story)
• Wall framing in progress: brick laying OR concrete blocks OR timber studs
• Roof trusses being installed or flat roof deck visible
• Material pallets, cement bags, stacked bricks on ground near structure
• Workers actively building, realistic work-in-progress state
• CAMERA: Same angle, showing vertical growth and structural skeleton

STAGE 3 — ENVELOPE & SYSTEMS (Week 7-10):
• Exterior walls completed: brick facade OR stucco OR siding fully installed
• Roof covering installed: tiles OR metal sheets OR membrane visible
• Windows and doors installed in openings, frames visible
• Scaffolding partially removed or relocated to detail areas
• Interior rough-ins visible through windows: electrical conduits, plumbing pipes
• HVAC equipment on roof or ground (if applicable)
• Exterior insulation, waterproofing layers visible in cross-section areas
• Site cleanup beginning, some equipment removed
• CAMERA: Same angle, structure now weather-tight and recognizable

STAGE 4 — FINISHING & LANDSCAPING (Week 11-14):
• All scaffolding removed, clean exterior surfaces
• Final exterior details: painted trim, gutters, downspouts, lighting fixtures
• Landscaping completed: graded soil, grass/plants, paved walkways/driveway
• Outdoor features: deck, patio, fence (if applicable)
• Interior visible through windows: finished walls, lighting, furnishings (if shown)
• All construction equipment and materials removed
• Clean, pristine final result with proper site drainage and access
• CAMERA: Same angle, polished final reveal with context

🏊 POOL CONSTRUCTION:
────────────────────────────────────────────────────────────────────────────────
STAGE 1 — EXCAVATION & STEEL FRAMEWORK:
• Excavator digging rectangular pit in backyard, dirt piles on sides
• Exposed earth walls with proper slope, no water (dry excavation)
• Steel rebar grid being assembled on pit floor and walls
• Plumbing pipes laid out: main drain, return lines, skimmer rough-in
• Workers on solid ground around pit edge, NOT inside deep pit
• CAMERA: High angle showing pit depth and surrounding yard context

STAGE 2 — CONCRETE SHELL & PLUMBING:
• Concrete poured and cured, forming solid pool shell (gunite or shotcrete)
• Visible texture of raw concrete, no finish yet
• Plumbing fixtures installed: skimmer box, return jets, main drain cover
• Equipment pad poured: concrete slab for pump and filter
• Pool equipment staged on pad: pump, filter, heater (not yet connected)
• Backfill around pool exterior, compacted soil
• CAMERA: Same angle, showing solid structure taking shape

STAGE 3 — TILE, COPING & EQUIPMENT:
• Pool interior surface applied: plaster OR tile OR pebble finish
• Coping stones installed around pool edge (stone, brick, or concrete)
• Pool equipment fully installed and plumbed: pump running, filter connected
• Deck area prepared: forms for concrete deck or pavers base laid
• Pool still empty but finished interior visible
• CAMERA: Same angle, showing refined details

STAGE 4 — FILLED & LANDSCAPING:
• Pool filled with crystal clear water, proper water level at skimmer
• Deck completed: stamped concrete OR pavers OR natural stone
• Landscaping around pool: plants, grass, decorative rocks
• Pool furniture, lighting, safety features (ladder, handrails)
• Equipment running, water circulation visible
• CAMERA: Same angle, inviting final result

🛠️ RENOVATION / REMODEL:
────────────────────────────────────────────────────────────────────────────────
STAGE 1 — EXISTING CONDITION & DEMOLITION START:
• Original space as-is: old finishes, dated fixtures, wear visible
• Demolition in progress: partial wall removal, old flooring torn up
• Debris piles, construction dumpster on site
• Protective plastic sheeting, dust containment measures
• Workers with demolition tools (sledgehammer, pry bars)
• CAMERA: Fixed interior angle showing full room

STAGE 2 — STRUCTURAL CHANGES & ROUGH-INS:
• Walls opened up, new framing installed (if layout changed)
• New electrical wiring, junction boxes, conduit visible
• New plumbing pipes, drain lines, supply lines installed
• HVAC ducts or vents added/relocated
• Subfloor repairs, new underlayment installed
• Insulation added in walls/ceiling (if visible)
• CAMERA: Same angle, showing infrastructure upgrades

STAGE 3 — FINISHES INSTALLATION:
• Drywall installed and taped, ready for paint OR new wall finish
• Flooring installed: hardwood, tile, carpet (in progress or completed)
• Cabinets installed (kitchen/bath), countertops templated or placed
• New windows/doors installed (if part of scope)
• Painting in progress: primer, base coat visible
• CAMERA: Same angle, space taking new form

STAGE 4 — COMPLETED & FURNISHED:
• All finishes complete: painted walls, finished floors, trim installed
• Fixtures installed: lighting, plumbing fixtures, hardware
• Appliances in place (if kitchen/bath)
• Furniture arranged, decor added, space fully styled
• Clean, polished, magazine-quality final result
• CAMERA: Same angle, stunning transformation reveal

🏗️ INFRASTRUCTURE (Bridge, Road, Tunnel):
────────────────────────────────────────────────────────────────────────────────
STAGE 1 — SITE PREP & FOUNDATION:
• Heavy equipment on site: excavators, pile drivers, cranes
• Foundation work: pilings driven, caissons drilled, footings poured
• Temporary access roads, work platforms on solid ground
• Surveying equipment, layout stakes, safety barriers
• CAMERA: Wide angle showing full project scope

STAGE 2 — STRUCTURAL ELEMENTS:
• Main structural components: bridge piers, abutments, deck supports
• Formwork and rebar for concrete pours
• Steel beams being lifted and positioned by cranes
• Workers on scaffolding and work platforms (properly supported)
• CAMERA: Same angle, showing vertical/horizontal growth

STAGE 3 — DECK & SURFACE:
• Bridge deck poured or roadway base laid
• Surface paving: asphalt or concrete
• Barriers, railings, safety features installed
• Drainage systems, expansion joints visible
• CAMERA: Same angle, functional structure emerging

STAGE 4 — FINISHING & OPENING:
• Road markings, signage, lighting installed
• Landscaping, erosion control, final grading
• All equipment removed, barriers opened
• Traffic flowing or structure in use
• CAMERA: Same angle, completed infrastructure in context

═══════════════════════════════════════════════════════════════════════════════
PROMPT ENGINEERING RULES FOR EACH STAGE:
═══════════════════════════════════════════════════════════════════════════════

IMAGE PROMPTS — Technical Requirements:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Start with: "Hyper-realistic construction site photography, 8K, sharp focus"
• Specify EXACT camera angle: "High drone angle 45° looking down, vertical 9:16 format"
• List ALL visible elements in order: ground → foundation → structure → equipment → workers → sky
• Materials: Specify textures (rough concrete, weathered wood, rusted steel, fresh paint)
• Lighting: "Natural daylight, soft shadows, construction site lighting" (consistent across all stages)
• Weather: Keep consistent (sunny, overcast, golden hour) across all 4 stages
• NO BLUR, NO MOTION — Static, crystal-clear architectural photography
• Include: "Physically accurate construction staging, all equipment on solid ground, realistic work-in-progress"

VIDEO PROMPTS — Motion Requirements:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• CAMERA: "LOCKED CAMERA POSITION. NO camera movement. Static timelapse perspective."
• MOTION: "Time-lapse construction progression. Workers moving naturally. Equipment operating realistically."
• PHYSICS: "All objects obey gravity. Equipment on ground. Materials delivered and placed logically."
• TRANSITIONS: "Smooth progression from start frame to end frame. No instant teleportation. Gradual build-up."
• FORBIDDEN: "NO floating objects, NO levitating equipment, NO walking on water, NO instant materialization, NO magic transformations"
• Include: "Realistic construction activity, proper safety equipment, logical material flow, temporal consistency"

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT (STATE 2 — IDEA GENERATION):
═══════════════════════════════════════════════════════════════════════════════
When user asks for ideas, output exactly this JSON:
{
  "environments": [
    {
      "id": 1,
      "ru": "ПОЛНОЕ описание проекта (2-3 предложения): ТИП ОБЪЕКТА + ЛОКАЦИЯ + КЛЮЧЕВЫЕ ЭТАПЫ СТРОИТЕЛЬСТВА + ВИЗУАЛЬНЫЙ ВАУ-ЭФФЕКТ + ФИНАЛЬНЫЙ РЕЗУЛЬТАТ. Пример: 'Строительство современного двухэтажного дома с бассейном в пригороде. От рытья котлована и заливки фундамента до установки крыши и ландшафтного дизайна. Реалистичная работа техники, поэтапное возведение стен, монтаж окон. Финал: роскошный дом с благоустроенной территорией.'",
      "en": "FULL project description (2-3 sentences): OBJECT TYPE + LOCATION + KEY CONSTRUCTION STAGES + CINEMATIC HOOK + FINAL RESULT. Example: 'Modern two-story house with pool construction in suburban area. From excavation and foundation pour to roof installation and landscaping. Realistic equipment operation, progressive wall construction, window installation. Final: luxurious house with landscaped grounds.'"
    }
  ]
}

IMPORTANT: Generate exactly 4 diverse construction project ideas. Each must specify:
- Project type (house, pool, renovation, commercial, infrastructure)
- Location context (suburban, urban, rural, coastal)
- Key construction stages that will be shown
- Unique visual appeal (architectural style, scale, complexity)

═══════════════════════════════════════════════════════════════════════════════
TECHNICAL PROCESS SPECIFICATION (TPS) — MANDATORY FIRST STEP:
═══════════════════════════════════════════════════════════════════════════════
Before writing ANY image or video prompt, you MUST define the domain-specific
visual dictionary for THIS EXACT project type. This prevents AI hallucinations
where wrong materials, wrong structures, or wrong architectural styles appear.

TPS must include:
1. OBJECT IDENTITY — Exact name, category, and sub-type of the structure
2. DOMAIN GLOSSARY — Critical components with their EXACT visual descriptions
   (materials, shapes, proportions, colors — SPECIFIC to this domain)
3. FORBIDDEN SUBSTITUTIONS — What must NEVER appear (residential elements on
   marine structures, wrong glass types, wrong frame materials, etc.)
4. VISUAL ANCHORS — 3-5 key visual details that make this object unmistakable
   (e.g. for yacht: teak decking, marine-grade aluminum extrusions, horizontal
   flush-mount tempered glass, stainless steel railings)

OUTPUT FORMAT (STATE 3 — DETAILED PROMPTS):
═══════════════════════════════════════════════════════════════════════════════
Output exactly as JSON:
{
  "projectType": "house|pool|renovation|commercial|infrastructure|marine|industrial|landscape",
  "projectTitle": "Short catchy English title, max 5 words, TikTok-ready (e.g. 'Coastal Villa From Zero', 'Urban Loft Transformation')",
  "tiktokDescription": "Engaging 2-sentence English description for TikTok/Reels caption (e.g. 'Watch this massive coastal villa emerge from the sand. The final pool area is unreal! 🤯')",
  "tiktokHashtags": "5 hyper-relevant English hashtags without the # symbol separated by spaces (e.g. 'construction architecture timelapse luxuryhome build')",
  "contextConfirmation": "Technical confirmation of project type and construction sequence to be followed",
  "technicalProcessSpec": {
    "objectIdentity": "Exact type and subtype of the object being built/renovated",
    "domainGlossary": {
      "componentName": "Exact visual description: material, shape, color, proportion",
      "anotherComponent": "..."
    },
    "forbiddenSubstitutions": ["List of things that MUST NEVER appear in any frame"],
    "visualAnchors": ["3-5 unmistakable visual details unique to this object/domain"]
  },
  "images": [
     {
       "id": 1,
       "title": "Stage 1: [ZERO STATE / SITE PREPARATION]",
       "prompt": "[DETAILED IMAGE PROMPT — raw site, empty state, preparation works. MUST reference visualAnchors from TPS. 150-250 words]",
       "technicalNotes": "Key elements: [list critical elements that MUST be visible. Include FORBIDDEN items from TPS]"
     },
     { "id": 2, "title": "Stage 2: [FOUNDATION / HULL / BASE WORKS]", "prompt": "...", "technicalNotes": "..." },
     { "id": 3, "title": "Stage 3: [PRIMARY STRUCTURE — 30-50%]", "prompt": "...", "technicalNotes": "..." },
     { "id": 4, "title": "Stage 4: [PRIMARY STRUCTURE — 70-80%]", "prompt": "...", "technicalNotes": "..." },
     { "id": 5, "title": "Stage 5: [SYSTEMS & FINISHING DETAILS]", "prompt": "...", "technicalNotes": "..." },
     { "id": 6, "title": "Stage 6: [FINAL COMPLETE STATE]", "prompt": "...", "technicalNotes": "..." }
  ],
  "videos": [
     {
       "id": 1,
       "title": "Video 1: [STAGE 1 → STAGE 2 TRANSITION]",
       "prompt": "[DETAILED VIDEO PROMPT with: domain-specific materials from TPS, physics rules, camera lock, forbidden substitutions explicitly stated, realistic progression. 150-200 words]",
       "keyActions": "[Specific construction activities visible in this transition]"
     },
     { "id": 2, "title": "Video 2: [STAGE 2 → STAGE 3 TRANSITION]", "prompt": "...", "keyActions": "..." },
     { "id": 3, "title": "Video 3: [STAGE 3 → STAGE 4 TRANSITION]", "prompt": "...", "keyActions": "..." },
     { "id": 4, "title": "Video 4: [STAGE 4 → STAGE 5 TRANSITION]", "prompt": "...", "keyActions": "..." },
     { "id": 5, "title": "Video 5: [STAGE 5 → STAGE 6 TRANSITION]", "prompt": "...", "keyActions": "..." },
     { "id": 6, "title": "Video 6: Final Cinematic Tour", "prompt": "SLOW SMOOTH CAMERA MOVEMENT around completed project. [Details of final reveal using exact domain-specific visual anchors from TPS]", "keyActions": "Cinematic reveal of finished project" }
   ],
   "engineerNotes": "Construction sequence validation: [Confirm each stage is buildable from previous stage, all physics rules followed, no forbidden substitutions, TPS visual anchors present in all prompts]"
}

CRITICAL:
- TPS domainGlossary must be populated BEFORE writing any prompt
- Each image prompt MUST reference at least 3 visual anchors from TPS
- Each video prompt MUST explicitly list 2-3 FORBIDDEN items specific to this domain
- Stages must follow logical construction sequence for the project type
- NO generic descriptions — be specific about materials, equipment, actions
- 6 stages = smaller jumps between frames = less room for AI hallucinations
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

function registerTimelapseHandlers(ipcMain) {
    let conversationHistory = [];

    ipcMain.handle('timelapse-get-environments', async () => {
        conversationHistory = [
            { role: 'system', content: MASTER_PROMPT },
            {
                role: 'user',
                content: 'STATE 2: Generate exactly 4 full cinematic construction/design timelapse project idea cards. Return only JSON in the STATE 2 format.'
            }
        ];

        console.log('[Timelapse] Requesting State 2 Environments...');
        const response = await callPollinations(conversationHistory, true);
        conversationHistory.push({ role: 'assistant', content: response });

        // Parse JSON array from response
        try {
            const cleanJson = response.match(/\[[\s\S]*\]/)?.[0] || response.match(/\{[\s\S]*\}/)?.[0] || response;
            const parsed = JSON.parse(cleanJson);
            const ideas = normalizeEnvironmentIdeas(parsed);
            if (ideas && ideas.length > 0) return ideas;
        } catch (e) {
            console.warn('[Timelapse] JSON parse failed, falling back to line parse:', e.message);
        }
        // Fallback: wrap plain lines as objects
        const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 10).slice(0, 4);
        return lines.map((l, i) => ({ id: i + 1, en: l, ru: l }));
    });

    ipcMain.handle('timelapse-generate-prompts', async (event, { selectionIndex, selectedEnv }) => {
        console.log(`[Timelapse] Requesting State 3 for Env #${selectionIndex}`);
        conversationHistory.push({
            role: 'user',
            content: `STATE 3: I select option ${selectionIndex}. Selected idea: ${JSON.stringify(selectedEnv)}. Return only JSON in the STATE 3 format.`
        });

        const rawJsonString = await callPollinations(conversationHistory, true);
        conversationHistory.push({ role: 'assistant', content: rawJsonString });

        try {
            const cleanJson = rawJsonString.match(/\{[\s\S]*\}/)?.[0] || rawJsonString;
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error('[Timelapse] Failed to parse JSON:', rawJsonString);
            throw new Error('LLM failed to output valid JSON for State 3. Please reset and try again.');
        }
    });

    ipcMain.handle('timelapse-generate-custom-prompts', async (event, { customIdea, images, video }) => {
        console.log(`[Timelapse] Requesting State 3 with CUSTOM IDEA. Images: ${images?.length || 0}, Video: ${!!video}`);
        
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

        // If video is provided, extract 4 key frames (0%, 33%, 66%, 100%)
        if (video) {
            try {
                console.log('[Timelapse] Extracting frames from reference video...');
                const tempVideoPath = path.join(os.tmpdir(), `ref_video_${Date.now()}.mp4`);
                const videoData = video.split(';base64,').pop();
                fs.writeFileSync(tempVideoPath, videoData, 'base64');

                const duration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`).toString().trim());
                
                for (let i = 0; i < 4; i++) {
                    const timestamp = (duration * (i / 3)).toFixed(2);
                    const frameName = `ref_frame_${i + 1}.jpg`;
                    const framePath = path.join(baseDir, frameName);
                    
                    // Extract frame with high quality but reasonable size
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

        const content = [
            { type: 'text', text: `You are a Visual Replication Specialist. 
            
            CRITICAL TASK: 
            Analyze the provided images/frames (sent in chronological order) and extract the 'Visual DNA'.
            1. What is the main structure and site? 
            2. Replicate the materials, architecture, and lighting EXACTLY.
            3. Observe the progression from the first frame to the last.

            STRICT RULE: 
            Stage 1 MUST be a 100% literal description of the FIRST image/frame provided. 
            
            Output the 4-stage pipeline in JSON format as per the system instructions.` }
        ];

        finalImagesForLLM.forEach((base64) => {
            const cleanBase64 = base64.includes('base64,') ? base64 : `data:image/jpeg;base64,${base64}`;
            content.push({
                type: 'image_url',
                image_url: { url: cleanBase64, detail: 'high' }
            });
        });

        const customConversation = [
            { role: 'system', content: MASTER_PROMPT },
            { role: 'user', content: content }
        ];

        const rawJsonString = await callPollinations(customConversation, true);
        
        try {
            const cleanJson = rawJsonString.match(/\{[\s\S]*\}/)?.[0] || rawJsonString;
            const parsed = JSON.parse(cleanJson);
            return { ...parsed, referenceFrames, subFolder: tid }; 
        } catch (e) {
            console.error('[Timelapse] Failed to parse custom JSON. Raw string:', rawJsonString);
            throw new Error('LLM response format error. Please try again.');
        }
    });

    ipcMain.handle('timelapse-generate-image', async (event, { imgIndex, prompt, model, subFolder, referenceImage }) => {
        // imgIndex is 0 to 3, representing Image 1 to 4
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        console.log(`[Timelapse] Generating Image ${imgIndex + 1} with model ${model || 'imagen4'}...`);

        // --- Reference image: prioritize user reference if provided ---
        const finalRefImages = [];
        if (referenceImage) {
            console.log(`[Timelapse] Using USER REFERENCE for Stage ${imgIndex + 1} (STRICT REPLICATION)`);
            finalRefImages.push({ data: referenceImage.includes('base64,') ? referenceImage : `data:image/jpeg;base64,${referenceImage}` });
        } else if (imgIndex > 0 && fs.existsSync(baseDir)) {
            // Look for scene_{imgIndex}_*.jpg (the PREVIOUS image, 1-indexed = imgIndex)
            const prevFiles = fs.readdirSync(baseDir)
                .filter(f => f.startsWith(`scene_${imgIndex}_`) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                .sort();
            if (prevFiles.length > 0) {
                const prevPath = path.join(baseDir, prevFiles[prevFiles.length - 1]);
                const ext = prevPath.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(prevPath, { encoding: 'base64' });
                finalRefImages.push({ data: `data:image/${ext};base64,${b64}` });
                console.log(`[Timelapse] Using previous image as reference: ${prevFiles[prevFiles.length - 1]}`);
            }
        }

        // Reinforce spatial consistency in the prompt
        const stageLabels = ['ZERO STATE', 'FOUNDATION WORKS', 'PRIMARY STRUCTURE 40%', 'PRIMARY STRUCTURE 75%', 'SYSTEMS & FINISHING', 'FINAL COMPLETE STATE'];
        const consistencyPrefix = imgIndex > 0
            ? `CRITICAL CONSISTENCY RULE: This is the EXACT SAME ROOM as the reference image. Identical camera position, lens angle, ceiling height, wall proportions, window placement, floor area. Do NOT change the spatial layout. Only show the transformation stage: ${stageLabels[imgIndex]}. `
            : '';

        const finalPrompt = consistencyPrefix + prompt;

        // Use I2I strength: low (0.2-0.4) for user refs to keep it identical, 0.6 for internal consistency
        const useStrength = referenceImage ? (imgIndex === 0 ? 0.2 : 0.4) : 0.6;

        const savedPaths = await generateImageViaGLabs({
            prompt: finalPrompt,
            model: model || 'imagen4',
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

    ipcMain.handle('timelapse-generate-video', async (event, { videoIndex, prompt, subFolder }) => {
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

        // ── PHYSICS & REALISM ENFORCEMENT for all videos ────────────────────────
        const physicsRules = `CRITICAL PHYSICS RULES: All equipment and materials MUST remain on solid ground throughout the entire video. NO floating objects. NO levitating machinery. NO walking on water or air. Workers only on stable surfaces or proper scaffolding. All construction activity follows real-world physics and gravity. Smooth, realistic time-lapse progression with logical material flow and equipment movement.`;

        const cameraLock = `CAMERA: COMPLETELY LOCKED POSITION. Absolutely NO camera movement, NO panning, NO zooming, NO tilting. Fixed high-angle drone perspective (9:16 vertical format). Only the construction site changes, camera stays frozen in space.`;

        const audioRules = `AUDIO GENERATION INSTRUCTIONS: DO NOT GENERATE ANY MUSIC. The video must contain ONLY the authentic, raw ambient sounds of the physical environment and construction activity (machinery working, tools, natural ambient noise). NO background music, NO cinematic scores, NO artificial soundtracks.`;

        // ── Video 6: Cinematic tour, uses only Image 6 as start frame ──────────
        if (videoIndex === 5) {
            const startImgPath = findImage(6);
            if (!startImgPath || !fs.existsSync(startImgPath)) {
                throw new Error('Image 6 (FINAL STAGE) not found. Please generate it first.');
            }
            console.log(`[Timelapse] Generating Video 6 — Cinematic Tour (start: Image 6)...`);
            const startB64 = fs.readFileSync(startImgPath, { encoding: 'base64' });

            // Video 6 is the ONLY video with camera movement (cinematic reveal)
            const enhancedPrompt = `CINEMATIC FINAL REVEAL. SLOW SMOOTH CAMERA MOVEMENT: gentle orbital drift around the completed project, revealing all angles and details. ${prompt} Hyper-realistic architectural cinematography, 8K quality, natural lighting, showcasing the finished construction in its full glory. NO construction activity, NO workers, NO equipment — only the pristine completed project. Smooth, professional camera work, breathtaking final showcase. ${audioRules}`;

            const generatedVideoPath = await generateVideoViaGLabs({
                prompt: enhancedPrompt,
                model: 'veo_31_lite',
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

        // ── Videos 1-3: Transition between two frames ───────────────────────────
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

        // Enhanced prompt with strict physics and camera rules
        const enhancedPrompt = `CONSTRUCTION TIMELAPSE TRANSITION. ${cameraLock} ${physicsRules} ${audioRules} ${prompt} TIME-LAPSE PROGRESSION: Smooth, realistic construction activity showing gradual transformation from start frame to end frame. Workers moving naturally, equipment operating on ground level, materials being delivered and installed logically. NO instant teleportation of objects. NO magic transformations. Natural daylight, construction site atmosphere, hyper-realistic 8K quality. Temporal consistency maintained throughout.`;

        // Mode `start_end_image` enables smooth transition between two frames
        const generatedVideoPath = await generateVideoViaGLabs({
            prompt: enhancedPrompt,
            model: 'veo_31_lite',
            sectionDir: TIMELAPSE_DIR,
            subFolder: subFolder,
            sceneIndex: videoIndex,
            mode: 'start_end_image',
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

        let safeTitle = "timelapse_final";
        if (projectTitle && typeof projectTitle === 'string') {
            safeTitle = projectTitle
                .replace(/[^a-z0-9а-яё\s]/gi, '') // удаляем спецсимволы
                .replace(/\s+/g, '_')            // пробелы меняем на подчеркивания
                .substring(0, 50)                // ограничиваем длину
                .trim();
            if (!safeTitle) safeTitle = "timelapse_final";
        }

        const finalPath = path.join(baseDir, `${safeTitle}_${Date.now()}.mp4`);
        const listPath = path.join(baseDir, 'filelist.txt');
        
        const videos = [
            path.join(baseDir, 'video_1.mp4'),
            path.join(baseDir, 'video_2.mp4'),
            path.join(baseDir, 'video_3.mp4'),
            path.join(baseDir, 'video_4.mp4'),
            path.join(baseDir, 'video_5.mp4'),
            path.join(baseDir, 'video_6.mp4')
        ];

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
        const tempPath = path.join(TIMELAPSE_DIR, 'temp.mp4');

        // Bouncy swing-pop music
        const musicDir = path.join('D:', 'Open_Project', 'AISTUDIO', 'Music');
        const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.wav')) : [];
        const bgMusicPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[Math.floor(Math.random() * musicFiles.length)]) : null;

        return new Promise((resolve, reject) => {
            // Lossless concatenation using stream copy instead of re-encoding
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', tempPath]);

            concat.on('close', code => {
                if (code !== 0) return reject(new Error('FFmpeg concat failed.'));
                if (!bgMusicPath) {
                    fs.renameSync(tempPath, finalPath);
                    return resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }

                try {
                    const { execSync } = require('child_process');
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString().trim();
                    const duration = parseFloat(durationStr);
                    const fadeStart = Math.max(0, duration - 2);

                    // [0:a]volume=0.2 - original video volume scaled to 20%
                    // [1:a]volume=1.0,afade... - background music volume normal, fades out last 2 sec
                    // [0:v]crop... - crop 4% from bottom and left (watermark is bottom right), then scale back to 720x1280
                    const filter = `[0:v]crop=in_w*0.96:in_h*0.96:in_w*0.04:0,scale=720:1280[vout];[0:a]volume=0.2[orig];[1:a]volume=1.0,afade=t=out:st=${fadeStart}:d=2[bgm];[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]`;

                    const mix = spawn('ffmpeg', [
                        '-i', tempPath,
                        '-stream_loop', '-1', // Loop background music if it's shorter than video
                        '-i', bgMusicPath,
                        '-filter_complex', filter,
                        '-map', '[vout]',
                        '-map', '[aout]',
                        '-c:v', 'libx264',
                        '-preset', 'fast',
                        '-crf', '23',
                        '-c:a', 'aac',
                        '-shortest', // Cut at the length of the shortest input (video path)
                        '-y', finalPath
                    ]);

                    mix.on('close', (mixCode) => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        if (mixCode === 0) {
                            resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                        } else reject(new Error('Music mix failed'));
                    });
                } catch (e) {
                    console.error('Timelapse Music mix error:', e);
                    fs.renameSync(tempPath, finalPath);
                    resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }
            });
        });
    });
}

module.exports = { registerTimelapseHandlers };
