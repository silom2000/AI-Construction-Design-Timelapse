const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { request } = require('undici');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
require('dotenv').config();

// Re-encoding for preview helper (copied from skeleton-handlers.cjs)
async function reencodeForPreview(inputPath, sceneIndex) {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const previewDir = path.join(skeletonDir, 'preview');
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}.mp4`);
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', previewPath
        ]);
        ffmpeg.on('close', code => {
            resolve(code === 0 ? previewPath : inputPath);
        });
    });
}

async function callPollinations(messages, jsonMode = false) {
    const customKey = process.env.CUSTOM_AI_API_KEY?.trim();
    const customUrl = process.env.CUSTOM_AI_URL?.trim();
    const pollKey = process.env.POLLINATIONS_API_KEY?.trim();
    const pollUrl = 'https://gen.pollinations.ai/v1/chat/completions';

    const WORKING_MODELS = ['gemini-3.1-pro-high', 'gemini-3.1-pro', 'gpt-4o'];
    const modelsToTry = customUrl ? [...WORKING_MODELS, 'openai-large'] : ['openai-large'];

    for (const model of modelsToTry) {
        const isCustom = WORKING_MODELS.includes(model);
        const apiUrl = isCustom && customUrl ? customUrl : pollUrl;
        const apiKey = isCustom && customUrl ? customKey : pollKey;

        try {
            console.log(`[Manual AI] Trying model=${model} at ${apiUrl}`);
            const reqBody = { model, messages };
            if (jsonMode) reqBody.response_format = { type: 'json_object' };

            const { statusCode, body } = await request(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
                body: JSON.stringify(reqBody)
            });

            if (statusCode === 200) {
                const data = JSON.parse(await body.text());
                return data.choices?.[0]?.message?.content || '';
            }
        } catch (e) {
            console.error(`[Manual AI] Model ${model} failed: ${e.message}`);
        }
    }
    return "";
}

function generateAssKaraoke(words) {
    if (!words || words.length === 0) return "";
    const playResX = 720;
    const playResY = 1280;
    const fontName = "Arial Black";

    let header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}
Timer: 100.0000

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontName},56,&H0000FF00,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,1,2,30,30,150,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const toAssTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2).padStart(5, '0');
        return `${h}:${String(m).padStart(2, '0')}:${s}`;
    };

    const chunks = [];
    let currentChunk = [];
    for (const w of words) {
        currentChunk.push(w);
        if (currentChunk.length >= 4) {
            chunks.push(currentChunk);
            currentChunk = [];
        }
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    let events = "";
    for (const chunk of chunks) {
        const start = chunk[0].start;
        const end = chunk[chunk.length - 1].end;
        const startTime = toAssTime(start);
        const endTime = toAssTime(end);

        let lineText = `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,`;
        let lastWordEnd = start;

        for (const w of chunk) {
            const wStart = w.start;
            const wEnd = w.end || (wStart + 0.3);
            const durationCs = Math.max(1, Math.round((wEnd - wStart) * 100));
            const pauseCs = Math.max(0, Math.round((wStart - lastWordEnd) * 100));

            if (pauseCs > 0) lineText += `{\\k${pauseCs}} `;
            lineText += `{\\k${durationCs}}${w.word} `;
            lastWordEnd = wEnd;
        }
        events += lineText + "\n";
    }
    return header + events;
}

async function generateKaraokeSubtitles(videoPath, outputPath, sceneIdx) {
    const audioPath = videoPath.replace('.mp4', '.mp3');
    const assPath = videoPath.replace('.mp4', '.ass');

    console.log(`[Karaoke] Extracting audio for scene ${sceneIdx + 1}...`);
    execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 -y "${audioPath}"`);

    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const audioBuffer = fs.readFileSync(audioPath);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
        audioBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nscribe\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
    ]);

    console.log(`[Karaoke] Transcribing scene ${sceneIdx + 1}...`);
    const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}) },
        body
    });

    const transcribeText = await resBody.text();
    if (statusCode !== 200) throw new Error(`Transcription failed: ${transcribeText}`);
    const data = JSON.parse(transcribeText);
    const words = data.words || [];

    console.log(`[Karaoke] Generating .ass for scene ${sceneIdx + 1}...`);
    const assContent = generateAssKaraoke(words);
    fs.writeFileSync(assPath, assContent);

    console.log(`[Karaoke] Burning subtitles for scene ${sceneIdx + 1}...`);
    // Fix path for Windows ffmpeg
    const safeAssPath = assPath.replace(/\\/g, '/').replace(':', '\\:');
    execSync(`ffmpeg -i "${videoPath}" -vf "ass='${safeAssPath}'" -c:a copy -y "${outputPath}"`);

    // Cleanup
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
    if (fs.existsSync(assPath)) fs.unlinkSync(assPath);
}

async function main() {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const finalDir = path.join(__dirname, 'FinalVideo');
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);

    const useKaraoke = true; // Hardcoded for this manual run

    const rawFiles = fs.readdirSync(skeletonDir)
        .filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub'))
        .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || 0) - parseInt(b.match(/\d+/)?.[0] || 0));

    if (rawFiles.length === 0) {
        console.error('No scene videos found in SkeletonShorts/');
        process.exit(1);
    }

    const videoFiles = [];
    for (const file of rawFiles) {
        const sceneIdx = parseInt(file.match(/\d+/)?.[0] || 0) - 1;
        const inputPath = path.join(skeletonDir, file);
        let activePath = inputPath;

        if (useKaraoke) {
            console.log(`[Manual Assemble] Processing karaoke for scene ${sceneIdx + 1}...`);
            try {
                const subPath = path.join(skeletonDir, `scene_${sceneIdx + 1}_sub.mp4`);
                await generateKaraokeSubtitles(inputPath, subPath, sceneIdx);
                activePath = subPath;
            } catch (e) {
                console.error(`[Manual Assemble] Subtitles failed for scene ${sceneIdx + 1}:`, e.message);
            }
        }
        videoFiles.push(activePath);
    }

    console.log(`[Manual Assemble] Concatenating ${videoFiles.length} scenes...`);
    const listPath = path.join(__dirname, 'temp_filelist.txt');
    const outputPath = path.join(finalDir, `manual_skeleton_final_${Date.now()}.mp4`);
    fs.writeFileSync(listPath, videoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

    try {
        execSync(`ffmpeg -f concat -safe 0 -i "${listPath}" -c:v libx264 -c:a aac -pix_fmt yuv420p -y "${outputPath}"`);
        console.log(`\n✅ SUCCESS! Final video saved to: ${outputPath}`);
    } catch (e) {
        console.error('FFmpeg assembly failed:', e.message);
    } finally {
        if (fs.existsSync(listPath)) fs.unlinkSync(listPath);
    }
}

main();
