// ============ G-LABS AUTOMATION — WEBHOOK INTEGRATION ============
const path = require('path');
const fs = require('fs');
const { request } = require('undici');
const { spawn } = require('child_process');

const GLABS_BASE_URL = process.env.GLABS_WEBHOOK_URL || 'http://127.0.0.1:8765';
const GLABS_API_KEY = process.env.GLABS_API_KEY || '';
const GLABS_EXE_PATH = process.env.GLABS_EXE_PATH || 'D:\\Open_Project\\G-Labs-Automation-v2.0.0\\G-LabsAutomation.exe';

// Папки для сохранения результатов по разделам
const SECTION_DIRS = {
    skeleton: path.join(__dirname, 'SkeletonShorts'),
    timelapse: path.join(__dirname, 'Images'),
    health: path.join(__dirname, 'SkeletonShorts'),
    objects: path.join(__dirname, 'SkeletonShorts'),
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const gLabsRequest = async (endpoint, options = {}) => {
    const apiKey = GLABS_API_KEY;
    const url = `${GLABS_BASE_URL}${endpoint}`;

    const { statusCode, body } = await request(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
            ...(options.headers || {}),
        },
        headersTimeout: 30_000,
        bodyTimeout: 30_000,
    });

    const text = await body.text();
    return { statusCode, text };
};

// ── Polling задачи до завершения ─────────────────────────────────────────────
const pollTask = async (taskId, onProgress, maxAttempts = 120) => {
    for (let i = 1; i <= maxAttempts; i++) {
        await new Promise(r => setTimeout(r, 5000)); // каждые 5 сек

        const { statusCode, text } = await gLabsRequest(`/api/status/${taskId}`);
        if (statusCode !== 200) throw new Error(`Status check failed (${statusCode}): ${text}`);

        const data = JSON.parse(text);
        console.log(`[G-Labs Poll] task=${taskId} status=${data.status} attempt=${i}/${maxAttempts}`);

        if (onProgress) onProgress({ taskId, status: data.status, attempt: i });

        if (data.status === 'completed') return data;
        if (data.status === 'failed') {
            throw new Error(`G-Labs task failed: ${data.error || data.error_detail || 'Unknown error'}`);
        }
    }
    throw new Error(`G-Labs task timeout after ${maxAttempts} attempts (task: ${taskId})`);
};

// ── Скачивание файла из G-Labs ───────────────────────────────────────────────
const downloadGLabsFile = async (fileUrl, destPath) => {
    // fileUrl вида http://127.0.0.1:8765/api/files/image_001.png
    const filename = fileUrl.split('/').pop();
    const { statusCode, body } = await request(fileUrl, {
        headers: GLABS_API_KEY ? { 'X-API-Key': GLABS_API_KEY } : {},
        headersTimeout: 60_000,
        bodyTimeout: 60_000,
    });

    if (statusCode !== 200) throw new Error(`File download failed (${statusCode}): ${filename}`);

    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const chunks = [];
    for await (const chunk of body) chunks.push(chunk);
    fs.writeFileSync(destPath, Buffer.concat(chunks));
    console.log(`[G-Labs] Downloaded: ${destPath}`);
    return destPath;
};

// ── Регистрация IPC handlers ─────────────────────────────────────────────────

