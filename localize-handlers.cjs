const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { callPollinations, synthesizeUnifiedSpeech } = require('./skeleton-handlers.cjs');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const { request } = require('undici');

const LOCALIZE_DIR = path.join(__dirname, 'TikTokLocalizer');
if (!fs.existsSync(LOCALIZE_DIR)) fs.mkdirSync(LOCALIZE_DIR, { recursive: true });

const KEY_FRAME_COUNT = 6;
const MAX_SEGMENT_DURATION = 8.0;   // Veo 3 limit
const PAUSE_THRESHOLD = 0.8;        // seconds of silence to split utterances
const MIN_SEGMENT_DURATION = 1.0;   // minimum segment to avoid tiny clips

// ── System Prompt for Speaker Diarization ─────────────────────────────────────
const SPEAKER_DIARIZATION_PROMPT = `You are a professional video dialogue analyst. Your task is to identify speakers in a conversation video.

You will receive:
1. A full transcript with word-level timestamps
2. ${KEY_FRAME_COUNT} key frames extracted at equal intervals from the video

The video contains a DIALOGUE between 2 participants. The camera switches between them.

YOUR TASK:
1. Identify the 2 speakers visible in the frames. For each speaker provide:
   - "id": 1 or 2
   - "name": A short descriptive name based on appearance (e.g. "Man in blue jacket")
   - "description": Physical description for consistent visual reference

2. Split the transcript into speaker-labeled utterances. Each utterance is one person speaking continuously.
   Use this logic:
   - Look at the TIMESTAMPS of each word — correlate with which frames show which person at those times
   - When the camera shows Speaker 1, the words spoken at that time belong to Speaker 1
   - The conversation is a BACK-AND-FORTH — speakers alternate
   - Use the CONTEXT of what's being said to determine who's responding to whom
   - Pauses > ${PAUSE_THRESHOLD} seconds typically indicate speaker changes

3. Return a TIMELINE array where each entry represents one continuous utterance:
   - "speakerId": 1 or 2
   - "text": The exact transcribed words for this utterance
   - "start": Start time in seconds (use the first word's timestamp)
   - "end": End time in seconds (use the last word's timestamp)

OUTPUT: Return ONLY valid JSON:
{
  "speakers": [
    { "id": 1, "name": "...", "description": "..." },
    { "id": 2, "name": "...", "description": "..." }
  ],
  "timeline": [
    { "speakerId": 1, "text": "...", "start": 0.0, "end": 4.5 },
    { "speakerId": 2, "text": "...", "start": 4.8, "end": 10.2 }
  ]
}

CRITICAL: Cover ALL transcribed text. Every word must be assigned to a speaker.
If you cannot determine the speaker for some words, default to Speaker 1.`;

// ── System Prompt for Video Analysis (Characters in frames) ────────────────────
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video content analyst and character designer. Analyze the provided video frames and identify each visible person/character.

For each distinct character provide:
- "name": Short descriptive name
- "description": What they do in the video, their role
- "appearance": Detailed physical description — hair color/style, face shape, build, clothing, accessories
- "imagePrompt": A professional image generation prompt in English to recreate this character as a photorealistic portrait for a vertical 9:16 TikTok video. Include age, face details, hair, clothing, pose, lighting. Be specific about colors and textures. Format: "Photorealistic portrait of a [description], vertical 9:16 TikTok frame, professional lighting, sharp focus, 8k detail."
- "bestFrameIndex": Which frame (1-${KEY_FRAME_COUNT}) best shows this character

Also provide:
- "sceneDescription": 2-3 sentences describing what happens in the video

