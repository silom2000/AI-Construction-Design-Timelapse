const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { callPollinations } = require('./skeleton-handlers.cjs'); // Reuse the LLM caller
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

const TIMELAPSE_DIR = path.join(__dirname, 'CinematicTimelapse');
if (!fs.existsSync(TIMELAPSE_DIR)) fs.mkdirSync(TIMELAPSE_DIR, { recursive: true });

const MASTER_PROMPT = `
You are a High-End Structural & Civil Engineering Specialist and Viral Content Architect.
Your task: Generate technically accurate, frame-consistent "impossible construction" timelapses for ANY luxury architectural project.

--- UNIVERSAL CONSTRUCTION PHASES (STRICT PROGRESSION) ---
You must enforce a rigorous, realistic construction sequence regardless of the project type (pool, building, bridge, garden, etc.).
1. STAGE 1: SITE PREPARATION. Original state of the plot. Pristine, untouched or with old structures to be removed. Surveying equipment and initial site marking.
2. STAGE 2: SUBSTRUCTURE & STRUCTURAL FRAME. The raw engineering phase. 
   - VISUALS: Excavated earth, foundations, exposed steel skeletons, rebar cages, raw grey concrete, scaffolding, heavy machinery, dust.
   - [STRICT RULE]: NO FINISHINGS. No glass windows, no paint, no water, no furniture, no decorative lighting. Everything must look raw and industrial.
3. STAGE 3: ENCLOSURE & STRUCTURAL COMPLETION. The "shell" phase. 
   - VISUALS: Walls are closed, glass is installed, roof is on, facade is finished. 
   - [STRICT RULE]: THE STRUCTURE MUST BE EMPTY. No furniture, no interior decor, no water in basins, no decorative landscaping. Site is clean but "cold" and non-functional.
4. STAGE 4: FINAL COMMISSIONING & REVEAL. The "Architectural Digest" phase. 
   - VISUALS: Fully furnished, functional lighting, water features active, perfect landscaping, high-end decor. The glowing masterpiece.

--- STRICT GROUNDING & PHYSICAL RULES ---
- MACHINERY POSITIONING: All heavy equipment MUST be on solid ground, stabilized soil, or reinforced construction platforms. NEVER show machines or humans standing on water or thin air.
- ENGINEER PERSONA: A Lead Engineer in a white hardhat and yellow hi-vis vest must be visible in Stage 2, realistically scaled, overseeing the work with a digital tablet.
- VISUAL CONSISTENCY: Fixed high-angle drone perspective. The background context (house, trees, landscape) must remain static across all 4 stages.

--- TECHNICAL KEYWORDS FOR QUALITY ---
- IMAGES (Nano Banana 2): "8k industrial realism, architectural precision, cinematic depth, realistic raw textures (steel, concrete, glass), volumetric construction dust, sharp structural details, high-end architectural photography."
- VIDEOS (Veo 3.1): "Fluid natural motion, temporal stability, consistent physics, realistic material transformation, no warping, fast-forward construction speed."

--- OUTPUT FORMAT (STATE 3) ---
Output exactly as JSON:
{
  "contextConfirmation": "A technical engineering confirmation of the build sequence.",
  "images": [
     { "id": 1, "title": "Image 1 (BEFORE)", "prompt": "..." },
     { "id": 2, "title": "Image 2 (STRUCTURAL FRAME)", "prompt": "... [STRICT: RAW MATERIALS, SCAFOLDING, NO FINISHINGS]" },
     { "id": 3, "title": "Image 3 (COMPLETED SHELL)", "prompt": "... [STRICT: CLOSED ENCLOSURE, CLEAN BUT COMPLETELY EMPTY/UNFURNISHED]" },
     { "id": 4, "title": "Image 4 (FINAL REVEAL)", "prompt": "... [STRICT: FULLY FUNCTIONAL, FURNISHED, GLOWING LIGHTS]" }
  ],
  "videos": [
     { "id": 1, "title": "Video 1 (Destruction/Excavation)", "prompt": "..." },
     { "id": 2, "title": "Video 2 (Framing & Enclosure)", "prompt": "... [STRICT: SHOW RAPID SKELETON GROWTH]" },
     { "id": 3, "title": "Video 3 (Finishing & Commissioning)", "prompt": "... [STRICT: SHOW LIGHTS TURNING ON AND FURNITURE APPEARING]" },
     { "id": 4, "title": "Video 4 (Cinematic Tour)", "prompt": "..." }
   ],
   "engineerNotes": "Technical summary using industry-standard engineering terms relevant to this specific build."
}

Prompts must be 200+ words, providing a precise technical blueprint for the rendering engine.
`;

