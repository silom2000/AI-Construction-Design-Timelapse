const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { callPollinations } = require('./skeleton-handlers.cjs'); // Reuse the LLM caller
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

const TIMELAPSE_DIR = path.join(__dirname, 'CinematicTimelapse');
if (!fs.existsSync(TIMELAPSE_DIR)) fs.mkdirSync(TIMELAPSE_DIR, { recursive: true });

const MASTER_PROMPT = `
You are a cinematic AI workflow generator.
You do NOT behave like a conversational assistant.
You behave like a structured interactive system with defined states.

Your job is to generate photorealistic IMAGE prompts and FRAME-CONSISTENT VIDEO prompts for a cinematic transition sequence. 
The subject is a high-end, photorealistic interior/exterior renovation or transformation.

--- STATE 1 — IDLE ---
Wait for user input: "start". (Do not output anything else before this).

--- STATE 2 — SELECTION MODE ---
If user says "start", IMMEDIATELY output exactly 10 highly distinct, atmospheric environment options for transformation.
Format strictly as a numbered list (1-10).
Example:
1. An abandoned 1800s Victorian greenhouse, overgrown with dead ivy, broken glass, overcast lighting -> Restored to a bioluminescent botanical luxury lounge.
2. A brutalist concrete bunker from the 1970s...

--- STATE 3 — EXECUTION MODE ---
Wait for user to select a number (e.g., "3").
When selected, output the following structured data EXACTLY AS JSON:

{
  "contextConfirmation": "A single cinematic sentence confirming the space, emphasizing it will be a 100% photorealistic, static-camera sequence.",
  "images": [
     { "id": 1, "title": "Image 1 (EMPTY/BEFORE)", "prompt": "Your highly detailed prompt for Image 1...", "platform": "Generate with Nano Banana or Freepik" },
     { "id": 2, "title": "Image 2 (MID-CONSTRUCTION)", "prompt": "Your highly detailed prompt for Image 2...", "platform": "Generate with Nano Banana or Freepik" },
     { "id": 3, "title": "Image 3 (COMPLETED UNFURNISHED)", "prompt": "Your highly detailed prompt for Image 3...", "platform": "Generate with Nano Banana or Freepik" },
     { "id": 4, "title": "Image 4 (COMPLETED FURNISHED)", "prompt": "Your highly detailed prompt for Image 4...", "platform": "Generate with Nano Banana or Freepik" }
  ],
  "videos": [
     { "id": 1, "title": "Video 1 (Image 1 → Image 2)", "prompt": "Video prompt describing the transition...", "platform": "Animate with Veo 3 or PixVerse" },
     { "id": 2, "title": "Video 2 (Image 2 → Image 3)", "prompt": "Video prompt describing the transition...", "platform": "Animate with Veo 3 or PixVerse" },
     { "id": 3, "title": "Video 3 (Image 3 → Image 4)", "prompt": "Video prompt describing the transition...", "platform": "Animate with Veo 3 or PixVerse" }
  ]
}

CRITICAL RULES FOR IMAGES:
1. They must depict the exact same space.
2. Same camera angle, lens size, framing, height.
3. Completely static camera. Zero camera movement between shots.
Image 1: Raw, dirty, under-construction, neutral lighting. No humans.
Image 2: Mid-construction. Real workers, tools, dust, scaffolding. Realistic construction mess.
Image 3: Fully finished surfaces, high-end materials. No furniture. Clean lighting. No humans.
Image 4: Fully furnished, luxury styling, final lighting. Transformed surfaces still visible. No humans.

CRITICAL RULES FOR VIDEOS:
1. Static Camera. No panning, zooming, dollying.
2. Human-Driven Motion: It is not magic. Humans must be seen entering, applying materials, and walking out.
3. Realistic Time Progression: Fast-forwarded realism (timelapse style).
Video 1: Construction/preparation timelapse. Humans entering, tearing down/prepping, dust particles, exiting frame.
Video 2: Core transformation. Fast-forward application of the actual materials (e.g. plaster drying, paint rolling, floor laying). 
Video 3: Human-driven furnishing. Objects being moved in rapidly by figures, lighting turning on.

Ensure all outputs strictly adhere to the requested JSON format in STATE 3.
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
        const response = await callPollinations(conversationHistory, false);
        conversationHistory.push({ role: 'assistant', content: response });

        // Parse 1-10 list
        const lines = response.split('\n').map(l => l.trim()).filter(l => /^[0-9]+[\.\)]/.test(l));
        if (lines.length > 0) return lines;

        // Fallback parsing if LLM didn't use strict numbers
        return response.split('\n').filter(l => l.length > 10).slice(0, 10);
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

    ipcMain.handle('timelapse-generate-image', async (event, { imgIndex, prompt, model, subFolder }) => {
        // imgIndex is 0 to 3, representing Image 1 to 4
        const baseDir = subFolder ? path.join(TIMELAPSE_DIR, subFolder) : TIMELAPSE_DIR;
        const filePath = path.join(baseDir, `image_${imgIndex + 1}.jpg`);
        console.log(`[Timelapse] Generating Image ${imgIndex + 1} with model ${model || 'imagen4'} in ${subFolder || 'root'}...`);
        
        // We use G-Labs with nano_banana or imagen4 for photorealism
        const savedPaths = await generateImageViaGLabs({
            prompt,
            model: model || 'imagen4',
            count: 1,
            sectionDir: TIMELAPSE_DIR,
            subFolder: subFolder,
            sceneIndex: imgIndex
        });
        
        return `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;
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

        const startImgPath = findImage(videoIndex + 1);
        const endImgPath = findImage(videoIndex + 2);

        if (!startImgPath || !fs.existsSync(startImgPath)) {
            throw new Error(`Start Image ${videoIndex + 1} not found in ${baseDir}.`);
        }
        if (!endImgPath || !fs.existsSync(endImgPath)) {
            throw new Error(`End Image ${videoIndex + 2} not found. Please generate it first for the transition.`);
        }

        const videoPath = path.join(baseDir, `video_${videoIndex + 1}.mp4`);
        console.log(`[Timelapse] Generating Video ${videoIndex + 1} (Transition ${videoIndex + 1} -> ${videoIndex + 2})...`);

        const startB64 = fs.readFileSync(startImgPath, { encoding: 'base64' });
        const endB64 = fs.readFileSync(endImgPath, { encoding: 'base64' });
        
        const getExt = (p) => p.endsWith('.png') ? 'png' : 'jpeg';

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
            path.join(baseDir, 'video_3.mp4')
        ];

        for (let i = 0; i < videos.length; i++) {
            if (!fs.existsSync(videos[i])) {
                // Fallback to root TIMELAPSE_DIR if video was generated before the path fix
                const fallback = path.join(TIMELAPSE_DIR, `video_${i + 1}.mp4`);
                if (fs.existsSync(fallback)) {
                    videos[i] = fallback;
                } else {
                    throw new Error(`Missing video_${i + 1}.mp4 in both project folder and root folder.`);
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
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', tempPath]);
            
            concat.on('close', code => {
                if (code !== 0) return reject(new Error('FFmpeg concat failed.'));
                if (!bgMusicPath) {
                    fs.renameSync(tempPath, finalPath);
                    return resolve(`media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`);
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