OUTPUT: Return ONLY valid JSON:
{
  "sceneDescription": "...",
  "characters": [
    { "name": "...", "description": "...", "appearance": "...", "imagePrompt": "...", "bestFrameIndex": 1 }
  ]
}`;

// ── System Prompt for Segment Translation (German) ─────────────────────────────
const TRANSLATION_DE_PROMPT = `You are a professional German localizer for TikTok dialogue content.
Translate the provided dialogue line into natural, colloquial German suitable for a TikTok audience.
RULES:
- Use casual, engaging German (du/Sie as appropriate for TikTok)
- Keep the translation concise — similar length to the original
- Preserve the emotional tone and intent of the original
- The speaker's personality should come through
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── System Prompt for Segment Translation (French) ─────────────────────────────
const TRANSLATION_FR_PROMPT = `You are a professional French localizer for TikTok dialogue content.
Translate the provided dialogue line into natural, colloquial French suitable for a TikTok audience.
RULES:
- Use casual, engaging French (tu/vous as appropriate for TikTok)
- Keep the translation concise — similar length to the original
- Preserve the emotional tone and intent of the original
- The speaker's personality should come through
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── TTS voice UUID (multilingual — supports DE, FR, EN) ────────────────────────
const MULTILINGUAL_VOICE_ID = process.env.UUID || 'eb21f806-58d1-46db-b346-24ea6540d0eb';

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeParseJson(text, fallbackLabel) {
    try {
        const clean = (text.match(/\{[\s\S]*\}/) || [text])[0];
        return JSON.parse(clean);
    } catch (e) {
        console.error(`[Localize] Failed to parse JSON for ${fallbackLabel}:`, e.message);
        throw new Error(`LLM response format error for ${fallbackLabel}. Please try again.`);
    }
}

function muxAudioIntoVideo(videoPath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-shortest', '-y', outputPath
        ]);
        ffmpeg.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`muxAudioIntoVideo failed with code ${code}`));
        });
    });
}

// ── STT: Transcribe audio using Pollinations scribe endpoint ───────────────────
async function transcribeAudio(audioPath) {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const audioBuffer = fs.readFileSync(audioPath);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
        audioBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nscribe\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
    ]);

    console.log('[Localize] Sending audio for transcription...');
    const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body
    });

    const data = JSON.parse(await resBody.text());
    if (statusCode !== 200) {
        throw new Error(`Transcription failed (${statusCode}): ${JSON.stringify(data)}`);
    }
    console.log(`[Localize] Transcription complete: ${data.words?.length || 0} words`);
    return {
        text: data.text || '',
        words: (data.words || []).map(w => ({
            start: w.start || 0,
            end: w.end || 0,
            word: w.word || ''
        }))
    };
}

// ── Pause-based utterance segmentation ─────────────────────────────────────────
function splitTranscriptIntoUtterances(words) {
    if (!words || words.length === 0) return [];

    const utterances = [];
    let currentWords = [words[0]];

    for (let i = 1; i < words.length; i++) {
        const gap = words[i].start - words[i - 1].end;
        if (gap > PAUSE_THRESHOLD) {
            // Natural pause — end current utterance
            const text = currentWords.map(w => w.word).join(' ');
            utterances.push({
                text,
                start: currentWords[0].start,
                end: currentWords[currentWords.length - 1].end
            });
            currentWords = [words[i]];
        } else {
            currentWords.push(words[i]);
        }
    }

    // Don't forget the last utterance
    if (currentWords.length > 0) {
        utterances.push({
            text: currentWords.map(w => w.word).join(' '),
            start: currentWords[0].start,
            end: currentWords[currentWords.length - 1].end
        });
    }

    console.log(`[Localize] Split transcript into ${utterances.length} utterances (pause threshold: ${PAUSE_THRESHOLD}s)`);
    return utterances;
}

// ── Build final ≤8s segments from speaker-labeled timeline ─────────────────────
function splitIntoSegments(speakerTimeline, speakers) {
    const segments = [];
    const speakerNames = {};
    for (const s of (speakers || [])) {
        speakerNames[s.id] = s.name || `Speaker ${s.id}`;
    }

    for (const entry of speakerTimeline) {
        const duration = entry.end - entry.start;
        const speakerId = entry.speakerId || 1;

        if (duration <= MAX_SEGMENT_DURATION && duration >= MIN_SEGMENT_DURATION) {
            // Perfect — fits in one segment
            segments.push({
                speakerId,
                speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                text: entry.text.trim(),
                startTime: entry.start,
                endTime: entry.end,
                duration: Math.round(duration * 100) / 100,
                translatedText: undefined,
                videoUrl: undefined,
                audioUrl: undefined
            });
        } else if (duration > MAX_SEGMENT_DURATION) {
            // Too long — split into sub-segments (split at sentence boundaries if possible)
            const text = entry.text.trim();
            const sentences = text.split(/(?<=[.!?])\s+/);
            let currentChunk = '';
            let chunkCharCount = 0;
            const totalChars = text.length;
            const charsPerSecond = totalChars / duration;

            for (const sentence of sentences) {
                const estimatedDuration = (currentChunk.length + sentence.length) / charsPerSecond;
                if (estimatedDuration > MAX_SEGMENT_DURATION && currentChunk.length > 0) {
                    const segStart = entry.start + (chunkCharCount / charsPerSecond);
                    const segEnd = entry.start + ((chunkCharCount + currentChunk.length) / charsPerSecond);
                    segments.push({
                        speakerId,
                        speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                        text: currentChunk.trim(),
                        startTime: Math.round(segStart * 100) / 100,
                        endTime: Math.round(Math.min(segEnd, entry.end) * 100) / 100,
                        duration: Math.round((currentChunk.length / charsPerSecond) * 100) / 100,
                        translatedText: undefined,
                        videoUrl: undefined,
                        audioUrl: undefined
                    });
                    chunkCharCount += currentChunk.length;
                    currentChunk = sentence;
                } else {
                    currentChunk += (currentChunk ? ' ' : '') + sentence;
                }
            }
            // Don't forget the last chunk
            if (currentChunk.trim().length > 0) {
                const segStart = entry.start + (chunkCharCount / charsPerSecond);
                segments.push({
                    speakerId,
                    speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                    text: currentChunk.trim(),
                    startTime: Math.round(segStart * 100) / 100,
                    endTime: entry.end,
                    duration: Math.round(((currentChunk.length / charsPerSecond)) * 100) / 100,
                    translatedText: undefined,
                    videoUrl: undefined,
                    audioUrl: undefined
                });
            }
        }
        // Skip segments shorter than MIN_SEGMENT_DURATION — they get merged with neighbors
    }

    // Merge very short segments with adjacent same-speaker segments
    const merged = [];
    for (const seg of segments) {
        if (seg.duration < MIN_SEGMENT_DURATION && merged.length > 0 && merged[merged.length - 1].speakerId === seg.speakerId) {
            const prev = merged[merged.length - 1];
            prev.text += ' ' + seg.text;
            prev.endTime = seg.endTime;
            prev.duration = Math.round((prev.endTime - prev.startTime) * 100) / 100;
        } else {
            merged.push(seg);
        }
    }

    console.log(`[Localize] Built ${merged.length} final segments (≤${MAX_SEGMENT_DURATION}s each)`);
    return merged;
}

// ── TTS wrapper: generate speech audio file ────────────────────────────────────
async function generateTTS(text, outputPath, languageLabel) {
    // synthesizeUnifiedSpeech(input, languageStr, voice, model, customDir)
    // Note: the function uses the 'language' parameter as the output file path
    // So we pass the full outputPath as the language parameter
    await synthesizeUnifiedSpeech(text, outputPath, MULTILINGUAL_VOICE_ID);
    console.log(`[Localize] TTS generated: ${outputPath}`);
    return outputPath;
}

// ── Main Handlers ──────────────────────────────────────────────────────────────

function registerLocalizeHandlers(ipcMain) {

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 1: Full dialogue analysis (video → diarization → segments)
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-analyze-dialogue', async (event, { videoBase64 }) => {
        const now = new Date();
        const folderName = `TikTokLocalize_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}_${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${now.getFullYear()}`;
        const projectDir = path.join(LOCALIZE_DIR, folderName);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        try {
            // Step 1: Save video
            console.log('[Localize] Saving video...');
            const videoPath = path.join(projectDir, 'source_video.mp4');
            const videoData = videoBase64.includes('base64,')
                ? videoBase64.split(';base64,').pop()
                : videoBase64;
            fs.writeFileSync(videoPath, videoData, 'base64');
            const videoUrl = `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;

            // Step 2: Extract audio
            console.log('[Localize] Extracting audio...');
            const audioPath = path.join(projectDir, 'audio.mp3');
            execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`, { stdio: 'pipe' });

            // Step 3: Transcribe
            let transcript = '';
            let transcriptWords = [];
            try {
                const sttResult = await transcribeAudio(audioPath);
                transcript = sttResult.text;
                transcriptWords = sttResult.words;
            } catch (sttErr) {
                console.error('[Localize] STT failed:', sttErr.message);
                transcript = '[Transcription unavailable]';
            }

            // Step 4: Extract key frames
            let duration = 10;
            try {
                duration = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`, { stdio: 'pipe' }).toString().trim());
            } catch (e) {
                console.warn('[Localize] Duration fallback:', e.message);
            }

            const frames = [];
            for (let i = 0; i < KEY_FRAME_COUNT; i++) {
                let targetTime = duration * (i / Math.max(1, KEY_FRAME_COUNT - 1));
                // If it's the very last frame, step back slightly to avoid ffmpeg EOF error
                if (i === KEY_FRAME_COUNT - 1) {
                    targetTime = Math.max(0, duration - 0.1);
                }
                const timestamp = targetTime.toFixed(2);
                const framePath = path.join(projectDir, `frame_${i + 1}.jpg`);
                execSync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -q:v 4 "${framePath}" -y`, { stdio: 'pipe' });
                frames.push({
                    index: i + 1,
                    timestamp: parseFloat(timestamp),
                    path: framePath,
                    url: `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`,
                    base64: `data:image/jpeg;base64,${fs.readFileSync(framePath, 'base64')}`
                });
            }
            console.log(`[Localize] Extracted ${KEY_FRAME_COUNT} frames from ${duration.toFixed(1)}s video`);

            // Step 5: Pause-based utterance segmentation
            const utterances = splitTranscriptIntoUtterances(transcriptWords);

            // Step 6: Speaker diarization via Gemini multimodal
            console.log('[Localize] Running speaker diarization via Gemini...');
            const diarizationContent = [
                {
                    type: 'text',
                    text: `Analyze this dialogue video. Full transcript with word timestamps:\n\n${JSON.stringify(transcriptWords.slice(0, 500))}\n\nThe transcript has been pre-segmented into ${utterances.length} utterances based on natural pauses:\n\n${utterances.map((u,i) => `U${i+1} [${u.start.toFixed(1)}-${u.end.toFixed(1)}s]: "${u.text}"`).join('\n')}\n\nIdentify the 2 speakers and assign each utterance to Speaker 1 or Speaker 2. The camera switches between them. Use the FRAMES below to see who appears at which moments. Return the complete JSON timeline.`
                }
            ];

            // Add frames with timestamps
            for (const frame of frames) {
                diarizationContent.push({
                    type: 'image_url',
                    image_url: { url: frame.base64, detail: 'high' }
                });
            }

            const diarizationMessages = [
                { role: 'system', content: SPEAKER_DIARIZATION_PROMPT },
                { role: 'user', content: diarizationContent }
            ];

            const diarizationRaw = await callPollinations(diarizationMessages, true);
            const diarization = safeParseJson(diarizationRaw, 'speaker diarization');
            const speakers = diarization.speakers || [];
            const timeline = diarization.timeline || [];
            console.log(`[Localize] Diarization: ${speakers.length} speakers, ${timeline.length} timeline entries`);

            // Step 7: Build ≤8s segments
            const segments = splitIntoSegments(timeline, speakers);
            fs.writeFileSync(path.join(projectDir, 'speaker_timeline.json'), JSON.stringify({ speakers, timeline }, null, 2));
            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));

            // Step 8: Character visual analysis (for reference images)
            console.log('[Localize] Analyzing character appearances...');
            const analysisContent = [
                {
                    type: 'text',
                    text: `Identify all visible characters in these ${KEY_FRAME_COUNT} frames from a dialogue video. Describe their appearance in detail and generate image prompts to recreate them. Return ONLY valid JSON as specified.`
                }
            ];
            for (const frame of frames) {
                analysisContent.push({ type: 'image_url', image_url: { url: frame.base64, detail: 'high' } });
            }

            const analysisMessages = [
                { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
                { role: 'user', content: analysisContent }
            ];

            const analysisRaw = await callPollinations(analysisMessages, true);
            const analysis = safeParseJson(analysisRaw, 'character analysis');

            // Map characters — correlate with speakers if possible
            const characters = (analysis.characters || []).map((char, i) => ({
                name: char.name || (speakers[i] ? speakers[i].name : `Character ${i + 1}`),
                description: char.description || '',
                appearance: char.appearance || '',
                imagePrompt: char.imagePrompt || '',
                bestFrameIndex: typeof char.bestFrameIndex === 'number' ? char.bestFrameIndex : (i + 1)
            }));
            const sceneDescription = analysis.sceneDescription || '';

            // If we have fewer characters than speakers, fill from speakers
            if (characters.length < speakers.length) {
                for (let i = characters.length; i < speakers.length; i++) {
                    if (speakers[i]) {
                        characters.push({
                            name: speakers[i].name,
                            description: speakers[i].description || '',
                            appearance: '',
                            imagePrompt: `Photorealistic portrait of ${speakers[i].description || speakers[i].name}, vertical 9:16 TikTok frame, professional lighting, sharp focus, 8k detail.`,
                            bestFrameIndex: 1
                        });
                    }
                }
            }

            // Step 9: Generate character reference images
            console.log(`[Localize] Generating reference images for ${characters.length} characters...`);
            for (let i = 0; i < characters.length; i++) {
                try {
                    const savedPaths = await generateImageViaGLabs({
                        prompt: characters[i].imagePrompt + ' Single full-frame vertical 9:16 TikTok image, one person only, photorealistic portrait, 8k detail, professional lighting, clean background.',
                        model: 'nano_banana_2',
                        aspectRatio: '9:16',
                        count: 1,
                        sectionDir: LOCALIZE_DIR,
                        subFolder: folderName,
                        sceneIndex: i
                    });
                    if (savedPaths && savedPaths.length > 0) {
                        const imgBuffer = fs.readFileSync(savedPaths[0]);
                        const imgExt = path.extname(savedPaths[0]).toLowerCase();
                        const imgMime = imgExt === '.png' ? 'image/png' : 'image/jpeg';
                        characters[i].generatedImageUrl = `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
                    }
                } catch (imgErr) {
                    console.error(`[Localize] Image generation failed for "${characters[i].name}":`, imgErr.message);
                }
                const bestIdx = Math.max(1, Math.min(KEY_FRAME_COUNT, characters[i].bestFrameIndex || 1)) - 1;
                characters[i].bestFrameUrl = frames[bestIdx]?.url;
            }

            // Step 10: Save all text files
            const saveTextFile = (name, content) => fs.writeFileSync(path.join(projectDir, name), content, 'utf8');
            saveTextFile('transcript_original.txt', transcript);
            saveTextFile('scene_description.txt', sceneDescription);
            saveTextFile('characters.json', JSON.stringify(characters.map(c => ({
                name: c.name, description: c.description, appearance: c.appearance, imagePrompt: c.imagePrompt
            })), null, 2));

            console.log(`[Localize] Analysis complete: ${speakers.length} speakers, ${segments.length} segments, ${characters.length} characters`);

            return {
                projectFolder: folderName,
                transcript,
                transcriptWords,
                sceneDescription,
                speakers,
                segments,
                characters,
                frames: frames.map(f => f.url),
                videoUrl
            };

        } catch (err) {
            console.error('[Localize] Analysis failed:', err.message);
            throw err;
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 2: Translate all segments to target language
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-translate-segments', async (event, { projectFolder, segments, targetLanguage }) => {
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const langLabel = isGerman ? 'German' : 'French';
        const langFile = isGerman ? 'segments_german.json' : 'segments_french.json';
        const systemPrompt = isGerman ? TRANSLATION_DE_PROMPT : TRANSLATION_FR_PROMPT;

        console.log(`[Localize] Translating ${segments.length} segments to ${langLabel}...`);
        const translated = [];

        // Translate in batches of 3 to reduce API calls
        for (let i = 0; i < segments.length; i += 3) {
            const batch = segments.slice(i, i + 3);
            const batchResults = await Promise.all(
                batch.map(async (seg, bi) => {
                    try {
                        const msg = [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: `Translate this dialogue line to ${langLabel}:\n\n${seg.text}` }
                        ];
                        const raw = await callPollinations(msg, false);
                        const translatedText = raw.trim().replace(/^["']|["']$/g, '');
                        return {
                            ...seg,
                            index: i + bi,
                            translatedText
                        };
                    } catch (e) {
                        console.error(`[Localize] Translation failed for segment ${i + bi}:`, e.message);
                        return { ...seg, index: i + bi, translatedText: seg.text };
                    }
                })
            );
            translated.push(...batchResults);
        }

        // Sort by original order and save
        translated.sort((a, b) => a.index - b.index);
        fs.writeFileSync(path.join(projectDir, langFile), JSON.stringify(translated, null, 2));

        console.log(`[Localize] Translated ${translated.length} segments to ${langLabel}`);
        return translated;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 3: Generate one dialogue video clip (segment + translated text + TTS + mux)
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-generate-segment-video', async (event, { projectFolder, segmentIndex, segments, targetLanguage, characterImages }) => {
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        if (!fs.existsSync(projectDir)) throw new Error(`Project folder not found: ${projectFolder}`);

        const seg = segments[segmentIndex];
        if (!seg) throw new Error(`Segment ${segmentIndex} not found`);

        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const langCode = isGerman ? 'de' : 'fr';
        const langLabel = isGerman ? 'German' : 'French';

        const translatedText = seg.translatedText || seg.text;
        console.log(`[Localize] Generating ${langLabel} video for segment ${segmentIndex}: "${translatedText.substring(0, 60)}..."`);

        // Find character reference image for this speaker
        const charImg = (characterImages || []).find(ci => ci.speakerId === seg.speakerId);
        let referenceImageBase64 = null;
        if (charImg && charImg.imageBase64) {
            referenceImageBase64 = charImg.imageBase64;
        }

        // Step 1: Generate video with Omni Flash (which now handles TTS and lip-sync)
        const speakerName = seg.speakerName || 'Speaker';
        const videoPrompt = `A photorealistic ${speakerName} speaking directly to camera. DIALOGUE: "${translatedText}". The person looks directly at the viewer, natural mouth movements, slight head movements, expressive but controlled. The video should look like a TikTok talking-head clip. Background: softly blurred, cinematic lighting. LIP-SYNC: Accurate mouth movement matching the dialogue. AUDIO TRACK: Professional voice speaking exactly: "${translatedText}". Duration: ${Math.min(seg.duration || 5, 8)} seconds. Ultra realistic, 8K, professional lighting, vertical 9:16 TikTok format. No text, no watermark.`;

        let videoPath;
        try {
            const refImages = referenceImageBase64
                ? [{ data: referenceImageBase64 }]
                : [];

            videoPath = await generateVideoViaGLabs({
                prompt: videoPrompt,
                model: 'omni_flash',
                mode: refImages.length > 0 ? 'start_image' : 'text_to_video',
                aspectRatio: '9:16',
                resolution: '720p',
                sectionDir: LOCALIZE_DIR,
                subFolder: projectFolder,
                sceneIndex: `seg_${segmentIndex}_${langCode}`,
                referenceImages: refImages,
                generateAudio: true
            });

            // Note: Muxing is no longer required because Omni Flash generates the audio natively
        } catch (vidErr) {
            console.error(`[Localize] Video generation failed for segment ${segmentIndex}:`, vidErr.message);
            throw vidErr;
        }

        const result = {
            segmentIndex,
            videoUrl: `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`,
            audioUrl: null // Audio is embedded in the video via Omni Flash
        };

        console.log(`[Localize] Segment ${segmentIndex} complete: ${result.videoUrl}`);
        return result;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 4: Batch generate all segment videos for one language
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-batch-generate-segments', async (event, { projectFolder, segments, targetLanguage, characterImages }) => {
        const results = [];
        const langLabel = (targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de') ? 'German' : 'French';

        console.log(`[Localize] Batch generating ${segments.length} ${langLabel} videos...`);

        for (let i = 0; i < segments.length; i++) {
            try {
                const result = await ipcMain.emit('localize-generate-segment-video', event, {
                    projectFolder, segmentIndex: i, segments, targetLanguage, characterImages
                });
                results.push({ segmentIndex: i, ...result, status: 'completed' });
            } catch (err) {
                console.error(`[Localize] Batch: segment ${i} failed:`, err.message);
                results.push({ segmentIndex: i, videoUrl: null, audioUrl: null, status: 'failed', error: err.message });
            }
        }

        // Save results manifest
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        const langCode = (targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de') ? 'de' : 'fr';
        fs.writeFileSync(path.join(projectDir, `batch_results_${langCode}.json`), JSON.stringify(results, null, 2));

        return results;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 5: Regenerate character image
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-regenerate-character-image', async (event, { projectFolder, characterIndex, customPrompt }) => {
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        if (!fs.existsSync(projectDir)) throw new Error(`Project folder not found: ${projectFolder}`);

        const charsPath = path.join(projectDir, 'characters.json');
        let characters = [];
        if (fs.existsSync(charsPath)) {
            characters = JSON.parse(fs.readFileSync(charsPath, 'utf8'));
        }
        const char = characters[characterIndex];
        if (!char) throw new Error(`Character at index ${characterIndex} not found`);

        const prompt = (customPrompt || char.imagePrompt) + ' Single full-frame vertical 9:16 TikTok image, photorealistic portrait, 8k detail, professional lighting.';
        const savedPaths = await generateImageViaGLabs({
            prompt,
            model: 'nano_banana_2',
            aspectRatio: '9:16',
            count: 1,
            sectionDir: LOCALIZE_DIR,
            subFolder: projectFolder,
            sceneIndex: `char_${characterIndex}_${Date.now()}`
        });

        if (!savedPaths || savedPaths.length === 0) throw new Error('Image generation returned no results');
        const imgBuffer = fs.readFileSync(savedPaths[0]);
        const imgExt = path.extname(savedPaths[0]).toLowerCase();
        const imgMime = imgExt === '.png' ? 'image/png' : 'image/jpeg';
        return `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 6: Re-translate to a language
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-retranslate', async (event, { projectFolder, transcript, targetLanguage }) => {
        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const systemPrompt = isGerman ? TRANSLATION_DE_PROMPT : TRANSLATION_FR_PROMPT;
        const langLabel = isGerman ? 'German' : 'French';

        const msg = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate this dialogue line to ${langLabel}:\n\n${transcript}` }
        ];
        const raw = await callPollinations(msg, false);
        return { translatedText: raw.trim().replace(/^["']|["']$/g, '') };
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 7: Extract frames at specific timestamps
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-extract-frames', async (event, { videoBase64, timestamps, projectFolder }) => {
        const projectDir = projectFolder
            ? path.join(LOCALIZE_DIR, projectFolder)
            : path.join(LOCALIZE_DIR, `frames_${Date.now()}`);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        const tempVideoPath = path.join(projectDir, 'temp_extract.mp4');
        const videoData = videoBase64.includes('base64,')
            ? videoBase64.split(';base64,').pop()
            : videoBase64;
        fs.writeFileSync(tempVideoPath, videoData, 'base64');

        const frameUrls = [];
        for (const ts of timestamps) {
            const t = parseFloat(ts);
            if (isNaN(t)) { frameUrls.push(null); continue; }
            const framePath = path.join(projectDir, `frame_at_${t.toFixed(2)}s.jpg`);
            try {
                execSync(`ffmpeg -ss ${t.toFixed(2)} -i "${tempVideoPath}" -frames:v 1 -q:v 4 "${framePath}" -y`, { stdio: 'pipe' });
                frameUrls.push(`media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`);
            } catch (e) {
                frameUrls.push(null);
            }
        }
        try { fs.unlinkSync(tempVideoPath); } catch (e) { /* ignore */ }
        return frameUrls;
    });

}

module.exports = { registerLocalizeHandlers, transcribeAudio };
