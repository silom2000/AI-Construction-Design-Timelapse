const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const { spawn } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const isDev = !app.isPackaged;
require('dotenv').config();

// Must be called before app.whenReady() to enable stream support for custom protocol
protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true, bypassCSP: true } }
]);
const { request } = require('undici');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const sharp = require('sharp');
const streamPipeline = promisify(pipeline);
const { registerSkeletonHandlers, synthesizeUnifiedSpeech } = require('./skeleton-handlers.cjs');
const { registerGLabsHandlers } = require('./glabs-handlers.cjs');
const { registerStoryHandlers } = require('./story-handlers.cjs');
const { registerCartoonHandlers } = require('./cartoon-handlers.cjs');
// const freepikKeys = require('./freepik-key-manager.cjs');
const { registerExportHandlers } = require('./export-handlers.cjs');

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

    const startUrl = isDev ? 'http://127.0.0.1:5173' : `file://${path.join(__dirname, '../dist/index.html')}`;

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
    registerExportHandlers();
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

    const { registerTimelapseHandlers } = require('./timelapse-handlers.cjs');
    registerTimelapseHandlers(ipcMain);

    // Use protocol.handle() which properly supports Range requests for video playback
    protocol.handle('media', async (request) => {
        try {
            const { pathToFileURL } = require('url');
            const url = new URL(request.url);
            // On Windows, the pathname for media:///D:/... is /D:/...
            let filePath = decodeURIComponent(url.pathname);
            
            // Strip leading slash if it precedes a drive letter (Windows)
            if (filePath.startsWith('/') && /^[a-zA-Z]:/.test(filePath.substring(1))) {
                filePath = filePath.substring(1);
            }
            
            // Normalize path for the OS
            filePath = path.normalize(filePath);
            
            if (!fs.existsSync(filePath)) {
                return new Response('File not found', { status: 404 });
            }

            const fileUrl = pathToFileURL(filePath).toString();

            // Pass the original request to net.fetch to preserve Range headers for video
            const response = await net.fetch(fileUrl, {
                headers: request.headers,
                method: request.method,
                bypassCustomProtocolHandlers: true
            });

            // Map extension to MIME type
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.webp': 'image/webp',
                '.mp4': 'video/mp4',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav'
            };
            const mimeType = mimeTypes[ext] || response.headers.get('content-type');

            const newHeaders = new Headers(response.headers);
            if (mimeType) newHeaders.set('Content-Type', mimeType);
            newHeaders.set('Access-Control-Allow-Origin', '*');

            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        } catch (err) {
            console.error('[media protocol] Error:', err);
            return new Response('Protocol error', { status: 500 });
        }
    });

    registerSkeletonHandlers(ipcMain);
    registerGLabsHandlers(ipcMain);
    registerStoryHandlers(ipcMain);
    registerCartoonHandlers(ipcMain);

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

