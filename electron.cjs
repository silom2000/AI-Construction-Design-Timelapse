const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const isDev = require('electron-is-dev');
require('dotenv').config();
const { request } = require('undici');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const sharp = require('sharp');
const streamPipeline = promisify(pipeline);
const { registerSkeletonHandlers, synthesizeUnifiedSpeech } = require('./skeleton-handlers.cjs');
const { registerGLabsHandlers } = require('./glabs-handlers.cjs');
const freepikKeys = require('./freepik-key-manager.cjs');
// ── Новые модули (П.1, П.3, П.4, П.5) ──────────────────────────────────────
const { queueManager, STATUS, TASK_TYPE } = require('./queue-manager.cjs');
const { validateAllKeys } = require('./api-validator.cjs');
const promptCache = require('./prompt-cache.cjs');

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

app.whenReady().then(async () => {
    ipcMain.handle('get-api-key', () => {
        return process.env.VOICEAPI_KEY?.trim();
    });

    // ── П.3: Валидация API-ключей при старте ─────────────────────────────────
    ipcMain.handle('validate-api-keys', async () => {
        console.log('[App] Running API key validation...');
        const results = await validateAllKeys();
        results.forEach(r => {
            const icon = r.valid ? '✅' : '❌';
            console.log(`${icon} ${r.name}: ${r.message}`);
        });
        return results;
    });

    // ── П.1: Получить состояние очереди задач ────────────────────────────────
    ipcMain.handle('get-queue-tasks', () => {
        return queueManager.getAllTasks(20);
    });

    // ── П.1: Отменить задачу в очереди ──────────────────────────────────────
    ipcMain.handle('cancel-queue-task', (event, { taskId }) => {
        queueManager.cancelTask(taskId);
        return { success: true };
    });

    // ── П.5: Статистика кеша промптов ────────────────────────────────────────
    ipcMain.handle('get-cache-stats', () => {
        return promptCache.getStats();
    });

    // ── П.5: Очистить кеш промптов ───────────────────────────────────────────
    ipcMain.handle('clear-prompt-cache', () => {
        promptCache.clear();
        return { success: true };
    });


    const systemPrompt = `You are a Technical Multi-Disciplinary Design & Engineering Consultant specializing in luxury renovations and construction.
    
    PHASE 1 — CONCEPT GENERATION WITH DIVERSITY
    
    When the user provides a project context, generate 5 UNIQUE and DIVERSE concepts using TEMPLATE VARIABLES for maximum variety.
    
    MANDATORY DIVERSITY REQUIREMENTS:
    - Each of the 5 concepts MUST use different combinations of variables
    - VARY the [ROOM_TYPE], [ELEMENT], [THEME], [OBJECTS], and [STYLE] across options
    - Create distinct visual and thematic differences between each concept
    
    TEMPLATE VARIABLES TO USE (rotate and mix across 5 concepts):
    
    [ROOM_TYPE] options: Master Bedroom, Living Room, Kitchen, Bathroom, Home Office, Dining Room, etc.
    
    [ELEMENT] options: floor, wall, ceiling, accent wall, feature element, epoxy surface
    
    [THEME] options: 
    - Ocean/Deep-sea environment (whales, dolphins, coral reef)
    - Galaxy/Space (planets, stars, nebula, asteroids)
    - Forest/Nature (trees, waterfalls, moss, ferns)
    - Desert/Dunes (sand, cacti, rock formations)
    - Urban/Industrial (cityscapes, graffiti, concrete textures)
    - Luxury/Precious (gold veins, marble, crystals, gemstones)
    
    [OBJECTS] examples:
    - For Ocean: large whale, dolphins, starfish, jellyfish, coral
    - For Galaxy: planets, shooting stars, nebula clouds, asteroids
    - For Forest: giant tree roots, waterfall, exotic plants, moss
    - For Desert: sand dunes, cacti, rock arch, oasis
    - For Urban: city skyline, vintage cars, industrial gears
    - For Luxury: gold rivers, marble veins, crystal formations
    
    [STYLE] options: modern luxury, cinematic realism, ultra-high-end, boutique hotel style, resort aesthetic
    
    DESIGN CONCEPT FORMAT:
    Generate each concept following this exact structure:
    
    Number. **[ROOM_TYPE] - [THEME]-Inspired [ELEMENT]**:
    - Theme: [THEME] with [OBJECT_1], [OBJECT_2], [OBJECT_3]
    - Element: Enhanced [ELEMENT] with transparent epoxy/glossy finish
    - Objects: Embed [OBJECT_1], [OBJECT_2], and [OBJECT_3] beneath the surface
    - Style: [STYLE], ultra-realistic, cinematic - NOT cartoonish
    - Effect: Creates illusion of [SCENE_TYPE] environment
    
    EXAMPLE (for reference):
    1. **Master Bedroom - Ocean-Inspired Floor**:
    - Theme: Deep-sea environment with marine life
    - Element: Enhanced epoxy river-style floor with transparent glossy finish
    - Objects: Embed large whale, dolphins, and starfish beneath the surface
    - Style: Ultra-realistic, high-end, cinematic - NOT cartoonish or illustrative
    - Effect: Creates illusion of underwater scene
    
    STRICT RULES:
    - Use DIFFERENT [THEME] for each of the 5 concepts
    - Vary [ELEMENT] (don't use "floor" for all 5)
    - Mix [ROOM_TYPE] choices
    - Keep it technically descriptive, not abstract
    - End with: "Please select ONE design option number (1–5)."
    
    AUTO-DETECT PROJECT TYPE:
    - If context mentions: living, bedroom, floor, apartment, kitchen → Generate INTERIOR DESIGN concepts
    - If context mentions: house, tower, pool, garden, building → Generate EXTERIOR CONSTRUCTION concepts`;

    // --------- Phase 1 Patch: Unified TTS IPC path (synthesize-unified-speech) ---------
    ipcMain.handle('synthesize-unified-speech', async (event, { fullScript, language, voiceModel } = {}) => {
        try {
            return await require('./skeleton-handlers.cjs').synthesizeUnifiedSpeech(fullScript, language, voiceModel);
        } catch (e) {
            throw e;
        }
    });

    ipcMain.handle('generate-themes', async (event, { userContext = "Luxury Interior Renovation" } = {}) => {
        try {
            const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
            const customUrl = process.env.CUSTOM_AI_URL?.trim();
            const pollKey = process.env.POLLINATIONS_API_KEY?.trim();
            const pollUrl = 'https://gen.pollinations.ai/v1/chat/completions';

            const fullPrompt = `${systemPrompt}\n\nUSER REQUEST/CONTEXT: ${userContext}`;
            const WORKING_MODELS = ['gemini-3-flash', 'gemini-3.1-pro', 'gpt-4o', 'claude-3-5-sonnet-20241022'];
            const modelsToTry = customUrl ? [...WORKING_MODELS, 'openai-large'] : ['openai-large'];

            let lastError = null;
            for (const model of modelsToTry) {
                const isCustom = WORKING_MODELS.includes(model);
                const apiUrl = isCustom && customUrl ? customUrl : pollUrl;
                const apiKey = isCustom && customUrl ? customKey : pollKey;

                try {
                    console.log(`[Themes] Trying model=${model} at ${apiUrl}...`);
                    const { statusCode, body } = await request(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: fullPrompt }],
                        }),
                    });

                    const responseText = await body.text();
                    if (statusCode === 200) {
                        const responseData = JSON.parse(responseText);
                        return responseData.choices?.[0]?.message?.content || responseData.content || responseText;
                    }
                    console.warn(`[Themes] model=${model} failed: ${statusCode}`);
                } catch (e) {
                    console.error(`[Themes] Error with model=${model}: ${e.message}`);
                    lastError = e;
                }
            }
            throw lastError || new Error("All theme generation models failed");
        } catch (error) {
            console.error("Failed to generate themes:", error);
            throw error;
        }
    });

    // Pollinations Helper: Create image (text-to-image)
    const createImageViaPollinations = async (prompt, outputPath, aspectRatio = "9:16", model = "zimage") => {
        const apiKey = process.env.POLLINATIONS_API_KEY?.trim();

        // Convert aspect ratio to width/height
        const isPortrait = aspectRatio === "9:16";
        const width = isPortrait ? 720 : 1280;
        const height = isPortrait ? 1280 : 720;

        const maxAttempts = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                console.log(`[Pollinations IMG] Creating image (attempt ${attempt}/${maxAttempts}) model=${model}: ${prompt.substring(0, 60)}...`);

                const sanitizedPrompt = prompt.replace(/%/g, ' percent');
                const encodedPrompt = encodeURIComponent(sanitizedPrompt);
                const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${model}&width=${width}&height=${height}&seed=${Math.floor(Math.random() * 999999)}&enhance=false`;

                const { statusCode, body } = await request(url, {
                    method: 'GET',
                    headers: {
                        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                    }
                });

                if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
                    console.warn(`[Pollinations IMG] Server error ${statusCode} on attempt ${attempt}. Retrying in 5s...`);
                    lastError = new Error(`Pollinations image error ${statusCode}`);
                    await body.text(); // drain body
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }

                if (statusCode !== 200) {
                    const errText = await body.text();
                    console.error(`[Pollinations IMG] Error ${statusCode}: ${errText}`);
                    throw new Error(`Pollinations image error ${statusCode}: ${errText}`);
                }

                // Save binary image
                const chunks = [];
                for await (const chunk of body) chunks.push(chunk);
                const imageBuffer = Buffer.concat(chunks);
                fs.writeFileSync(outputPath, imageBuffer);

                console.log(`[Pollinations IMG] Image saved to: ${outputPath}`);
                return await compressImageToBase64(outputPath);

            } catch (e) {
                lastError = e;
                if (attempt < maxAttempts) {
                    console.warn(`[Pollinations IMG] Attempt ${attempt} failed: ${e.message}. Retrying in 5s...`);
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        }

        throw lastError || new Error('Pollinations image create failed after 3 attempts');
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

    // Pollinations Helper: Remix image using image reference URL
    // Pollinations kontext/seedream support reference via ?image= param
    // For models without img2img we just call create again (no reference)
    const remixImageViaPollinations = async (prompt, referenceImagePath, outputPath, aspectRatio = "9:16", model = "zimage") => {
        // Upload the reference image first, then use its URL via media:// or just re-generate
        // Pollinations img2img: pass image as base64 data URI via POST form OR use kontext model
        // Simplest reliable approach: generate fresh with same prompt (all 3 models are text->image)
        console.log(`[Pollinations IMG] Remix → generating new image with same prompt, model=${model}`);
        return await createImageViaPollinations(prompt, outputPath, aspectRatio, model);
    };

    // ── П.4: Worker Thread обёртка для генерации изображений ─────────────────
    // Запускает image-worker.cjs в отдельном потоке, не блокируя главный.
    const createImageViaWorker = (prompt, outputPath, aspectRatio = '9:16', model = 'zimage', progressCallback = null) => {
        return new Promise((resolve, reject) => {
            const apiKey = process.env.POLLINATIONS_API_KEY?.trim() || '';
            const worker = new Worker(path.join(__dirname, 'image-worker.cjs'), {
                workerData: { prompt, outputPath, aspectRatio, model, apiKey, seed: Math.floor(Math.random() * 999999) }
            });

            worker.on('message', (msg) => {
                if (msg.type === 'progress' && progressCallback) {
                    progressCallback({ attempt: msg.attempt, maxAttempts: msg.maxAttempts });
                } else if (msg.type === 'attempt_failed') {
                    console.warn(`[Worker] Attempt ${msg.attempt} failed: ${msg.error}`);
                } else if (msg.type === 'done') {
                    resolve(msg.base64);
                } else if (msg.type === 'error') {
                    reject(new Error(msg.error));
                }
            });

            worker.on('error', (err) => reject(err));
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
            });
        });
    };


    ipcMain.handle('generate-image', async (event, { themeName, stageCount = 6, aspectRatio = "9:16", imageModel = "zimage" }) => {
        // ── П.1: Регистрируем задачу в очереди ──────────────────────────────
        const taskId = queueManager.enqueue(TASK_TYPE.GENERATE_IMAGE, { themeName, stageCount, aspectRatio, imageModel });
        queueManager.markInProgress(taskId, stageCount);

        // ── П.2: Отправляем прогресс в UI ────────────────────────────────────
        const sendImageProgress = (stage, total, message, status = 'generating') => {
            event.sender.send('image-progress', { stage, total, message, status, taskId });
        };

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

            // ── П.5: Инвалидируем кеш при новой генерации ────────────────────
            promptCache.invalidate(themeName, stageCount, aspectRatio);

            sendImageProgress(0, stageCount, `Генерация промптов для "${themeName}"...`, 'prompts');
            console.log(`Generating image prompts for theme: ${themeName} (Stages: ${stageCount}, AR: ${aspectRatio})`);

            const isInterior = themeName.toLowerCase().match(/interior|renovation|remodel|design|apartment|room|kitchen|bathroom|office|chamber|living|bedroom|floor|wall|ceiling|furniture|sofa|closet|decoration|flat|suite/);

            const constructionInstructions = `
      - Image 1 (0%): MUST be an EMPTY site, no parts of the building.
      - Image 2 (approx. ${Math.round(100 / (stageCount - 1))} %): Groundwork, excavation, or foundation only.
      - intermediate stages: showing progressive structural growth (framing, walls, roof). MUST feature 2-4 professional construction workers in safety vests and helmets, actively working (e.g., checking blueprints, operating heavy machinery, or doing masonry).`;

            const renovationInstructions = `
      - Image 1 (0%): MUST be the EXISTING OLD space before any work. Dilapidated, empty room, or space stripped to bare concrete/studs. No people.
      - Image 2 (approx. ${Math.round(100 / (stageCount - 1))} %): Demolition, debris, or early plumbing/electrical installation inside the room. MUST feature 2-3 professional craftsmen actively working.
      - intermediate stages: showing progressive interior growth (drywall, tiling, floor installation). MUST feature 2-4 professional craftsmen/workers actively working (e.g., tiling, painting, or installing fixtures).
      - Penultimate stage (${stageCount - 1}): Interior is complete, start of PROTECTED or partially unwrapped high-end furniture placement. Feature 2-3 workers carefully moving or unboxing designer furniture.
      - Final Image (${stageCount}) (100%): Final architectural masterpiece. FULLY FURNISHED with the EXACT SAME designer furniture from the previous stage, now fully unveiled, accessorized with premium decor, professional architectural lighting, and pristine finish. STRICTLY NO WORKERS. Must look like a high-end magazine shoot.
      
      STRICT INTERIOR RULES:
      - This is an INTERNAL room project. 
      - DO NOT generate any images of the building's exterior, the sky, the land, or the natural ground.
      - ALL stages must be shot from INSIDE the room. 
      - If Stage 1 is an "empty site", it means an empty room, NOT a field of grass.`;

            const fullSystemPrompt = `You are a ${isInterior ? "High-End Architectural Interior Designer and Luxury Home Stylist" : "Technical Construction & Engineering Consultant"}.
      Project: "${themeName}" (Type: ${isInterior ? "Interior Renovation" : "New Exterior Construction"})
      Task: Generate ${stageCount} hyper-realistic prompts showing the CHRONOLOGICAL PROGRESS of this project from 0% to 100%.
      
      GLOBAL RULES (STRICT):
      - Output language: English only.
      - Image prompts must be detailed, massive in size and details.
      - Visuals must be realistic, cinematic, professional.
      - No worker faces visible.
      - No fantasy or exaggerated elements.
      - Logical construction flow.
      - Consistent camera angle across all outputs.
      
      VARIABLE HANDLING (CRITICAL):
      - Analysis the "Project" name carefully. It contains specific variables: [ROOM_TYPE], [THEME], [ELEMENT], [OBJECTS].
      - You MUST incorporate these variables into the final design (Stage ${stageCount}) and hints of them in earlier stages.
      - Example: If Project is "Master Bedroom - Ocean-Inspired Floor", you MUST describe an epoxy river-style floor with embedded marine life (whales, dolphins) in the final stage.
      
      RULES FOR PROMPTS:
      - Total stages to generate: ${stageCount}.
      - Orientation: ${aspectRatio === "16:9" ? "Landscape 16:9" : "Portrait 9:16"}.
      ${isInterior ? renovationInstructions : constructionInstructions}
      - Last Image (${stageCount}) (100%): Final completed architectural masterpiece. FULLY FURNISHED. The custom [ELEMENT] (from Project name) must be the focal point, featuring the specific [THEME] and [OBJECTS] (e.g., underwater scene with whales if requested). STRICTLY NO WORKERS. Must look like a high-end magazine shoot.
      
      CRITICAL: Ensure consistent camera angle and scale across all stages. 
      WORKFORCE RULES (Stages 2 to ${stageCount - 1}):
      - Always include 2-4 professional workers or craftsmen.
      - They must be actively engaged in a logical construction/renovation task relevant to the stage.
      - Workers must be diverse, wearing clean, professional safety gear (helmets, vests) or craftsman uniforms.
      - No visible faces (back to camera or side profiles) to avoid AI distortion.

      ADVANCED DESIGN MODIFICATION RULES (User Requests):
      - If the user theme implies bespoke elements (e.g., epoxy floors, specific art), implement them with extreme realism.
      - Example: Modify surfaces (floor/wall) to include embedded objects beneath transparent glossy layers (like deep-sea life or luxury objects) if the theme suggests a creative luxury style.
      - Ensure the result remains ultra-realistic, high-end, and cinematic — not cartoonish or illustrative.
      
      STRICT ARCHITECTURAL & FURNITURE PERSISTENCE RULES:
      1. Establish key attributes (window shapes, wall textures, floor materials) early.
      2. EXPLICITLY REPEAT those attributes in ALL subsequent prompts once they appear.
      3. FURNITURE CONTINUITY: If furniture or decor starts appearing in late stages, it MUST be described consistently.
      4. Do NOT let the AI assume details; specify colors and materials in every stage prompt to avoid "drift".
      Output strictly in JSON format with keys: "image1", "image2", ..., "image${stageCount}".`;
            const WORKING_MODELS = ['gemini-3-flash', 'gemini-3.1-pro', 'gpt-4o'];
            const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
            const customUrl = process.env.CUSTOM_AI_URL?.trim();
            const pollKey = process.env.POLLINATIONS_API_KEY?.trim();
            const pollUrl = 'https://gen.pollinations.ai/v1/chat/completions';

            // Rotation logic: try custom models first, then fallback to Pollinations
            let promptResponse = null;
            const modelsToTry = customUrl ? [...WORKING_MODELS, 'openai-large'] : ['openai-large'];

            for (const model of modelsToTry) {
                const isCustom = WORKING_MODELS.includes(model);
                const apiUrl = isCustom && customUrl ? customUrl : pollUrl;
                const apiKey = isCustom && customUrl ? customKey : pollKey;

                try {
                    console.log(`[Prompts] Trying model=${model} at ${apiUrl}...`);
                    const response = await request(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                        },
                        body: JSON.stringify({
                            model,
                            messages: [{ role: 'user', content: fullSystemPrompt }],
                            response_format: { type: 'json_object' },
                            seed: Math.floor(Math.random() * 100000)
                        }),
                        headersTimeout: 60_000,
                        bodyTimeout: 60_000,
                    });

                    if (response.statusCode === 200) {
                        promptResponse = await response.body.text();
                        break;
                    }
                    console.warn(`[Prompts] model=${model} returned status ${response.statusCode}`);
                } catch (e) {
                    console.error(`[Prompts] Model ${model} failed: ${e.message}`);
                }
            }

            if (!promptResponse) throw new Error("Failed to generate image prompts with all models.");

            let prompts = {};
            try {
                const extractJSON = (str) => {
                    const start = str.indexOf('{');
                    const end = str.lastIndexOf('}');
                    if (start !== -1 && end !== -1) return str.substring(start, end + 1);
                    return str;
                };
                const cleanJSON = extractJSON(promptResponse);
                console.log("[DEBUG] Raw response text:", cleanJSON.substring(0, 500));
                const data = JSON.parse(cleanJSON);
                console.log("[DEBUG] Parsed data structure:", JSON.stringify(data).substring(0, 300));

                // Try multiple parsing strategies
                let content = data.choices?.[0]?.message?.content || data.content || data.text || data;
                console.log("[DEBUG] Extracted content type:", typeof content);
                console.log("[DEBUG] Extracted content preview:", typeof content === 'string' ? content.substring(0, 300) : JSON.stringify(content).substring(0, 300));

                if (typeof content === 'string') {
                    // Try to find JSON in the string
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            prompts = JSON.parse(jsonMatch[0]);
                        } catch (e) {
                            console.warn("JSON parse failed on regex match, trying relaxed parsing:", e.message);
                            // Fallback: simpler regex or manual construction if needed
                            throw new Error("Failed to parse extracted JSON string");
                        }
                    } else {
                        // If no JSON block found, maybe it IS the prompts object but stringified weirdly?
                        // Or maybe it's just text.
                        console.warn("No JSON block found in content string.");
                        // Last ditch attempt: check if content is actually a JSON-like string starting with {
                        if (content.trim().startsWith('{')) {
                            prompts = JSON.parse(content);
                        } else {
                            throw new Error("No JSON object found in response content");
                        }
                    }
                } else if (typeof content === 'object' && content !== null) {
                    console.log("[DEBUG] Content is already an object.");
                    prompts = content;
                } else {
                    throw new Error("Unexpected content type: " + typeof content);
                }
                if (prompts.prompts) prompts = prompts.prompts;
                else if (prompts.images) prompts = prompts.images;

            } catch (error) {
                console.error("Failed to parse prompts JSON:", error);
                console.error("[ERROR] Full response (first 300 chars):", responseText ? responseText.substring(0, 300) : 'EMPTY');
                throw new Error("Model returned invalid JSON format: " + error.message);
            }

            const promptsPath = path.join(imagesDir, 'prompts.json');
            let allPrompts = {};
            if (fs.existsSync(promptsPath)) { try { allPrompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8')); } catch (e) { } }
            allPrompts[themeName] = prompts;
            fs.writeFileSync(promptsPath, JSON.stringify(allPrompts, null, 2));

            // ── П.5: Сохраняем промпты в кеш ─────────────────────────────────
            promptCache.set(themeName, stageCount, aspectRatio, prompts);

            const keys = Array.from({ length: stageCount }, (_, i) => `image${i + 1}`);
            const prompt = prompts[keys[0]]?.trim();
            const localFilePaths = [];

            if (prompt) {
                const fileName = `image_1.jpg`;
                const filePath = path.join(imagesDir, fileName);
                console.log(`[generate-image] Using Pollinations model: ${imageModel}`);
                // ── П.2: Прогресс перед генерацией изображения ───────────────
                sendImageProgress(1, stageCount, `Генерация Stage 1 (${imageModel})...`, 'generating');
                // ── П.4: Генерируем через Worker Thread ───────────────────────
                const imageB64 = await createImageViaWorker(prompt, filePath, aspectRatio, imageModel, ({ attempt, maxAttempts }) => {
                    sendImageProgress(1, stageCount, `Stage 1: попытка ${attempt}/${maxAttempts}...`, 'generating');
                });

                const mediaPath = `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;
                localFilePaths.push(mediaPath);

                const historyPath = path.join(imagesDir, 'generation_history.json');
                let history = {};
                if (fs.existsSync(historyPath)) { try { history = JSON.parse(fs.readFileSync(historyPath, 'utf8')); } catch (e) { } }
                history[themeName] = new Array(stageCount).fill(null);
                history[themeName][0] = imageB64;
                fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

                // ── П.2: Сигнал готовности Stage 1 ───────────────────────────
                sendImageProgress(1, stageCount, `Stage 1 готов!`, 'done');
            }

            const resultArr = new Array(stageCount).fill(null);
            if (localFilePaths[0]) resultArr[0] = localFilePaths[0];
            // ── П.1: Задача завершена ──────────────────────────────────────────
            queueManager.markCompleted(taskId, { stagesDone: 1, total: stageCount });
            return resultArr;
        } catch (error) {
            console.error("Generate Image Error:", error);
            queueManager.markFailed(taskId, error.message);
            sendImageProgress(0, stageCount, `Ошибка: ${error.message}`, 'error');
            throw new Error(error.message);
        }
    });

    ipcMain.handle('generate-image-stage', async (event, { themeName, index, stageCount, aspectRatio, imageModel = "zimage" }) => {
        // ── П.2: Прогресс на уровне изображений ─────────────────────────────
        const sendStageProgress = (msg, status = 'generating') => {
            event.sender.send('image-progress', { stage: index + 1, total: stageCount, message: msg, status });
        };
        try {
            sendStageProgress(`Подготовка Stage ${index + 1}...`, 'preparing');
            const imagesDir = path.join(__dirname, 'Image');
            if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir);

            // ── П.5: Пробуем взять промпт из кеша ────────────────────────────
            let prompts = promptCache.get(themeName, stageCount, aspectRatio) || {};
            if (!prompts[`image${index + 1}`]) {
                const promptsPath = path.join(imagesDir, 'prompts.json');
                if (fs.existsSync(promptsPath)) prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf8'))[themeName] || {};
            }

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
                console.log(`Generating Stage ${index + 1} via Pollinations REMIX (model=${imageModel})...`);
                sendStageProgress(`Remix Stage ${index + 1} (${imageModel})...`);
                imageB64 = await remixImageViaPollinations(prompt, filePath, filePath, aspectRatio, imageModel);
            } else {
                console.log(`Generating Stage ${index + 1} via Pollinations CREATE (model=${imageModel})...`);
                sendStageProgress(`Генерация Stage ${index + 1} (${imageModel})...`);
                imageB64 = await createImageViaPollinations(prompt, filePath, aspectRatio, imageModel);
            }

            const mediaPath = `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;

            // Update history with new Base64
            if (!history[themeName]) history[themeName] = new Array(stageCount).fill(null);
            history[themeName][index] = imageB64;
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

            sendStageProgress(`Stage ${index + 1} готов!`, 'done');
            return mediaPath;
        } catch (error) {
            console.error("Stage Error:", error);
            event.sender.send('image-progress', { stage: index + 1, total: stageCount, message: `Ошибка Stage ${index + 1}: ${error.message}`, status: 'error' });
            throw error;
        }
    });

    ipcMain.handle('regenerate-single-image', async (event, { themeName, index, stageCount, aspectRatio, imageModel = "zimage" }) => {
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
            } else if (index === stageCount - 2) {
                stageDesc = isInterior
                    ? `Interior renovation penultimate stage (${completion}%). Construction is complete, premium designer furniture is being placed but may still be partially protected or partially unwrapped.`
                    : `Construction nearly complete (${completion}%). Final exterior cladding and landscaping finishing touches.`;
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
            2. PERMANENT FEATURES: If the context mentions specific features (e.g., marble floors, large windows, specific furniture), you MUST include them in this prompt.
            3. WORKFORCE INTEGRATION: Unless this is Stage 1 or the Final Stage, EXPLICITLY include 2-4 professional workers/craftsmen actively engaged in the work described. No visible faces (back to camera or profiles).
            4. FURNITURE PERSISTENCE: Maintain established furniture styles and materials. 
            5. Orientation: ${aspectRatio}. 
            Output ONLY the improved prompt text. No preamble.`;

            const WORKING_MODELS = ['gemini-3-flash', 'gemini-3.1-pro', 'gpt-4o'];
            const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
            const customUrl = process.env.CUSTOM_AI_URL?.trim();
            const pollKey = process.env.POLLINATIONS_API_KEY?.trim();
            const pollUrl = 'https://gen.pollinations.ai/v1/chat/completions';

            let imagePrompt = "";
            const modelsToTry = customUrl ? [...WORKING_MODELS, 'openai-large'] : ['openai-large'];

            for (const model of modelsToTry) {
                const isCustom = WORKING_MODELS.includes(model);
                const apiUrl = isCustom && customUrl ? customUrl : pollUrl;
                const apiKey = isCustom && customUrl ? customKey : pollKey;

                try {
                    console.log(`[Regen Prompt] Trying model=${model}...`);
                    const { statusCode, body } = await request(apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                        },
                        body: JSON.stringify({ model, messages: [{ role: 'user', content: singlePromptRequest }] })
                    });
                    if (statusCode === 200) {
                        imagePrompt = await body.text();
                        break;
                    }
                } catch (e) {
                    console.error(`[Regen Prompt] Model ${model} failed: ${e.message}`);
                }
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
                console.log(`Regenerating ${index + 1} via Pollinations REMIX (model=${imageModel})...`);
                imageB64 = await remixImageViaPollinations(imagePrompt, filePath, filePath, aspectRatio, imageModel);
            } else {
                console.log(`Regenerating ${index + 1} via Pollinations CREATE (model=${imageModel})...`);
                imageB64 = await createImageViaPollinations(imagePrompt, filePath, aspectRatio, imageModel);
            }

            const mediaPath = `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;

            if (!history[themeName]) history[themeName] = new Array(stageCount).fill(null);
            history[themeName][index] = imageB64;
            fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

            return mediaPath;
        } catch (error) {
            console.error("Regen Error:", error);
            throw error;
        }
    });

    // ============ VIDEO GENERATION WITH FREEPIK (PixVerse V5) ============

    // Helper: Create video task via Freepik PixVerse V5 — WITH KEY ROTATION
    const createFreepikVideoTask = async (imageBase64, prompt, duration = 5, resolution = '720p') => {
        const totalKeys = freepikKeys.totalKeys();
        if (totalKeys === 0) throw new Error('No FREEPIK_API_KEY configured in .env');

        const payload = JSON.stringify({
            model: 'pixverse-v5',
            image: `data:image/jpeg;base64,${imageBase64}`,
            prompt: prompt,
            duration: parseInt(duration),
            resolution: resolution
        });

        let triedKeys = 0;
        let lastError = null;

        while (triedKeys < totalKeys) {
            const apiKey = freepikKeys.current();
            const keyLabel = `key ${freepikKeys.currentKeyIndex()}/${totalKeys}`;
            console.log(`[Freepik PixVerse] Creating task (${resolution}, ${duration}s) — ${keyLabel}...`);

            try {
                const { statusCode, body } = await request('https://api.freepik.com/v1/ai/image-to-video', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-freepik-api-key': apiKey,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    body: payload
                });
                const responseText = await body.text();
                console.log(`[Freepik PixVerse] Create response (${statusCode}) ${keyLabel}:`, responseText.substring(0, 200));

                if ((statusCode === 200 || statusCode === 201 || statusCode === 202)
                    && !freepikKeys.isLimitError(statusCode, responseText)) {
                    // Robust JSON extraction
                    const extractJSON = (str) => {
                        const start = str.indexOf('{');
                        const end = str.lastIndexOf('}');
                        if (start !== -1 && end !== -1) return str.substring(start, end + 1);
                        return str;
                    };
                    const cleanJSON = extractJSON(responseText);
                    const data = JSON.parse(cleanJSON);
                    const taskId = data.data?.task_id || data.data?.id || data.task_id || data.id;
                    if (!taskId) throw new Error(`No task_id in response: ${responseText.substring(0, 200)}`);
                    console.log(`[Freepik PixVerse] Task created: ${taskId} (${keyLabel})`);
                    return taskId;
                }

                // Limit / auth error — rotate
                console.warn(`[Freepik PixVerse] ${keyLabel} rejected (${statusCode}): ${responseText.substring(0, 120)}`);
                freepikKeys.rotate(`HTTP ${statusCode}`);
                triedKeys++;
                lastError = new Error(`Freepik ${statusCode}: ${responseText.substring(0, 120)}`);

            } catch (e) {
                console.warn(`[Freepik PixVerse] ${keyLabel} error: ${e.message}`);
                freepikKeys.rotate(e.message);
                triedKeys++;
                lastError = e;
            }
        }

        throw lastError || new Error(`All ${totalKeys} Freepik key(s) exhausted for PixVerse task`);
    };

    // Helper: Check Freepik PixVerse task status — uses current active key
    const checkFreepikTaskStatus = async (taskId) => {
        const apiKey = freepikKeys.current();
        const { statusCode, body } = await request(`https://api.freepik.com/v1/ai/image-to-video/${taskId}`, {
            method: 'GET',
            headers: {
                'x-freepik-api-key': apiKey,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            }
        });
        const responseText = await body.text();
        if (statusCode !== 200) throw new Error(`Freepik status check failed ${statusCode}: ${responseText}`);
        const extractJSON = (str) => {
            const start = str.indexOf('{');
            const end = str.lastIndexOf('}');
            if (start !== -1 && end !== -1) return str.substring(start, end + 1);
            return str;
        };
        return JSON.parse(extractJSON(responseText));
    };

    // Helper: Wait for Freepik video completion with polling
    const waitForFreepikCompletion = async (taskId, progressCallback) => {
        const maxAttempts = 120; // 10 minutes (120 * 5 sec)

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const result = await checkFreepikTaskStatus(taskId);
            const data = result.data || result;
            const state = data.status || data.state || '';

            console.log(`[Freepik] Task ${taskId} status: ${state} (attempt ${attempt + 1}/${maxAttempts})`);

            if (state === 'completed' || state === 'success' || state === 'COMPLETED') {
                const videoUrl = data.video?.url || data.videoUrl || data.result?.url
                    || data.output?.url || (data.videos && data.videos[0]?.url)
                    || (data.videos && data.videos[0]);
                if (videoUrl) return videoUrl;
                throw new Error('No video URL in completed result: ' + JSON.stringify(data).substring(0, 300));
            }

            if (state === 'failed' || state === 'error' || state === 'FAILED') {
                throw new Error(`Video generation failed: ${data.error || data.message || data.failMsg || 'Unknown error'}`);
            }

            if (progressCallback) {
                progressCallback({ attempt: attempt + 1, maxAttempts, state });
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        throw new Error('Video generation timeout (10 minutes)');
    };

    // Helper: Download video
    const downloadVideo = async (videoUrl, outputPath) => {
        console.log(`[Freepik] Downloading video from ${videoUrl}`);

        const { statusCode, body } = await request(videoUrl, {
            method: 'GET'
        });

        if (statusCode !== 200) {
            throw new Error(`Failed to download video: ${statusCode}`);
        }

        await streamPipeline(body, fs.createWriteStream(outputPath));
        console.log(`[Freepik] Video downloaded: ${outputPath}`);

        return outputPath;
    };

    // Helper: Extract last frame from video using ffmpeg
    const extractLastFrame = (videoPath, outputPath) => {
        return new Promise((resolve, reject) => {
            console.log(`[FFMPEG] Extracting last frame from ${videoPath}`);
            const process = spawn('ffmpeg', [
                '-sseof', '-0.1',
                '-i', videoPath,
                '-update', '1',
                '-q:v', '2',
                '-frames:v', '1',
                outputPath,
                '-y'
            ]);

            process.on('close', (code) => {
                if (code === 0) {
                    console.log(`[FFMPEG] Extracted last frame: ${outputPath}`);
                    resolve(outputPath);
                } else {
                    reject(new Error(`FFMPEG extraction failed with code ${code}`));
                }
            });
        });
    };

    // Main handler: Generate all videos via Freepik PixVerse V5
    ipcMain.handle('generate-videos', async (event, { themeName, stageCount = 6, resolution = "720p", duration = "5" }) => {
        try {
            const totalVideos = stageCount - 1;

            event.sender.send('video-progress', {
                current: 0, total: totalVideos, status: 'starting',
                message: `🎬 Запуск генерации ${totalVideos} видео через Freepik PixVerse V5 (${resolution}, ${duration}s)...`
            });

            const videosDir = path.join(__dirname, 'Videos');
            if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir);

            const imagesDir = path.join(__dirname, 'Image');
            const finalVideoDir = path.join(__dirname, 'FinalVideo');
            if (!fs.existsSync(finalVideoDir)) fs.mkdirSync(finalVideoDir);

            const isInterior = themeName.toLowerCase().match(/interior|renovation|remodel|design|apartment|room|kitchen|bathroom|office|chamber/);

            const videoPrompt = isInterior ?
                `RENOVATION PROCESS PROMPTS Transition: image 1 to Image 2 Add workers in fast timelapse motion Surface preparation and structural work Begin installing luxury materials No visible faces Realistic construction logic Transition: Image 2 to Image 3 workers Complete finishing and detailing Activate lighting systems Clean and polish all surfaces Reveal final luxury design with cinematic composition Remove all workers and tools at the end GLOBAL RULES (STRICT) Output language: English only image prompts must be detailed and massive in size and details, Visuals must be realistic, cinematic, professional No worker faces visible No fantasy or exaggerated elements Logical construction flow Consistent camera angle across all outputs`
                : `CONSTRUCTION PROGRESS TIMELAPSE - Transition showing active construction progress in fast motion. Highlighting workforce movements, material assembly, and structural growth. Professional construction logic. Revealing the evolution of the project from scratch to final completion. Realistic, cinematic, 8K, high quality. No visible faces. Consistent lighting.`;

            const videoPromptsLog = {
                timestamp: new Date().toISOString(),
                theme: themeName,
                model: 'pixverse-v5',
                system_prompt: videoPrompt,
                stages: []
            };

            // Generate stageCount - 1 videos using RECURSIVE SEAMLESS approach
            for (let i = 0; i < totalVideos; i++) {
                const startImagePath = path.join(imagesDir, `image_${i + 1}.jpg`);

                if (!fs.existsSync(startImagePath)) {
                    throw new Error(`Starting image ${i + 1} not found. Ensure Stage 1 is generated.`);
                }

                event.sender.send('video-progress', {
                    current: i, total: totalVideos, status: 'preparing',
                    message: `[${i + 1}/${totalVideos}] Подготовка изображения...`
                });

                // Read image as base64 (Freepik accepts base64 directly — no upload needed)
                const imageBase64 = fs.readFileSync(startImagePath, { encoding: 'base64' });

                console.log(`[Freepik] Starting video ${i + 1}/${totalVideos} from ${path.basename(startImagePath)}`);

                videoPromptsLog.stages.push({
                    video_index: i + 1, source: path.basename(startImagePath), prompt: videoPrompt
                });

                // 1. Create task
                event.sender.send('video-progress', {
                    current: i, total: totalVideos, status: 'creating_task',
                    message: `[${i + 1}/${totalVideos}] Задание в Freepik PixVerse V5...`
                });
                const taskId = await createFreepikVideoTask(imageBase64, videoPrompt, duration, resolution);

                // 2. Wait for completion
                event.sender.send('video-progress', {
                    current: i, total: totalVideos, status: 'waiting', taskId,
                    message: `Видео ${i + 1} в очереди Freepik, ожидаем...`
                });
                const videoUrl = await waitForFreepikCompletion(taskId, (progress) => {
                    event.sender.send('video-progress', {
                        current: i, total: totalVideos, status: 'processing',
                        message: `Генерация видео ${i + 1}... (${progress.attempt}/${progress.maxAttempts})`
                    });
                });

                console.log(`[Freepik] Video ${i + 1} completed: ${videoUrl}`);

                // 3. Download video
                const videoFileName = `video_${i + 1}.mp4`;
                const videoPath = path.join(videosDir, videoFileName);
                event.sender.send('video-progress', {
                    current: i, total: totalVideos, status: 'downloading',
                    message: `[${i + 1}/${totalVideos}] Загрузка видео...`
                });
                await downloadVideo(videoUrl, videoPath);

                // 4. Extract last frame for seamless chain
                if (i < totalVideos - 1) {
                    const nextImagePath = path.join(imagesDir, `image_${i + 2}.jpg`);
                    event.sender.send('video-progress', {
                        current: i, total: totalVideos, status: 'processing',
                        message: `[${i + 1}/${totalVideos}] Извлечение кадра...`
                    });
                    await extractLastFrame(videoPath, nextImagePath);
                    console.log(`[Seamless] image_${i + 2}.jpg extracted`);
                }

                const videoUrlForUI = `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;
                event.sender.send('video-progress', {
                    current: i + 1, total: totalVideos, status: 'done',
                    videoUrl: videoUrlForUI,
                    message: `Фрагмент ${i + 1} готов.`
                });
            }

            fs.writeFileSync(path.join(finalVideoDir, 'video_prompts.json'), JSON.stringify(videoPromptsLog, null, 2));
            console.log(`[Freepik] Recursive seamless video pipeline completed.`);

            return [];
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

            // Robust JSON extraction
            const extractJSON = (str) => {
                const start = str.indexOf('{');
                const end = str.lastIndexOf('}');
                if (start !== -1 && end !== -1) return str.substring(start, end + 1);
                return str;
            };

            const promptsRaw = fs.readFileSync(path.join(finalDir, 'video_prompts.json'), 'utf8');
            const cleanJSON = extractJSON(promptsRaw);
            let scenes = JSON.parse(cleanJSON).stages.map(s => ({
                video_index: s.video_index,
                source: s.source,
                prompt: s.prompt
            }));

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
                        resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
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

        registerSkeletonHandlers(ipcMain);
    registerGLabsHandlers(ipcMain);

    createWindow();
});

app.on('window-all-closed', () => {
    // ── П.1: Корректно закрываем SQLite при выходе ───────────────────────────
    queueManager.close();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