function registerGLabsHandlers(ipcMain) {

    // 1. Проверка статуса G-Labs Webhook Server
    ipcMain.handle('glabs-health-check', async () => {
        try {
            const { statusCode, text } = await gLabsRequest('/api/health');
            if (statusCode === 200) {
                const data = JSON.parse(text);
                return { running: true, ...data };
            }
            return { running: false, error: `HTTP ${statusCode}` };
        } catch (e) {
            return { running: false, error: e.message };
        }
    });

    // 2. Запуск G-LabsAutomation.exe (ручной запуск по кнопке)
    ipcMain.handle('glabs-launch', async () => {
        try {
            if (!fs.existsSync(GLABS_EXE_PATH)) {
                throw new Error(`G-Labs.exe not found at: ${GLABS_EXE_PATH}`);
            }
            const child = spawn(GLABS_EXE_PATH, [], {
                detached: true,
                stdio: 'ignore',
                cwd: path.dirname(GLABS_EXE_PATH),
            });
            child.unref();
            console.log(`[G-Labs] Launched: ${GLABS_EXE_PATH}`);
            return { success: true };
        } catch (e) {
            console.error(`[G-Labs] Launch failed: ${e.message}`);
            return { success: false, error: e.message };
        }
    });

    // 3. Список всех задач в очереди
    ipcMain.handle('glabs-list-tasks', async () => {
        try {
            const { statusCode, text } = await gLabsRequest('/api/tasks');
            if (statusCode !== 200) throw new Error(`HTTP ${statusCode}: ${text}`);
            return JSON.parse(text);
        } catch (e) {
            console.error(`[G-Labs] List tasks error: ${e.message}`);
            throw e;
        }
    });

    // 4. Статус конкретной задачи
    ipcMain.handle('glabs-task-status', async (event, { taskId }) => {
        try {
            const { statusCode, text } = await gLabsRequest(`/api/status/${taskId}`);
            if (statusCode !== 200) throw new Error(`HTTP ${statusCode}: ${text}`);
            return JSON.parse(text);
        } catch (e) {
            console.error(`[G-Labs] Task status error: ${e.message}`);
            throw e;
        }
    });

    // 5. Генерация изображения через G-Labs
    ipcMain.handle('glabs-generate-image', async (event, {
        prompt,
        model = 'imagen4',
        aspectRatio = '9:16',
        count = 1,
        section = 'skeleton',
        sceneIndex = 0,
    }) => {
        console.log(`[G-Labs IMG] prompt="${prompt.substring(0, 60)}..." model=${model} aspect=${aspectRatio}`);

        // Отправка задачи
        const { statusCode, text } = await gLabsRequest('/api/image/generate', {
            method: 'POST',
            body: JSON.stringify({
                prompt,
                model,
                aspect_ratio: aspectRatio,
                count,
            }),
        });

        if (statusCode !== 202 && statusCode !== 200) {
            throw new Error(`G-Labs image generate failed (${statusCode}): ${text}`);
        }

        const taskData = JSON.parse(text);
        const taskId = taskData.task_id;
        console.log(`[G-Labs IMG] Task created: ${taskId}`);

        // Прогресс в UI
        event.sender.send('glabs-task-progress', { taskId, status: 'pending', type: 'image' });

        // Polling
        const result = await pollTask(taskId, (p) => {
            event.sender.send('glabs-task-progress', { ...p, type: 'image' });
        });

        // Скачиваем файлы
        const sectionDir = SECTION_DIRS[section] || SECTION_DIRS.skeleton;
        if (!fs.existsSync(sectionDir)) fs.mkdirSync(sectionDir, { recursive: true });

        const savedPaths = [];
        for (let i = 0; i < result.results.length; i++) {
            const fileUrl = result.results[i];
            const ext = fileUrl.includes('.png') ? 'png' : 'jpg';
            const destName = count === 1
                ? `scene_${sceneIndex + 1}.jpg`
                : `scene_${sceneIndex + 1}_${i + 1}.${ext}`;
            const destPath = path.join(sectionDir, destName);

            await downloadGLabsFile(fileUrl, destPath);
            savedPaths.push(`media:///${destPath.replace(/\\/g, '/')}?t=${Date.now()}`);
        }

        event.sender.send('glabs-task-progress', { taskId, status: 'completed', type: 'image' });
        return savedPaths;
    });

    // 6. Генерация видео через G-Labs
    ipcMain.handle('glabs-generate-video', async (event, {
        prompt,
        model = 'veo_31_fast',
        aspectRatio = '9:16',
        section = 'skeleton',
        sceneIndex = 0,
    }) => {
        console.log(`[G-Labs VID] prompt="${prompt.substring(0, 60)}..." model=${model}`);

        const { statusCode, text } = await gLabsRequest('/api/video/generate', {
            method: 'POST',
            body: JSON.stringify({
                prompt,
                model,
                aspect_ratio: aspectRatio,
            }),
        });

        if (statusCode !== 202 && statusCode !== 200) {
            throw new Error(`G-Labs video generate failed (${statusCode}): ${text}`);
        }

        const taskData = JSON.parse(text);
        const taskId = taskData.task_id;
        console.log(`[G-Labs VID] Task created: ${taskId}`);

        event.sender.send('glabs-task-progress', { taskId, status: 'pending', type: 'video' });

        // Polling (видео генерируется дольше — до 10 мин)
        const result = await pollTask(taskId, (p) => {
            event.sender.send('glabs-task-progress', { ...p, type: 'video' });
        }, 180);

        // Скачиваем видео
        const sectionDir = SECTION_DIRS[section] || SECTION_DIRS.skeleton;
        if (!fs.existsSync(sectionDir)) fs.mkdirSync(sectionDir, { recursive: true });

        const fileUrl = result.results[0];
        const destPath = path.join(sectionDir, `scene_${sceneIndex + 1}.mp4`);
        await downloadGLabsFile(fileUrl, destPath);

        event.sender.send('glabs-task-progress', { taskId, status: 'completed', type: 'video' });
        return `media:///${destPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    });

    // 7. Генерация изображения для Skeleton Shorts (быстрый обёртка)
    ipcMain.handle('glabs-skeleton-generate-image', async (event, {
        sceneIndex,
        imagePrompt,
        imageModel = 'imagen4',
    }) => {
        return await ipcMain.emit('glabs-generate-image', event, {
            prompt: imagePrompt,
            model: imageModel,
            aspectRatio: '9:16',
            count: 1,
            section: 'skeleton',
            sceneIndex,
        });
    });

    console.log('[G-Labs] Handlers registered ✅');
}

module.exports = { registerGLabsHandlers };