// Simple async wait to simulate process if needed
const delay = ms => new Promise(r => setTimeout(r, ms));

function registerTimelapseHandlers(ipcMain) {
    let conversationHistory = [];

    ipcMain.handle('timelapse-get-environments', async () => {
        conversationHistory = [
            { role: 'system', content: MASTER_PROMPT },
            { role: 'user', content: 'start' }
        ];

        console.log('[Timelapse] Requesting State 2 Environments...');
        const response = await callPollinations(conversationHistory, true);
        conversationHistory.push({ role: 'assistant', content: response });

        // Parse JSON array from response
        try {
            const cleanJson = response.match(/\[[\s\S]*\]/)?.[0] || response.match(/\{[\s\S]*\}/)?.[0] || response;
            const parsed = JSON.parse(cleanJson);
            
            // If it's a direct array
            if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 4);
            
            // If it's an object containing an array (common in JSON mode)
            const possibleArray = Object.values(parsed).find(v => Array.isArray(v));
            if (possibleArray && possibleArray.length > 0) return possibleArray.slice(0, 4);
        } catch (e) {
            console.warn('[Timelapse] JSON parse failed, falling back to line parse:', e.message);
        }
        // Fallback: wrap plain lines as objects
        const lines = response.split('\n').map(l => l.trim()).filter(l => l.length > 10).slice(0, 4);
        return lines.map((l, i) => ({ id: i + 1, en: l, ru: l }));
    });

    ipcMain.handle('timelapse-generate-prompts', async (event, { selectionIndex, selectedEnv }) => {
        console.log(`[Timelapse] Requesting State 3 for Env #${selectionIndex}`);
        conversationHistory.push({ role: 'user', content: `I select option ${selectionIndex}` });

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

    ipcMain.handle('timelapse-generate-custom-prompts', async (event, { customIdea }) => {
        console.log(`[Timelapse] Requesting State 3 for CUSTOM IDEA: ${customIdea}`);
        const customConversation = [
            { role: 'system', content: MASTER_PROMPT },
            { role: 'user', content: `I want to build: ${customIdea}. Generate the 4-stage structural timelapse pipeline for this project following all strict engineering rules.` }
        ];

        const rawJsonString = await callPollinations(customConversation, true);
        
        try {
            const cleanJson = rawJsonString.match(/\{[\s\S]*\}/)?.[0] || rawJsonString;
            return JSON.parse(cleanJson);
        } catch (e) {
            console.error('[Timelapse] Failed to parse custom JSON:', rawJsonString);
            throw new Error('LLM failed to output valid JSON for Custom Idea. Please try a different description.');
        }
    });

    ipcMain.handle('timelapse-generate-image', async (event, { imgIndex, prompt, model, subFolder }) => {
        // imgIndex is 0 to 3, representing Image 1 to 4
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });
        console.log(`[Timelapse] Generating Image ${imgIndex + 1} with model ${model || 'imagen4'} in ${subFolder || 'root'}...`);

        // --- Reference image: use previous stage image to preserve proportions ---
        const referenceImages = [];
        if (imgIndex > 0 && fs.existsSync(baseDir)) {
            // Look for scene_{imgIndex}_*.jpg (the PREVIOUS image, 1-indexed = imgIndex)
            const prevFiles = fs.readdirSync(baseDir)
                .filter(f => f.startsWith(`scene_${imgIndex}_`) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                .sort();
            if (prevFiles.length > 0) {
                const prevPath = path.join(baseDir, prevFiles[prevFiles.length - 1]);
                const ext = prevPath.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(prevPath, { encoding: 'base64' });
                referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
                console.log(`[Timelapse] Using previous image as reference: ${prevFiles[prevFiles.length - 1]}`);
            }
        }

        // Reinforce spatial consistency in the prompt
        const stageLabels = ['BEFORE — raw/empty', 'MID-CONSTRUCTION', 'COMPLETED UNFURNISHED', 'FULLY FURNISHED'];
        const consistencyPrefix = imgIndex > 0
            ? `CRITICAL CONSISTENCY RULE: This is the EXACT SAME ROOM as the reference image. Identical camera position, lens angle, ceiling height, wall proportions, window placement, floor area. Do NOT change the spatial layout. Only show the transformation stage: ${stageLabels[imgIndex]}. `
            : '';

        const finalPrompt = consistencyPrefix + prompt;

        // We use G-Labs with nano_banana or imagen4 for photorealism
        const savedPaths = await generateImageViaGLabs({
            prompt: finalPrompt,
            model: model || 'imagen4',
            count: 1,
            sectionDir: TIMELAPSE_DIR,
            subFolder: subFolder,
            sceneIndex: imgIndex,
            referenceImages
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
            const prefixes = [`image_${idx}`, `scene_${idx}`];
            const match = fs.readdirSync(baseDir)
                .filter(f => (prefixes.some(p => f.startsWith(p))) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                .sort()
                .pop();
            return match ? path.join(baseDir, match) : null;
        };

        const getExt = (p) => p.endsWith('.png') ? 'png' : 'jpeg';
        const videoPath = path.join(baseDir, `video_${videoIndex + 1}.mp4`);

        // ── Video 4: Cinematic tour, uses only Image 4 as start frame ──────────
        if (videoIndex === 3) {
            const startImgPath = findImage(4);
            if (!startImgPath || !fs.existsSync(startImgPath)) {
                throw new Error('Image 4 (FULLY FURNISHED) not found. Please generate it first.');
            }
            console.log(`[Timelapse] Generating Video 4 — Cinematic Tour (start: Image 4)...`);
            const startB64 = fs.readFileSync(startImgPath, { encoding: 'base64' });
            const generatedVideoPath = await generateVideoViaGLabs({
                prompt: `CINEMATIC TOUR. SLOW SMOOTH CAMERA MOVEMENT. ${prompt}`,
                model: 'veo_31_fast',
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

        // Mode `start_end_image` enables smooth transition between two frames
        const generatedVideoPath = await generateVideoViaGLabs({
            prompt: `STATIC CAMERA. TIMELAPSE TRANSITION. ${prompt}`,
            model: 'veo_31_fast', 
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

    ipcMain.handle('timelapse-assemble', async (event, { subFolder }) => {
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        const finalPath = path.join(baseDir, `timelapse_final_${Date.now()}.mp4`);
        const listPath = path.join(baseDir, 'filelist.txt');
        
        const videos = [
            path.join(baseDir, 'video_1.mp4'),
            path.join(baseDir, 'video_2.mp4'),
            path.join(baseDir, 'video_3.mp4'),
            path.join(baseDir, 'video_4.mp4')
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
        const musicDir = path.join(__dirname, 'Music');
        const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.wav')) : [];
        const bgMusicPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : null;

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
                    const filter = `[1:a]volume=0.1,afade=t=out:st=${fadeStart}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]`;

                    const mix = spawn('ffmpeg', [
                        '-i', tempPath,
                        '-i', bgMusicPath,
                        '-filter_complex', filter,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
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
