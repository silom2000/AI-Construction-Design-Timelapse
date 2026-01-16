const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const isDev = require('electron-is-dev');
require('dotenv').config();
const { request } = require('undici');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const sharp = require('sharp');
const streamPipeline = promisify(pipeline);

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false
        },
    });

    const startUrl = isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`;

    const loadWithRetry = (attempt = 1) => {
        console.log(`[Window] Trying to load URL: ${startUrl} (Attempt ${attempt})`);
        win.loadURL(startUrl).catch((e) => {
            console.error(`[Window] Failed to load URL: ${e.message}`);
            if (isDev && attempt < 5) {
                console.log(`[Window] Retrying in 2 seconds...`);
                setTimeout(() => loadWithRetry(attempt + 1), 2000);
            }
        });
    };

    loadWithRetry();

    // Open DevTools for debugging
    // if (isDev) {
    //     win.webContents.openDevTools();
    // }
}

app.whenReady().then(() => {
    ipcMain.handle('get-api-key', () => {
        return process.env.VOICEAPI_KEY?.trim();
    });

    const systemPrompt = `You are a Technical Construction & Engineering Consultant.
    Your task is to work in TWO AUTOMATIC PHASES.
    
    PHASE 1 — CONCEPT SELECTION
    When the user provides a project context (e.g., "Pyramids Giza"), generate a list of 5 CONCRETE construction concepts.
    
    STRICT RULES FOR TITLES:
    - Every title MUST literally include the core subject from the user's input.
    - NO abstract, poetic, or metaphorical titles (Avoid: "Vision", "Ascension", "Eternity", "Beginnings").
    - USE technical and descriptive titles (Example for Pyramids: "Cheops Pyramid Block-by-Block Construction", "Giza Pyramid Megalithic Engineering").
    
    Format each item exactly like this:
    Number. **[Subject Name] - [Technical Detail]**:
    - Style: ...
    - Method: ...
    
    Rules for Phase 1:
    - End Phase 1 with: "Please select ONE design option number (1–5)."`;

    ipcMain.handle('generate-themes', async (event, { userContext = "Luxury Interior Renovation" } = {}) => {
        try {
            const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
            console.log(`Generating themes for context: ${userContext}...`);

            const fullPrompt = `${systemPrompt}\n\nUSER REQUEST/CONTEXT: ${userContext}`;

            const { statusCode, body } = await request('https://text.pollinations.ai/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
                },
                body: JSON.stringify({
                    model: 'gemini',
                    messages: [{ role: 'user', content: fullPrompt }],
                }),
            });

            console.log("Response status code (generate-themes):", statusCode);
            const responseText = await body.text();
            if (statusCode !== 200) {
                throw new Error(`API request failed with status ${statusCode}: ${responseText}`);
            }

            try {
                const responseData = JSON.parse(responseText);
                if (responseData.choices && responseData.choices[0] && responseData.choices[0].message) {
                    return responseData.choices[0].message.content || "";
                }
                if (responseData.content) return responseData.content;
                if (responseData.reasoning_content) {
                    console.warn("Received reasoning content but no main content:", responseData.reasoning_content);
                    throw new Error("Model returned reasoning but no content.");
                }
                if (typeof responseData === 'string') return responseData;
                throw new Error("Could not parse content from JSON response.");
            } catch (e) {
                if (e.message.includes("Could not parse content") || e.message.includes("reasoning")) throw e;
                return responseText;
            }
        } catch (error) {
            console.error("Failed to generate themes in main process:", error);
            throw new Error(error.message);
        }
    });

    // VoiceAPI Helper: Create image (text-to-image) for Stage 1
    const createImageViaVoiceAPI = async (prompt, outputPath, aspectRatio = "9:16") => {
        const apiKey = process.env.VOICEAPI_KEY?.trim();
        if (!apiKey) throw new Error("VOICEAPI_KEY not found in .env");

        console.log(`[VoiceAPI] Creating image: ${prompt.substring(0, 50)}...`);

        const { statusCode, body } = await request('https://voiceapi.csv666.ru/api/v1/image/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                prompt: prompt,
                aspect_ratio: aspectRatio
            })
        });

        const responseText = await body.text();

        if (statusCode !== 200) {
            console.error(`[VoiceAPI] Error ${statusCode}: ${responseText}`);
            throw new Error(`VoiceAPI create error ${statusCode}: ${responseText}`);
        }

        const responseData = JSON.parse(responseText);

        if (!responseData.image_b64) {
            throw new Error("No image_b64 in response");
        }

        // Save Base64 image to file
        const imageBuffer = Buffer.from(responseData.image_b64, 'base64');
        fs.writeFileSync(outputPath, imageBuffer);

        console.log(`[VoiceAPI] Image saved to: ${outputPath}`);
        return await compressImageToBase64(outputPath); // Return compressed Base64 for history
    };

    // Helper: Compress image to reduce Base64 size
    const compressImageToBase64 = async (imagePath, maxWidth = 800, quality = 80) => {
        try {
            const buffer = await sharp(imagePath)
                .resize(maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
                .jpeg({ quality: quality })
                .toBuffer();

            const base64 = buffer.toString('base64');
            const sizeKB = (base64.length * 0.75 / 1024).toFixed(2);
            console.log(`[Compression] ${path.basename(imagePath)}: ${sizeKB} KB`);

            return base64;
        } catch (error) {
            console.error(`[Compression Error]: ${error.message}`);
            // Fallback to uncompressed
            return fs.readFileSync(imagePath, { encoding: 'base64' });
        }
    };

    // VoiceAPI Helper: Remix image (img2img) for Stages 2-6
    const remixImageViaVoiceAPI = async (prompt, referenceImageB64, outputPath, aspectRatio = "9:16") => {
        const apiKey = process.env.VOICEAPI_KEY?.trim();
        if (!apiKey) throw new Error("VOICEAPI_KEY not found in .env");

        console.log(`[VoiceAPI] Remixing image: ${prompt.substring(0, 50)}...`);

        const { statusCode, body } = await request('https://voiceapi.csv666.ru/api/v1/image/remix', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({
                prompt: prompt,
                reference_images_b64: [referenceImageB64],
                aspect_ratio: aspectRatio,
                image_influence: 0.5 // Adjust strength (0.0 to 1.0) to balance prompt vs reference. 0.5 is balanced.
            })
        });

        const responseText = await body.text();

        if (statusCode !== 200) {
            console.error(`[VoiceAPI] Remix error ${statusCode}: ${responseText}`);
            throw new Error(`VoiceAPI remix error ${statusCode}: ${responseText}`);
        }

        const responseData = JSON.parse(responseText);

        if (!responseData.image_b64) {
            throw new Error("No image_b64 in remix response");
        }

        // Save Base64 image to file
        const imageBuffer = Buffer.from(responseData.image_b64, 'base64');
        fs.writeFileSync(outputPath, imageBuffer);

        console.log(`[VoiceAPI] Remixed image saved to: ${outputPath}`);
        return await compressImageToBase64(outputPath); // Return compressed Base64 for next stage
    };

    ipcMain.handle('generate-image', async (event, { themeName, stageCount = 6, aspectRatio = "9:16" }) => {
        try {
            const imagesDir = path.join(__dirname, 'Image');
            if (!fs.existsSync(imagesDir)) {
                fs.mkdirSync(imagesDir);
            } else {
                // Clear all files for a fresh start
                console.log("[Cleanup] Automatically wiping Image directory for new project...");
                const files = fs.readdirSync(imagesDir);
                for (const file of files) {
                    try {
                        fs.unlinkSync(path.join(imagesDir, file));
                    } catch (e) {
                        console.warn(`Could not delete file ${file}:`, e.message);
                    }
                }
            }

            console.log(`Generating image prompts for theme: ${themeName} (Stages: ${stageCount}, AR: ${aspectRatio})`);

            const isInterior = themeName.toLowerCase().match(/interior|renovation|remodel|design|apartment|room|kitchen|bathroom|office|chamber/);

            const constructionInstructions = `
      - Image 1 (0%): MUST be an EMPTY site, no parts of the building.
      - Image 2 (approx. ${Math.round(100 / (stageCount - 1))} %): Groundwork, excavation, or foundation only.
      - intermediate stages: showing progressive structural growth (framing, walls, roof).`;

            const renovationInstructions = `
      - Image 1 (0%): MUST be the EXISTING OLD space before any work. Dilapidated, empty room, or space stripped to bare concrete/studs.
      - Image 2 (approx. ${Math.round(100 / (stageCount - 1))} %): Demolition, debris, or early plumbing/electrical installation inside the room.
      - intermediate stages: showing progressive interior growth (drywall, tiling, floor installation).
      - Final Image (${stageCount}): MUST be fully furnished with high-end designer furniture, luxury decor, and professional lighting.`;

            const fullSystemPrompt = `You are a Technical Construction & Engineering Consultant.
      Project: "${themeName}" (Type: ${isInterior ? "Interior Renovation" : "New Exterior Construction"})
      Task: Generate ${stageCount} hyper-realistic prompts showing the CHRONOLOGICAL PROGRESS of this project from 0% to 100%.
      
      RULES FOR PROMPTS:
      - Total stages to generate: ${stageCount}.
      - Orientation: ${aspectRatio === "16:9" ? "Landscape 16:9" : "Portrait 9:16"}.
      ${isInterior ? renovationInstructions : constructionInstructions}
      - Last Image (${stageCount}) (100%): Final completed architectural masterpiece, pristine, no workers. ${isInterior ? "Must feature ultra-luxury designer furniture and impeccable interior styling." : "Perfect lighting and landscaping."}
      
      CRITICAL: Ensure consistent camera angle and scale across all stages. 
      STRICT ARCHITECTURAL PERSISTENCE RULES:
      1. Establish key attributes (window shapes, wall textures, floor materials) early.
      2. EXPLICITLY REPEAT those attributes in ALL subsequent prompts (e.g., if stage 4 adds "large panoramic windows", stages 5 and 6 MUST also mention "large panoramic windows").
      3. Do NOT let the AI assume details; specify colors and materials in every stage prompt to avoid "drift".
      Output strictly in JSON format with keys: "image1", "image2", ..., "image${stageCount}".`;

            let attempts = 0;
            let responseText = "";
            let statusCode = 0;

            while (attempts < 3) {
                try {
                    attempts++;
                    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
                    console.log(`[Pollinations] Attempt ${attempts}/3 for ${themeName}...`);

                    const response = await request('https://text.pollinations.ai/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
                        },
                        body: JSON.stringify({
                            model: 'gemini',
                            messages: [{ role: 'user', content: fullSystemPrompt }],
                            json: true,
                            seed: Math.floor(Math.random() * 100000)
                        }),
                    });

                    statusCode = response.statusCode;
                    responseText = await response.body.text();

                    if (statusCode === 200 && responseText.trim().length > 0) {
                        break;
                    } else {
                        console.warn(`[Pollinations] Attempt ${attempts} failed with status ${statusCode}. Body: ${responseText.substring(0, 100)}`);
                    }
                } catch (e) {
                    console.error(`[Pollinations] Network error on attempt ${attempts}:`, e.message);
                    if (attempts === 3) throw e;
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            if (statusCode !== 200 || !responseText.trim()) {
                throw new Error(`Failed to get valid response from Pollinations after 3 attempts. Status: ${statusCode}`);
            }

            let prompts = {};
            try {
                console.log("[DEBUG] Raw response text:", responseText.substring(0, 500));
                const data = JSON.parse(responseText);
                console.log("[DEBUG] Parsed data structure:", JSON.stringify(data).substring(0, 300));

                // Try multiple parsing strategies
                let content = data.choices?.[0]?.message?.content || data.content || data.text || data;
                console.log("[DEBUG] Extracted content type:", typeof content);
                console.log("[DEBUG] Extracted content preview:", typeof content === 'string' ? content.substring(0, 300) : JSON.stringify(content).substring(0, 300));

                if (typeof content === 'string') {
                    // Try to find JSON in the string
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        console.log("[DEBUG] Found JSON match:", jsonMatch[0].substring(0, 200));
                        prompts = JSON.parse(jsonMatch[0]);
                    } else {
                        throw new Error("No JSON object found in response");
                    }
                } else if (typeof content === 'object') {
                    prompts = content;
                } else {
                    throw new Error("Unexpected content type: " + typeof content);
                }

                console.log("[DEBUG] Final prompts object keys:", Object.keys(prompts));
            } catch (e) {
                console.error("[ERROR] Failed to parse prompts:", e.message);
                console.error("[ERROR] Stack:", e.stack);
                console.error("[ERROR] Full response (first 1000 chars):", responseText ? responseText.substring(0, 1000) : 'EMPTY');
                throw new Error("Could not parse image prompts: " + e.message);
            }

            const promptsPath = path.join(imagesDir, 'prompts.json');
            let allPrompts = {};
            if (fs.existsSync(promptsPath)) { try { allPrompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8')); } catch (e) { } }
            allPrompts[themeName] = prompts;
            fs.writeFileSync(promptsPath, JSON.stringify(allPrompts, null, 2));

            const keys = Array.from({ length: stageCount }, (_, i) => `image${i + 1}`);
            const prompt = prompts[keys[0]]?.trim();
            const localFilePaths = [];

            if (prompt) {
                const fileName = `image_1.jpg`;
                const filePath = path.join(imagesDir, fileName);
                const imageB64 = await createImageViaVoiceAPI(prompt, filePath, aspectRatio);

                const mediaPath = `media:///${filePath.replace(/\\/g, '/')}`;
                localFilePaths.push(mediaPath);

                const historyPath = path.join(imagesDir, 'generation_history.json');
                let history = {};
                if (fs.existsSync(historyPath)) { try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { } }
                history[themeName] = new Array(stageCount).fill(null);
                history[themeName][0] = imageB64;
                fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
            }

            const resultArr = new Array(stageCount).fill(null);
            if (localFilePaths[0]) resultArr[0] = localFilePaths[0];
            return resultArr;
        } catch (error) {
            console.error("Generate Image Error:", error);
            throw new Error(error.message);
        }
    });

    ipcMain.handle('generate-image-stage', async (event, { themeName, index, stageCount, aspectRatio }) => {
        try {
            const imagesDir = path.join(__dirname, 'Image');
            if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

            const promptsPath = path.join(imagesDir, 'prompts.json');
            let prompts = {};
            if (fs.existsSync(promptsPath)) prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'))[themeName] || {};

            const key = `image${index + 1}`;
            const prompt = prompts[key];
            if (!prompt) throw new Error(`No prompt for stage ${index + 1}`);

            const historyPath = path.join(imagesDir, 'generation_history.json');
            let history = {};
            if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

            let previousImageB64 = null;
            if (index > 0 && history[themeName]) {
                previousImageB64 = history[themeName][index - 1];
                if (previousImageB64) {
                    console.log(`Using reference from Stage ${index} for generating Stage ${index + 1}: ${previousImageB64.substring(0, 50)}...`);
                } else {
                    console.warn(`No Base64 reference for stage ${index + 1}, will generate without reference`);
                }
            }

            const fileName = `image_${index + 1}.jpg`;
            const filePath = path.join(imagesDir, fileName);

            let imageB64;
            if (previousImageB64) {
                console.log(`Generating Stage ${index + 1} via VoiceAPI REMIX...`);
                imageB64 = await remixImageViaVoiceAPI(prompt, previousImageB64, filePath, aspectRatio);
            } else {
                console.log(`Generating Stage ${index + 1} via VoiceAPI CREATE (no reference)...`);
                imageB64 = await createImageViaVoiceAPI(prompt, filePath, aspectRatio);
            }

            const mediaPath = `media:///${filePath.replace(/\\/g, '/')}`;

            // Update history with new Base64
            if (!history[themeName]) history[themeName] = new Array(stageCount).fill(null);
            history[themeName][index] = imageB64;
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

            return mediaPath;
        } catch (error) {
            console.error("Stage Error:", error);
            throw error;
        }
    });

    ipcMain.handle('regenerate-single-image', async (event, { themeName, index, stageCount, aspectRatio }) => {
        try {
            const imagesDir = path.join(__dirname, 'Image');
            const isInterior = themeName.toLowerCase().match(/interior|renovation|remodel|design|apartment|room|kitchen|bathroom|office|chamber/);

            let stageDesc = "";
            const completion = Math.round((index / (stageCount - 1)) * 100);

            if (index === 0) {
                stageDesc = isInterior ? "Existing old room/space before renovation. Bare walls, debris, or old finish." : "Empty site/land before any work. Just natural ground.";
            } else if (index === stageCount - 1) {
                stageDesc = isInterior
                    ? "Final completed architectural masterpiece. Fully furnished with high-end designer furniture, premium materials, and professional lighting."
                    : "Final completed architectural masterpiece. Perfect lighting, fully finished/detailed.";
            } else {
                stageDesc = isInterior
                    ? `Interior renovation in progress (${completion}%). Visible plumbing, drywall, or floor installation inside the room.`
                    : `Construction in progress (${completion}%). Visible structural framing, brickwork, or facade installation.`;
            }

            const promptsPath = path.join(imagesDir, 'prompts.json');
            let originalPrompts = {};
            if (fs.existsSync(promptsPath)) {
                try {
                    const allPrompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'));
                    originalPrompts = allPrompts[themeName] || {};
                } catch (e) { }
            }

            const styleReference = originalPrompts[`image${index + 1}`] || themeName;

            const singlePromptRequest = `You are a Technical Design Consultant.
            Theme: "${themeName}"
            Style Context (Original): "${styleReference}"
            
            TASK: Generate ONE hyper-realistic prompt for STAGE ${index + 1} of ${stageCount}.
            Current Status: ${stageDesc}.
            
            STRICT PERSISTENCE RULES:
            1. Maintain the EXACT same camera angle, lighting, and materials as defined in the Style Context.
            2. PERMANENT FEATURES: If the context mentions specific features (e.g., marble floors, large windows), you MUST include them in this prompt. Features cannot disappear.
            3. The prompt must describe the work happening at ${completion}% completion.
            4. Ensure the description is compatible with the perspective of the previous images.
            5. Orientation: ${aspectRatio}. 
            
            Output ONLY the improved prompt text. No preamble.`;

            let attempts = 0; let imagePrompt = "";
            while (attempts < 3) {
                try {
                    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
                    const { statusCode, body } = await request('https://text.pollinations.ai/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
                        },
                        body: JSON.stringify({ model: 'gemini', messages: [{ role: 'user', content: singlePromptRequest }] })
                    });
                    if (statusCode === 200) { imagePrompt = (await body.text()); break; }
                } catch (e) { } attempts++;
            }
            if (!imagePrompt) imagePrompt = `${themeName} construction stage ${index + 1}`;

            const historyPath = path.join(imagesDir, 'generation_history.json');
            let history = {};
            if (fs.existsSync(historyPath)) history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

            let previousImageB64 = null;
            if (index > 0 && history[themeName]) previousImageB64 = history[themeName][index - 1];

            const filePath = path.join(imagesDir, `image_${index + 1}.jpg`);

            let imageB64;
            if (previousImageB64) {
                console.log(`Regenerating ${index + 1} via VoiceAPI REMIX...`);
                imageB64 = await remixImageViaVoiceAPI(imagePrompt, previousImageB64, filePath, aspectRatio);
            } else {
                console.log(`Regenerating ${index + 1} via VoiceAPI CREATE...`);
                imageB64 = await createImageViaVoiceAPI(imagePrompt, filePath, aspectRatio);
            }

            const mediaPath = `media:///${filePath.replace(/\\/g, '/')}`;

            if (!history[themeName]) history[themeName] = new Array(stageCount).fill(null);
            history[themeName][index] = imageB64;
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

            return mediaPath;
        } catch (error) {
            console.error("Regen Error:", error);
            throw error;
        }
    });

    // ============ VIDEO GENERATION WITH KIE.AI ============

    // Helper: Create video task
    const createVideoTask = async (imageUrl, tailImageUrl, prompt) => {
        const apiKey = process.env.KIE_KEY?.trim();
        if (!apiKey) throw new Error("KIE_KEY not found in .env");

        console.log(`[KIE.AI] Creating video task: ${imageUrl} -> ${tailImageUrl}`);

        const { statusCode, body } = await request('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: "kling/v2-5-turbo-image-to-video-pro",
                input: {
                    prompt: prompt,
                    image_url: imageUrl,
                    tail_image_url: tailImageUrl,
                    duration: "5",
                    negative_prompt: "blur, distort, and low quality",
                    cfg_scale: 0.5
                }
            })
        });

        const responseText = await body.text();
        console.log(`[KIE.AI] Create task response (${statusCode}):`, responseText.substring(0, 200));

        if (statusCode !== 200) {
            throw new Error(`KIE.AI create task failed ${statusCode}: ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.code !== 200 || !data.data?.taskId) {
            throw new Error(`KIE.AI error: ${data.msg || 'No taskId returned'}`);
        }

        return data.data.taskId;
    };

    // Helper: Check video task status
    const checkVideoTaskStatus = async (taskId) => {
        const apiKey = process.env.KIE_KEY?.trim();
        if (!apiKey) throw new Error("KIE_KEY not found in .env");

        const { statusCode, body } = await request(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`
            }
        });

        const responseText = await body.text();

        if (statusCode !== 200) {
            throw new Error(`KIE.AI status check failed ${statusCode}: ${responseText}`);
        }

        const data = JSON.parse(responseText);
        if (data.code !== 200) {
            throw new Error(`KIE.AI error: ${data.msg}`);
        }

        return data.data;
    };

    // Helper: Wait for video completion with polling
    const waitForVideoCompletion = async (taskId, progressCallback) => {
        const maxAttempts = 120; // 10 minutes (120 * 5 sec)

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const status = await checkVideoTaskStatus(taskId);

            console.log(`[KIE.AI] Task ${taskId} status: ${status.state} (attempt ${attempt + 1}/${maxAttempts})`);

            if (status.state === 'success') {
                const resultJson = JSON.parse(status.resultJson);
                if (resultJson.resultUrls && resultJson.resultUrls.length > 0) {
                    return resultJson.resultUrls[0];
                }
                throw new Error('No video URL in result');
            }

            if (status.state === 'fail') {
                throw new Error(`Video generation failed: ${status.failMsg || 'Unknown error'}`);
            }

            // Still waiting
            if (progressCallback) {
                progressCallback({ attempt: attempt + 1, maxAttempts, state: status.state });
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        }

        throw new Error('Video generation timeout (10 minutes)');
    };

    // Helper: Download video
    const downloadVideo = async (videoUrl, outputPath) => {
        console.log(`[KIE.AI] Downloading video from ${videoUrl} to ${outputPath}`);

        const { statusCode, body } = await request(videoUrl, {
            method: 'GET'
        });

        if (statusCode !== 200) {
            throw new Error(`Failed to download video: ${statusCode}`);
        }

        await streamPipeline(body, fs.createWriteStream(outputPath));
        console.log(`[KIE.AI] Video downloaded successfully: ${outputPath}`);

        return outputPath;
    };

    // Main handler: Generate all videos
    ipcMain.handle('generate-videos', async (event, { themeName, stageCount = 6 }) => {
        try {
            const videosDir = path.join(__dirname, 'Videos');
            if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir);

            const imagesDir = path.join(__dirname, 'Image');
            const videoPrompt = `CONSTRUCTION PROGRESS TIMELAPSE - Transition showing active construction progress in fast motion. Highlighting workforce movements, material assembly, and structural growth. Professional construction logic. Revealing the evolution of the project from scratch to final completion. Realistic, cinematic, 8K, high quality. No visible faces. Consistent lighting.`;

            const videos = [];
            const totalVideos = stageCount - 1;

            // Generate stageCount - 1 videos from stageCount images
            for (let i = 0; i < totalVideos; i++) {
                const startImagePath = path.join(imagesDir, `image_${i + 1}.jpg`);
                const endImagePath = path.join(imagesDir, `image_${i + 2}.jpg`);

                // Check if images exist
                if (!fs.existsSync(startImagePath) || !fs.existsSync(endImagePath)) {
                    throw new Error(`Missing images for video ${i + 1}`);
                }

                // Convert local paths to URLs (VoiceAPI images)
                const startImageUrl = `media:///${startImagePath.replace(/\\/g, '/')}`;
                const endImageUrl = `media:///${endImagePath.replace(/\\/g, '/')}`;

                console.log(`[KIE.AI] Starting video ${i + 1}/${totalVideos}: ${startImageUrl} -> ${endImageUrl}`);

                // Send progress update to frontend
                event.sender.send('video-progress', { current: i, total: totalVideos, status: 'creating_task' });

                // 1. Create task
                const taskId = await createVideoTask(startImageUrl, endImageUrl, videoPrompt);
                console.log(`[KIE.AI] Video ${i + 1} task created: ${taskId}`);

                // Send progress update
                event.sender.send('video-progress', { current: i, total: totalVideos, status: 'waiting', taskId });

                // 2. Wait for completion
                const videoUrl = await waitForVideoCompletion(taskId, (progress) => {
                    event.sender.send('video-progress', {
                        current: i,
                        total: totalVideos,
                        status: 'processing',
                        attempt: progress.attempt,
                        maxAttempts: progress.maxAttempts
                    });
                });

                console.log(`[KIE.AI] Video ${i + 1} completed: ${videoUrl}`);

                // Send progress update
                event.sender.send('video-progress', { current: i, total: totalVideos, status: 'downloading' });

                // 3. Download video
                const videoFileName = `video_${i + 1}.mp4`;
                const videoPath = path.join(videosDir, videoFileName);
                await downloadVideo(videoUrl, videoPath);

                const mediaPath = `media:///${videoPath.replace(/\\/g, '/')}`;
                videos.push(mediaPath);

                event.sender.send('video-progress', { current: i + 1, total: totalVideos, status: 'done' });
            }

            return videos;
        } catch (error) {
            console.error("Generate Videos Error:", error);
            throw error;
        }
    });

    // Helper: Get video duration
    const getVideoDuration = (filePath) => {
        return new Promise((resolve, reject) => {
            const ffprobe = spawn('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                filePath
            ]);
            let output = '';
            ffprobe.stdout.on('data', (data) => output += data.toString());
            ffprobe.on('close', (code) => {
                if (code === 0) resolve(parseFloat(output.trim()));
                else reject(new Error(`ffprobe exited with code ${code}`));
            });
        });
    };

    // Handler: Final video assembly
    ipcMain.handle('assemble-final-video', async (event) => {
        try {
            console.log("[Assembly] Starting final video assembly...");
            const videosDir = path.join(__dirname, 'Videos');
            const musicDir = path.join(__dirname, 'Music');
            const finalDir = path.join(__dirname, 'FinalVideo');
            if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);

            // 1. Get list of videos
            const videoFiles = [
                path.join(videosDir, 'video_1.mp4'),
                path.join(videosDir, 'video_2.mp4'),
                path.join(videosDir, 'video_3.mp4'),
                path.join(videosDir, 'video_4.mp4'),
                path.join(videosDir, 'video_5.mp4')
            ].filter(f => fs.existsSync(f));

            if (videoFiles.length === 0) throw new Error("No videos found to assemble. Generate them first!");

            // 2. Find music file
            const filesInMusic = fs.existsSync(musicDir) ? fs.readdirSync(musicDir) : [];
            const musicFiles = filesInMusic.filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.wav'));

            if (musicFiles.length === 0) {
                throw new Error("No music file found in 'Music' folder. Please add at least one .mp3 or .wav file.");
            }
            const musicPath = path.join(musicDir, musicFiles[0]);
            console.log(`[Assembly] Using music: ${musicPath}`);

            // 3. Create concat list
            const listPath = path.join(__dirname, 'filelist.txt');
            const listContent = videoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(listPath, listContent);

            // 4. Get total duration for progress
            let totalDuration = 0;
            for (const f of videoFiles) {
                totalDuration += await getVideoDuration(f);
            }
            console.log(`[Assembly] Total video duration: ${totalDuration}s`);

            // 5. Run FFmpeg
            const outputPath = path.join(finalDir, 'final_video.mp4');
            const fadeOutStart = Math.max(0, totalDuration - 3);

            const ffmpegArgs = [
                '-f', 'concat',
                '-safe', '0',
                '-i', listPath,
                '-i', musicPath,
                '-filter_complex', `[1:a]afade=t=out:st=${fadeOutStart}:d=3[audio]`,
                '-map', '0:v',
                '-map', '[audio]',
                '-c:v', 'libx264',
                '-pix_fmt', 'yuv420p',
                '-shortest',
                '-y',
                outputPath
            ];

            return new Promise((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', ffmpegArgs);

                ffmpeg.stderr.on('data', (data) => {
                    const text = data.toString();
                    const timeMatch = text.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
                    if (timeMatch) {
                        const timeStr = timeMatch[1];
                        const [h, m, s] = timeStr.split(':').map(parseFloat);
                        const currentTime = h * 3600 + m * 60 + s;
                        const progress = Math.min(100, Math.round((currentTime / totalDuration) * 100));
                        event.sender.send('assembly-progress', { progress });
                    }
                });

                ffmpeg.on('close', (code) => {
                    if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
                    if (code === 0) {
                        resolve(`media:///${outputPath.replace(/\\/g, '/')}`);
                    } else {
                        reject(new Error(`FFmpeg error (code ${code}). Check logs.`));
                    }
                });
            });

        } catch (error) {
            console.error("[Assembly Error]:", error);
            throw error;
        }
    });

    const { protocol } = require('electron');
    protocol.registerFileProtocol('media', (request, callback) => {
        let url = request.url;
        if (url.startsWith('media:///')) {
            url = url.replace('media:///', '');
        } else {
            url = url.replace('media://', '');
        }
        const queryIndex = url.indexOf('?');
        if (queryIndex !== -1) url = url.substring(0, queryIndex);
        const filePath = decodeURIComponent(url);
        try {
            return callback({ path: filePath });
        } catch (error) {
            console.error(`[Media Protocol] Error:`, error);
            return callback(404);
        }
    });

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
