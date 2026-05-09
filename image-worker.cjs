// ============ IMAGE WORKER — П.4: Worker Thread для генерации изображений ============
// Запускается из electron.cjs через worker_threads.
// Выполняет тяжёлую HTTP-генерацию изображений в отдельном потоке,
// не блокируя главный процесс Electron (UI остаётся отзывчивым).

const { workerData, parentPort } = require('worker_threads');
const { request } = require('undici');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// workerData: { prompt, outputPath, aspectRatio, model, apiKey, seed }
const { prompt, outputPath, aspectRatio, model, apiKey, seed } = workerData;

const isPortrait = aspectRatio === '9:16';
const width = isPortrait ? 720 : 1280;
const height = isPortrait ? 1280 : 720;
const maxAttempts = 3;

async function compressToBase64(imagePath, maxWidth = 800, quality = 80) {
    try {
        const buffer = await sharp(imagePath)
            .resize(maxWidth, null, { withoutEnlargement: true, fit: 'inside' })
            .jpeg({ quality })
            .toBuffer();
        return buffer.toString('base64');
    } catch {
        return fs.readFileSync(imagePath, { encoding: 'base64' });
    }
}

(async () => {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            parentPort.postMessage({ type: 'progress', attempt, maxAttempts });

            const sanitizedPrompt = prompt.replace(/%/g, ' percent');
            const encodedPrompt = encodeURIComponent(sanitizedPrompt);
            const useSeed = seed ?? Math.floor(Math.random() * 999999);
            const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=${model}&width=${width}&height=${height}&seed=${useSeed}&enhance=false`;

            const headers = {};
            if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

            const { statusCode, body } = await request(url, { method: 'GET', headers });

            if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
                await body.text();
                lastError = new Error(`Pollinations IMG ${statusCode}`);
                await new Promise(r => setTimeout(r, 5000));
                continue;
            }

            if (statusCode !== 200) {
                const errText = await body.text();
                throw new Error(`Pollinations IMG ${statusCode}: ${errText.substring(0, 120)}`);
            }

            const chunks = [];
            for await (const chunk of body) chunks.push(chunk);
            const imageBuffer = Buffer.concat(chunks);
            fs.writeFileSync(outputPath, imageBuffer);

            const base64 = await compressToBase64(outputPath);
            parentPort.postMessage({ type: 'done', base64, outputPath });
            return;

        } catch (e) {
            lastError = e;
            parentPort.postMessage({ type: 'attempt_failed', attempt, error: e.message });
            if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 5000));
        }
    }

    parentPort.postMessage({ type: 'error', error: lastError?.message || 'Unknown worker error' });
})();
