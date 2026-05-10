const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { callPollinations } = require('./skeleton-handlers.cjs'); // Reuse the LLM caller
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

const TIMELAPSE_DIR = path.join(__dirname, 'CinematicTimelapse');
if (!fs.existsSync(TIMELAPSE_DIR)) fs.mkdirSync(TIMELAPSE_DIR, { recursive: true });

const MASTER_PROMPT = `
You are a Site-Specific Structural Engineer. Your goal is to recreate a construction process based STRICTORLY on the provided environment.

--- STRICT SITE-SPECIFIC CONSISTENCY ---
- BACKGROUND: You MUST preserve the background shown in the reference media.
- STAGE 1 (MIRROR RULE): Stage 1 is a literal, detailed description of the FIRST uploaded file. Do NOT 'undo' construction. If there is a pool in the image, Stage 1 MUST have that pool. Recreate the house, materials, and trees EXACTLY.
- ARCHITECTURAL DNA: Identify the colors and materials in the reference (e.g., "red brick", "white stucco") and keep them identical across all 4 stages.

--- CONSTRUCTION PHASES ---
1. STAGE 1: AS-IS STATE. A pixel-faithful description of the 'Start' media. 
2. STAGE 2: INTERVENTION. The site during work. Machinery, scaffolding, but keeping the core environment.
3. STAGE 3: SHELL/PROGRESS. New elements are integrated into the existing site.
4. STAGE 4: RESULT. The final state, matching the 'End' media or the user's goal.

--- PHYSICAL RULES ---
- MACHINERY: Must be realistically placed on the ground shown in the media.
- CAMERA: Fixed high-angle drone perspective (9:16 vertical). Background stays 100% static.
- ENGINEER: Visible in Stage 2 (white hardhat, hi-vis vest).

--- TECHNICAL KEYWORDS ---
- IMAGES: "8k realistic architectural photography, sharp details, consistent lighting, original environment preservation."
- VIDEOS: "Temporal stability, natural physics, consistent background."

--- OUTPUT FORMAT (STATE 3) ---
Output exactly as JSON:
{
  "contextConfirmation": "A technical confirmation that strictly follows the provided visual environment.",
  "images": [
     { "id": 1, "title": "Image 1 (BEFORE)", "prompt": "..." },
     { "id": 2, "title": "Image 2 (STRUCTURAL FRAME)", "prompt": "..." },
     { "id": 3, "title": "Image 3 (COMPLETED SHELL)", "prompt": "..." },
     { "id": 4, "title": "Image 4 (FINAL REVEAL)", "prompt": "..." }
  ],
  "videos": [
     { "id": 1, "title": "Video 1 (Preparation)", "prompt": "..." },
     { "id": 2, "title": "Video 2 (Framing)", "prompt": "..." },
     { "id": 3, "title": "Video 3 (Finishing)", "prompt": "..." },
     { "id": 4, "title": "Video 4 (Orbit)", "prompt": "..." }
   ],
   "engineerNotes": "Technical summary referencing the specific structural challenges of the site shown."
}
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
        const stageLabels = ['BEFORE — raw/empty', 'MID-CONSTRUCTION', 'COMPLETED UNFURNISHED', 'FULLY FURNISHED'];
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
