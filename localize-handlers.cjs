const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const { request } = require('undici');
const { spawn, execSync } = require('child_process');

const ai = require('./ai-client.cjs');

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
- "imagePrompt": A professional image generation prompt in English to recreate this character as a photorealistic portrait for a vertical 9:16 TikTok video. Include age, face details, hair, clothing, pose, lighting. Be specific about colors and textures. NO text, NO subtitles. Format: "Photorealistic portrait of a [description], vertical 9:16 TikTok frame, professional lighting, clean background, NO text, NO subtitles."
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

// ── System Prompt for Segment Translation (English) ────────────────────────────
const TRANSLATION_EN_PROMPT = `You are a professional English localizer for TikTok dialogue content.
Translate the provided dialogue line into natural, colloquial English suitable for a TikTok audience.
RULES:
- Use casual, engaging English
- Keep the translation concise — similar length to the original
- Preserve the emotional tone and intent of the original
- The speaker's personality should come through
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── System Prompt for Voice Characteristics Analysis ───────────────────────────
const VOICE_ANALYSIS_PROMPT = `You are a professional voice and audio analyst. Analyze the provided audio sample of a speaker and determine their vocal characteristics.

You will receive:
1. A description of the speaker (visual appearance from video)
2. An audio fragment of the speaker

Analyze the voice and return the following characteristics:
- "gender": "male" or "female" (based on pitch and vocal quality)
- "ageRange": "child", "young" (18-30), "middle-aged" (30-55), or "elderly" (55+)
- "timbre": "deep" (bass/baritone), "medium" (tenor/mezzo), or "high" (alto/soprano)
- "style": "energetic", "calm", "aggressive", "playful", "dramatic", or "neutral"
- "speed": a float from 0.7 (very slow) to 1.5 (very fast), with 1.0 being normal
- "pitch": "low", "medium", or "high"
- "emotionalTone": primary emotion detected (e.g. "sarcastic", "humorous", "serious", "excited")
- "voiceSearchKeywords": array of 3-5 English keywords to search for a matching TTS voice (e.g. ["young", "male", "energetic", "deep"])

OUTPUT: Return ONLY valid JSON:
{
  "gender": "male",
  "ageRange": "young",
  "timbre": "medium",
  "style": "energetic",
  "speed": 1.1,
  "pitch": "medium",
  "emotionalTone": "playful",
  "voiceSearchKeywords": ["young", "male", "energetic", "casual"]
}`;

// ── System Prompt for Scene-Based Video Prompt Generation ──────────────────────
const SCENE_VIDEO_PROMPT_GENERATOR = `You are a professional video prompt engineer specializing in creating detailed prompts for AI video generation (Veo 3 / Omni Flash).

You will receive:
1. A START FRAME image from the original video scene
2. The TRANSLATED DIALOGUE text that the character should speak
3. A DESCRIPTION of the character (appearance, role)
4. The SCENE DESCRIPTION from the original video

Your task: Generate a highly detailed video generation prompt that recreates the scene from the original frame but with the new translated dialogue.

The prompt MUST include:
1. ENVIRONMENT: Describe the exact background, setting, colors, textures visible in the start frame
2. CHARACTER: How the character looks, their pose, clothing, expression
3. ACTION: What the character is doing (speaking, gesturing, reacting)
4. EMOTION: The emotional state matching the dialogue tone
5. CAMERA: MUST INCLUDE subtle, cinematic camera movement (e.g., "very slow zoom in", "subtle tracking shot", "slight pan left", "gentle zoom out") along with the angle (close-up, medium shot). Keep motion minimal.
6. LIGHTING: Lighting conditions matching the original frame
7. DIALOGUE: The exact translated text as spoken audio
8. STYLE: "Photorealistic" or "3D animated" based on the original frame style
9. NEGATIVE: Add "NO text, NO subtitles, NO captions, NO typography, clean frame" to ensure the generated video has no text overlays.

OUTPUT: Return ONLY valid JSON:
{
  "videoPrompt": "Detailed prompt for video generation in English, 2-4 sentences",
  "cameraAngle": "close-up / medium-shot / wide-shot",
  "emotion": "primary emotion",
  "action": "what the character does",
  "environmentDescription": "brief environment from the frame",
  "isAnimated": true/false,
  "duration": estimated_duration_in_seconds
}

CRITICAL RULES:
- DO NOT add elements not visible in the original frame
- Match the visual style (photorealistic vs 3D animated)
- The prompt should produce a vertical 9:16 TikTok video
- Include the dialogue text for lip-sync audio generation
- Keep the prompt under 500 characters for optimal generation`;

// ── TTS voice UUID (multilingual — supports DE, FR, EN) ────────────────────────
const MULTILINGUAL_VOICE_ID = process.env.UUID || 'eb21f806-58d1-46db-b346-24ea6540d0eb';

// ── Voice presets for fallback when library search fails ────────────────────────
const VOICE_PRESETS = {
  male_young:    { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam',    public_owner_id: null },
  male_mature:   { voice_id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold',  public_owner_id: null },
  female_young:  { voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',   public_owner_id: null },
  female_mature: { voice_id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  public_owner_id: null },
};

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

// ── STT logic moved to ai-client.cjs ──────────────────────────────────────────



// ── Pause-based utterance segmentation ─────────────────────────────────────────
function splitTranscriptIntoUtterances(words) {
    if (!words || words.length === 0) return [];

    const utterances = [];
    let currentWords = [words[0]];

    for (let i = 1; i < words.length; i++) {
        const gap = words[i].start - words[i - 1].end;
        const prevWord = words[i - 1].word.trim();
        const hasPunctuation = /[.!?]$/.test(prevWord);
        
        if (gap > PAUSE_THRESHOLD || hasPunctuation) {
            // Natural pause or sentence boundary — end current utterance
            const text = currentWords.map(w => w.word).join(' ').trim();
            if (text) {
                utterances.push({
                    text,
                    start: currentWords[0].start,
                    end: currentWords[currentWords.length - 1].end
                });
            }
            currentWords = [words[i]];
        } else {
            currentWords.push(words[i]);
        }
    }

    // Don't forget the last utterance
    if (currentWords.length > 0) {
        const text = currentWords.map(w => w.word).join(' ').trim();
        if (text) {
            utterances.push({
                text,
                start: currentWords[0].start,
                end: currentWords[currentWords.length - 1].end
            });
        }
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

    // Merge adjacent segments from the same speaker up to MAX_SEGMENT_DURATION
    const merged = [];
    for (const seg of segments) {
        if (merged.length > 0 && merged[merged.length - 1].speakerId === seg.speakerId) {
            const prev = merged[merged.length - 1];
            const newDuration = Math.round((seg.endTime - prev.startTime) * 100) / 100;
            if (newDuration <= MAX_SEGMENT_DURATION) {
                prev.text += ' ' + seg.text;
                prev.endTime = seg.endTime;
                prev.duration = newDuration;
                continue;
            }
        }
        merged.push(seg);
    }

    console.log(`[Localize] Built ${merged.length} final segments (≤${MAX_SEGMENT_DURATION}s each)`);
    return merged;
}

// ── TTS wrapper: generate speech audio file ────────────────────────────────────
async function generateTTS(text, outputPath, languageLabel, voiceId = null) {
    // synthesizeUnifiedSpeech(input, languageStr, voice, model, customDir)
    // Note: the function uses the 'language' parameter as the output file path
    // So we pass the full outputPath as the language parameter
    const activeVoice = voiceId || MULTILINGUAL_VOICE_ID;
    await ai.synthesizeVoice(text, outputPath, activeVoice);
    console.log(`[Localize] TTS generated: ${outputPath} (voice: ${activeVoice})`);
    return outputPath;
}

// ── Extract scene start frame for each segment ─────────────────────────────────
function extractSegmentSceneFrames(videoPath, segments, projectDir) {
    const sceneFrames = [];
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        // Extract frame from the middle of the segment to avoid fade-in/out transitions
        const timestamp = Math.max(0, (seg.startTime || 0) + ((seg.duration || 0) / 2));
        const framePath = path.join(projectDir, `scene_frame_${i + 1}.jpg`);
        try {
            // Extract frame as-is (we now use Image-to-Image to remove subtitles instead of cropping)
            execSync(`ffmpeg -ss ${timestamp.toFixed(2)} -i "${videoPath}" -frames:v 1 -q:v 3 "${framePath}" -y`, { stdio: 'pipe' });
            const base64 = fs.readFileSync(framePath, 'base64');
            sceneFrames.push({
                index: i,
                timestamp,
                path: framePath,
                url: `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`,
                base64: `data:image/jpeg;base64,${base64}`
            });
            console.log(`[Localize] Scene frame ${i + 1}/${segments.length} extracted at ${timestamp.toFixed(2)}s`);
        } catch (e) {
            console.warn(`[Localize] Failed to extract scene frame at ${timestamp.toFixed(2)}s:`, e.message);
            sceneFrames.push({ index: i, timestamp, path: null, url: null, base64: null });
        }
    }
    console.log(`[Localize] Extracted ${sceneFrames.filter(f => f.path).length}/${segments.length} scene frames`);
    return sceneFrames;
}

// ── Analyze voice characteristics for each speaker ─────────────────────────────
async function analyzeVoiceCharacteristics(audioPath, segments, speakers, projectDir) {
    const voiceProfiles = {};

    for (const speaker of speakers) {
        // Find segments for this speaker to extract audio sample
        const speakerSegs = segments.filter(s => s.speakerId === speaker.id);
        if (speakerSegs.length === 0) {
            console.warn(`[Localize] No segments found for speaker ${speaker.id}`);
            voiceProfiles[speaker.id] = null;
            continue;
        }

        // Extract longest segment audio as representative sample
        const bestSeg = speakerSegs.reduce((a, b) => (a.duration > b.duration ? a : b));
        const samplePath = path.join(projectDir, `speaker_${speaker.id}_sample.mp3`);

        try {
            execSync(`ffmpeg -i "${audioPath}" -ss ${bestSeg.startTime.toFixed(2)} -to ${bestSeg.endTime.toFixed(2)} -acodec libmp3lame -q:a 4 -y "${samplePath}"`, { stdio: 'pipe' });
        } catch (e) {
            console.warn(`[Localize] Failed to extract speaker ${speaker.id} audio sample:`, e.message);
            voiceProfiles[speaker.id] = null;
            continue;
        }

        // Analyze voice via Gemini using speaker description + visual info
        try {
            const voiceMsg = [
                { role: 'system', content: VOICE_ANALYSIS_PROMPT },
                { role: 'user', content: `Analyze the voice characteristics of this speaker.\n\nSpeaker Visual Description: ${speaker.description || speaker.name}\nSpeaker Name: ${speaker.name}\nSample text spoken: "${bestSeg.text}"\nSample duration: ${bestSeg.duration.toFixed(1)}s\n\nBased on the visual description (${speaker.description}), determine the most likely voice characteristics. Consider their apparent age, gender, and speaking style from the dialogue context.` }
            ];

            const voiceRaw = await ai.chat(voiceMsg, true);
            const voiceData = safeParseJson(voiceRaw, `voice analysis speaker ${speaker.id}`);

            voiceProfiles[speaker.id] = {
                gender: voiceData.gender || 'male',
                ageRange: voiceData.ageRange || 'young',
                timbre: voiceData.timbre || 'medium',
                style: voiceData.style || 'neutral',
                speed: voiceData.speed || 1.0,
                pitch: voiceData.pitch || 'medium',
                emotionalTone: voiceData.emotionalTone || 'neutral',
                voiceSearchKeywords: voiceData.voiceSearchKeywords || [],
                samplePath
            };

            console.log(`[Localize] Voice profile for "${speaker.name}": ${voiceData.gender}, ${voiceData.ageRange}, ${voiceData.timbre}, ${voiceData.style}`);
        } catch (e) {
            console.warn(`[Localize] Voice analysis failed for speaker ${speaker.id}:`, e.message);
            voiceProfiles[speaker.id] = null;
        }
    }

    return voiceProfiles;
}

// ── Find matching voice from presets based on voice profile ─────────────────────
function findMatchingVoice(voiceProfile) {
    if (!voiceProfile) return { voice_id: MULTILINGUAL_VOICE_ID, name: 'Default', public_owner_id: null };

    const gender = voiceProfile.gender || 'male';
    const age = voiceProfile.ageRange || 'young';
    const isYoung = age === 'child' || age === 'young';

    const presetKey = `${gender}_${isYoung ? 'young' : 'mature'}`;
    const preset = VOICE_PRESETS[presetKey] || VOICE_PRESETS.male_young;

    console.log(`[Localize] Matched voice preset: ${presetKey} → ${preset.name} (${preset.voice_id})`);
    return preset;
}

// ── Generate video prompt based on scene frame + translated text ────────────────
async function generateVideoPromptForSegment(segment, sceneFrameBase64, character, sceneDescription, translatedText) {
    if (!sceneFrameBase64) {
        // Fallback: generate a basic prompt without the frame
        const speakerName = segment.speakerName || 'Speaker';
        return {
            videoPrompt: `A photorealistic ${speakerName} speaking directly to camera. DIALOGUE: "${translatedText}". Natural mouth movements, slight head movements, expressive. Vertical 9:16 TikTok frame, professional lighting, 8k detail. Very subtle camera movement (e.g. slow zoom in, slight pan).`,
            cameraAngle: 'close-up',
            emotion: 'neutral',
            action: 'speaking to camera',
            environmentDescription: 'blurred background, cinematic lighting',
            isAnimated: false,
            duration: segment.duration || 5
        };
    }

    try {
        const promptContent = [
            {
                type: 'text',
                text: `Generate a detailed video generation prompt based on this scene frame.\n\nTRANSLATED DIALOGUE: "${translatedText}"\nCHARACTER: ${character?.appearance || character?.name || segment.speakerName || 'Speaker'}\nSCENE DESCRIPTION: ${sceneDescription || 'A dialogue scene'}\nSEGMENT DURATION: ${segment.duration || 5} seconds\n\nAnalyze the start frame below and create a prompt that recreates this exact visual scene with the new dialogue.\n\nIMPORTANT: You MUST include very subtle camera movements in the prompt (e.g., "very slow zoom in", "subtle tracking shot", "slight pan left", "gentle zoom out"). Make the motion cinematic but minimal.`
            },
            {
                type: 'image_url',
                image_url: { url: sceneFrameBase64, detail: 'high' }
            }
        ];

        const promptMessages = [
            { role: 'system', content: SCENE_VIDEO_PROMPT_GENERATOR },
            { role: 'user', content: promptContent }
        ];

        const promptRaw = await ai.chat(promptMessages, true);
        const promptData = safeParseJson(promptRaw, 'video prompt generation');

        console.log(`[Localize] Generated video prompt: "${(promptData.videoPrompt || '').substring(0, 80)}..."`);
        return {
            videoPrompt: promptData.videoPrompt || '',
            cameraAngle: promptData.cameraAngle || 'close-up',
            emotion: promptData.emotion || 'neutral',
            action: promptData.action || 'speaking',
            environmentDescription: promptData.environmentDescription || '',
            isAnimated: promptData.isAnimated || false,
            duration: promptData.duration || segment.duration || 5
        };
    } catch (e) {
        console.error(`[Localize] Video prompt generation failed:`, e.message);
        // Fallback
        return {
            videoPrompt: `A ${segment.speakerName || 'character'} speaking directly to camera in a scene. DIALOGUE: "${translatedText}". Vertical 9:16 TikTok frame, professional lighting. NO text, NO subtitles, NO typography.`,
            cameraAngle: 'close-up',
            emotion: 'neutral',
            action: 'speaking to camera',
            environmentDescription: sceneDescription || '',
            isAnimated: false,
            duration: segment.duration || 5
        };
    }
}

// ── Main Handlers ──────────────────────────────────────────────────────────────

function registerLocalizeHandlers(ipcMain) {

        // ═══════════════════════════════════════════════════════════════════════════
    // Handler 1: Step 1 - Extract Audio & Transcribe
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-step1-stt', async (event, { videoBase64 }) => {
        const now = new Date();
        const folderName = `TikTokLocalize_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}_${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${now.getFullYear()}`;
        const projectDir = path.join(LOCALIZE_DIR, folderName);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        try {
            console.log('[Localize] Step 1: Saving video...');
            const videoPath = path.join(projectDir, 'source_video.mp4');
            const videoData = videoBase64.includes('base64,') ? videoBase64.split(';base64,').pop() : videoBase64;
            fs.writeFileSync(videoPath, videoData, 'base64');
            const videoUrl = `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`;

            console.log('[Localize] Step 1: Extracting audio...');
            const audioPath = path.join(projectDir, 'audio.mp3');
            execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`, { stdio: 'pipe' });

            console.log('[Localize] Step 1: Transcribing audio...');
            const sttResult = await ai.transcribe(audioPath);
            const transcript = sttResult.text;
            const transcriptWords = sttResult.words;
            if (!transcript || transcriptWords.length === 0) {
                throw new Error('Audio transcription returned an empty result. Please check the video audio track.');
            }

            console.log('[Localize] Step 1: Segmenting utterances...');
            const utterances = splitTranscriptIntoUtterances(transcriptWords);

            console.log(`[Localize] Step 1: Extracting ${utterances.length} frames at utterance timestamps...`);
            const frames = [];
            for (let i = 0; i < utterances.length; i++) {
                const u = utterances[i];
                // Median timestamp to avoid transitions
                const timestamp = Math.max(0, u.start + ((u.end - u.start) / 2)).toFixed(2);
                const framePath = path.join(projectDir, `utterance_frame_${i + 1}.jpg`);
                // Scale to save memory
                execSync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -frames:v 1 -vf "scale=512:-1" -q:v 6 "${framePath}" -y`, { stdio: 'pipe' });
                frames.push({
                    index: i + 1,
                    timestamp: parseFloat(timestamp),
                    path: framePath,
                    url: `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`,
                    base64: `data:image/jpeg;base64,${fs.readFileSync(framePath, 'base64')}`
                });
            }

            fs.writeFileSync(path.join(projectDir, 'transcript_original.txt'), transcript, 'utf8');
            fs.writeFileSync(path.join(projectDir, 'step1.json'), JSON.stringify({ transcriptWords, utterances, frames }, null, 2));

            return { projectFolder: folderName, transcript, transcriptWords, utterances, frames, videoUrl };
        } catch (err) {
            console.error('[Localize] Step 1 failed:', err.message);
            throw err;
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 2: Step 2 - Speaker Diarization
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-step2-diarize', async (event, { projectFolder, transcriptWords, utterances, frames }) => {
        try {
            const projectDir = path.join(LOCALIZE_DIR, projectFolder);
            console.log('[Localize] Step 2: Running speaker diarization via Gemini...');
            
            const diarizationContent = [
                {
                    type: 'text',
                    text: `Analyze this dialogue video. Full transcript with word timestamps:\n\n${JSON.stringify(transcriptWords.slice(0, 500))}\n\nThe transcript has been pre-segmented into ${utterances.length} utterances based on natural pauses:\n\n${utterances.map((u,i) => `U${i+1} [${u.start.toFixed(1)}-${u.end.toFixed(1)}s]: "${u.text}"`).join('\n')}\n\nIdentify the 2 speakers and assign each utterance to Speaker 1 or Speaker 2. The camera switches between them. Use the FRAMES below (which correspond to the start of each utterance) to see who appears at which moments. Return the complete JSON timeline.`
                }
            ];

            for (const frame of frames) {
                diarizationContent.push({
                    type: 'image_url',
                    image_url: { url: frame.base64, detail: 'low' }
                });
            }

            const diarizationMessages = [
                { role: 'system', content: SPEAKER_DIARIZATION_PROMPT },
                { role: 'user', content: diarizationContent }
            ];

            const diarizationRaw = await ai.chat(diarizationMessages, true);
            const diarization = safeParseJson(diarizationRaw, 'speaker diarization');
            const speakers = diarization.speakers || [];
            const timeline = diarization.timeline || [];
            console.log(`[Localize] Step 2: Diarization found ${speakers.length} speakers, ${timeline.length} timeline entries`);

            console.log('[Localize] Step 2: Building ≤8s segments...');
            const segments = splitIntoSegments(timeline, speakers);
            fs.writeFileSync(path.join(projectDir, 'speaker_timeline.json'), JSON.stringify({ speakers, timeline }, null, 2));
            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));

            console.log('[Localize] Step 2: Extracting scene start frames for segments...');
            const videoPath = path.join(projectDir, 'source_video.mp4');
            const sceneFrames = extractSegmentSceneFrames(videoPath, segments, projectDir);
            for (let i = 0; i < segments.length; i++) {
                segments[i].sceneFrameUrl = sceneFrames[i]?.url || null;
                segments[i].sceneFrameBase64 = sceneFrames[i]?.base64 || null;
            }
            fs.writeFileSync(path.join(projectDir, 'scene_frames.json'), JSON.stringify(sceneFrames.map(f => ({
                index: f.index, timestamp: f.timestamp, path: f.path, url: f.url
            })), null, 2));

            return { speakers, timeline, segments, sceneFrames };
        } catch (err) {
            console.error('[Localize] Step 2 failed:', err.message);
            throw err;
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 3: Step 3 - Character Analysis
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-step3-characters', async (event, { projectFolder, frames, sceneFrames, segments, speakers }) => {
        try {
            const projectDir = path.join(LOCALIZE_DIR, projectFolder);
            console.log('[Localize] Step 3: Analyzing character appearances...');
            const analysisContent = [
                {
                    type: 'text',
                    text: `Identify all visible characters in these frames from a dialogue video. Describe their appearance in detail and generate image prompts to recreate them. Return ONLY valid JSON as specified.`
                }
            ];
            // Only send up to 6 frames to save token cost on character analysis
            const sampledFrames = frames.length > 6 ? frames.filter((_, i) => i % Math.ceil(frames.length / 6) === 0).slice(0, 6) : frames;
            for (const frame of sampledFrames) {
                analysisContent.push({ type: 'image_url', image_url: { url: frame.base64, detail: 'low' } });
            }

            const analysisMessages = [
                { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
                { role: 'user', content: analysisContent }
            ];

            const analysisRaw = await ai.chat(analysisMessages, true);
            const analysis = safeParseJson(analysisRaw, 'character analysis');

            const characters = (analysis.characters || []).map((char, i) => ({
                name: char.name || (speakers[i] ? speakers[i].name : `Character ${i + 1}`),
                description: char.description || '',
                appearance: char.appearance || '',
                imagePrompt: char.imagePrompt || '',
                bestFrameIndex: typeof char.bestFrameIndex === 'number' ? char.bestFrameIndex : (i + 1)
            }));
            const sceneDescription = analysis.sceneDescription || '';

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

            console.log(`[Localize] Step 3: Cleaning subtitles from ${(sceneFrames || []).length} scene frames via i2i...`);
            for (let i = 0; i < (sceneFrames || []).length; i++) {
                if (!sceneFrames[i] || !sceneFrames[i].base64) continue;
                try {
                    const savedPaths = await ai.generateImage({
                        prompt: 'Photorealistic, 8k, exact original scene, exact character, NO text, NO subtitles, clear face. Remove any text at the bottom. Keep original colors and composition.',
                        model: 'nano_banana_2',
                        aspectRatio: '9:16',
                        count: 1,
                        sectionDir: LOCALIZE_DIR,
                        subFolder: projectFolder,
                        sceneIndex: i,
                        referenceImages: [sceneFrames[i].base64]
                    });
                    if (savedPaths && savedPaths.length > 0) {
                        const imgBuffer = fs.readFileSync(savedPaths[0]);
                        const imgExt = path.extname(savedPaths[0]).toLowerCase();
                        const imgMime = imgExt === '.png' ? 'image/png' : 'image/jpeg';
                        sceneFrames[i].cleanBase64 = `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
                        sceneFrames[i].cleanUrl = `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;
                    }
                } catch (imgErr) {
                    console.error(`[Localize] Image cleaning failed for frame ${i}:`, imgErr.message);
                }
            }

            // Map character avatars from cleaned scene frames
            for (let i = 0; i < characters.length; i++) {
                const speakerId = i + 1;
                const segIndex = (segments || []).findIndex(s => s.speakerId === speakerId);
                if (segIndex !== -1 && sceneFrames && sceneFrames[segIndex]) {
                    characters[i].generatedImageUrl = sceneFrames[segIndex].cleanBase64 || sceneFrames[segIndex].base64;
                    characters[i].bestFrameUrl = sceneFrames[segIndex].url;
                } else {
                    const bestIdx = Math.max(1, Math.min(frames.length, characters[i].bestFrameIndex || 1)) - 1;
                    characters[i].bestFrameUrl = frames[bestIdx]?.url;
                    characters[i].generatedImageUrl = frames[bestIdx]?.base64;
                }
            }

            fs.writeFileSync(path.join(projectDir, 'scene_description.txt'), sceneDescription, 'utf8');
            fs.writeFileSync(path.join(projectDir, 'characters.json'), JSON.stringify(characters.map(c => ({
                name: c.name, description: c.description, appearance: c.appearance, imagePrompt: c.imagePrompt
            })), null, 2));

            return { characters, sceneDescription, sceneFrames };
        } catch (err) {
            console.error('[Localize] Step 3 failed:', err.message);
            throw err;
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 4: Step 4 - Voice Analysis
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-step4-voices', async (event, { projectFolder, segments, speakers }) => {
        try {
            const projectDir = path.join(LOCALIZE_DIR, projectFolder);
            const audioPath = path.join(projectDir, 'audio.mp3');
            console.log('[Localize] Step 4: Analyzing voice characteristics...');
            let voiceProfiles = {};
            let speakerVoices = {};
            
            try {
                voiceProfiles = await analyzeVoiceCharacteristics(audioPath, segments, speakers, projectDir);
                for (const speaker of speakers) {
                    const profile = voiceProfiles[speaker.id];
                    const matchedVoice = findMatchingVoice(profile);
                    speakerVoices[speaker.id] = matchedVoice;
                    speaker.voiceProfile = profile;
                    speaker.voiceId = matchedVoice.voice_id;
                    speaker.voiceName = matchedVoice.name;
                }
                fs.writeFileSync(path.join(projectDir, 'voice_profiles.json'), JSON.stringify({ voiceProfiles, speakerVoices }, null, 2));
                console.log(`[Localize] Step 4: Voice analysis complete: ${Object.keys(voiceProfiles).length} profiles`);
            } catch (voiceErr) {
                console.warn('[Localize] Step 4: Voice analysis failed (non-critical):', voiceErr.message);
            }

            return { voiceProfiles, speakerVoices, speakers };
        } catch (err) {
            console.error('[Localize] Step 4 failed:', err.message);
            throw err;
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-translate-segments', async (event, { projectFolder, segments, targetLanguage }) => {
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const isEnglish = targetLanguage === 'english' || targetLanguage === 'English' || targetLanguage === 'en';
        const langLabel = isGerman ? 'German' : isEnglish ? 'English' : 'French';
        const langFile = isGerman ? 'segments_german.json' : isEnglish ? 'segments_english.json' : 'segments_french.json';
        const systemPrompt = isGerman ? TRANSLATION_DE_PROMPT : isEnglish ? TRANSLATION_EN_PROMPT : TRANSLATION_FR_PROMPT;

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
                        const raw = await ai.chat(msg, false);
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
    ipcMain.handle('localize-generate-metadata', async (event, { projectFolder, transcript, targetLanguage, originalTitle }) => {
        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const isEnglish = targetLanguage === 'english' || targetLanguage === 'English' || targetLanguage === 'en';
        const langLabel = isGerman ? 'German' : isEnglish ? 'English' : 'French';

        console.log(`[Localize] Generating SEO Metadata for ${langLabel}...`);
        try {
            // Clean up original title: remove everything from "..." onwards, and remove extensions
            let cleanTitle = originalTitle || 'Video';
            cleanTitle = cleanTitle.replace(/\.[^/.]+$/, ""); // remove extension
            const ellipsisIndex = cleanTitle.indexOf('...');
            if (ellipsisIndex !== -1) {
                cleanTitle = cleanTitle.substring(0, ellipsisIndex).trim();
            }
            
            const prompt = `Act as an expert social media manager. Based on the following video transcript and the original title, generate a catchy, viral title, a short engaging description (1-2 sentences max), and 2-3 highly relevant hashtags.
The new title should be a localized, polished version of the original title, but feel free to make slight improvements for virality.
The output MUST be in ${langLabel}.
Return ONLY valid JSON in this exact format, with no markdown formatting:
{
  "title": "Your viral title here...",
  "description": "Your short description here...",
  "hashtags": "#hashtag1 #hashtag2"
}

ORIGINAL TITLE: ${cleanTitle}

TRANSCRIPT:
${transcript}`;
            const raw = await ai.chat([{ role: 'user', content: prompt }], true);
            const metadata = safeParseJson(raw, 'seo metadata');
            return {
                title: metadata.title || 'Untitled',
                description: metadata.description || '',
                hashtags: metadata.hashtags || ''
            };
        } catch (e) {
            console.error('[Localize] SEO Metadata generation failed:', e);
            return { title: 'Generated Video', description: '', hashtags: '' };
        }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 3: Generate one dialogue video clip (segment + translated text + TTS + mux)
    // ═══════════════════════════════════════════════════════════════════════════
    async function doGenerateSegmentVideo({ projectFolder, segmentIndex, segments, targetLanguage, characterImages, sceneFrames, characters, sceneDescription, speakerVoices, customPrompt }) {
const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        if (!fs.existsSync(projectDir)) throw new Error(`Project folder not found: ${projectFolder}`);

        const seg = segments[segmentIndex];
        if (!seg) throw new Error(`Segment ${segmentIndex} not found`);

        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const langCode = isGerman ? 'de' : 'fr';
        const langLabel = isGerman ? 'German' : 'French';

        const translatedText = seg.translatedText || seg.text;
        console.log(`[Localize] Generating ${langLabel} video for segment ${segmentIndex}: "${translatedText.substring(0, 60)}..."`);

        // Find character for this speaker
        const charIndex = Math.max(0, (seg.speakerId || 1) - 1);
        const character = (characters || [])[charIndex] || null;

        // Get scene frame for this segment (start_image reference)
        const sceneFrame = (sceneFrames || [])[segmentIndex] || null;
        const sceneFrameBase64 = seg.sceneFrameBase64 || sceneFrame?.base64 || null;

        // Find character reference image for this speaker
        const charImg = (characterImages || []).find(ci => ci.speakerId === seg.speakerId);
        let referenceImageBase64 = null;
        if (charImg && charImg.imageBase64) {
            referenceImageBase64 = charImg.imageBase64;
        }

        // Step 1: Generate scene-aware video prompt (or use custom prompt)
        let videoPrompt;
        let promptData = null;
        if (customPrompt) {
            videoPrompt = customPrompt;
            console.log(`[Localize] Using custom prompt for segment ${segmentIndex}`);
        } else {
            promptData = await generateVideoPromptForSegment(
                seg, sceneFrameBase64, character, sceneDescription || '', translatedText
            );
            videoPrompt = promptData.videoPrompt;
            // Append dialogue and format requirements
            videoPrompt += ` DIALOGUE: "${translatedText}". Duration: ${Math.min(seg.duration || 5, 8)} seconds. Vertical 9:16 TikTok format. No text overlays, no watermark.`;
        }

        // Step 2: Determine start_image — prefer clean scene frame, then character avatar, then original frame
        const cleanSceneFrameBase64 = sceneFrame?.cleanBase64 || null;
        let startImageBase64 = cleanSceneFrameBase64 || referenceImageBase64 || sceneFrameBase64;

        // Step 3: Generate video with Omni Flash
        let videoPath;
        try {
            const refImages = startImageBase64
                ? [{ data: startImageBase64.replace(/^data:image\/\w+;base64,/, '') }]
                : [];

            videoPath = await ai.generateVideo({
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
            audioUrl: null, // Audio is embedded in the video via Omni Flash
            videoPrompt: videoPrompt, // Return the prompt used for UI display/editing
            promptData: promptData   // Full prompt metadata
        };

        console.log(`[Localize] Segment ${segmentIndex} complete: ${result.videoUrl}`);
        return result;
    
}

ipcMain.handle('localize-generate-segment-video', async (event, opts) => {
        return await doGenerateSegmentVideo(opts);
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 4: Batch generate all segment videos for one language
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-batch-generate-segments', async (event, { projectFolder, segments, targetLanguage, characterImages, sceneFrames, characters, sceneDescription, speakerVoices }) => {
        const results = [];
        const langLabel = (targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de') ? 'German' : 'French';

        console.log(`[Localize] Batch generating ${segments.length} ${langLabel} videos...`);

        for (let i = 0; i < segments.length; i++) {
            try {
                const result = await doGenerateSegmentVideo({
                    projectFolder, segmentIndex: i, segments, targetLanguage, characterImages,
                    sceneFrames, characters, sceneDescription, speakerVoices
                });
                results.push({ segmentIndex: i, ...result, status: 'completed' });
            } catch (err) {
                console.error(`[Localize] Batch: segment ${i} failed:`, err.message);
                results.push({ segmentIndex: i, videoUrl: null, audioUrl: null, status: 'failed', error: err.message });
            }
        }

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
        const savedPaths = await ai.generateImage({
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
        const isEnglish = targetLanguage === 'english' || targetLanguage === 'English' || targetLanguage === 'en';
        const systemPrompt = isGerman ? TRANSLATION_DE_PROMPT : isEnglish ? TRANSLATION_EN_PROMPT : TRANSLATION_FR_PROMPT;
        const langLabel = isGerman ? 'German' : isEnglish ? 'English' : 'French';

        const msg = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Translate this dialogue line to ${langLabel}:\n\n${transcript}` }
        ];
        const raw = await ai.chat(msg, false);
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

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler 8: Batch generate video prompts for all segments
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-generate-video-prompts', async (event, { projectFolder, segments, characters, sceneDescription }) => {
        const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        if (!fs.existsSync(projectDir)) throw new Error(`Project folder not found: ${projectFolder}`);

        console.log(`[Localize] Generating video prompts for ${segments.length} segments...`);
        const prompts = [];
        
        // --- NEW: GEMINI VIDEO ANALYSIS LOGIC ---
        let geminiFileUri = null;
        let useGeminiVideo = false;
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        const sourceVideoPath = path.join(projectDir, 'source_video.mp4');
        
        if (apiKey && fs.existsSync(sourceVideoPath)) {
            try {
                console.log('[Localize] Found GEMINI_API_KEY! Uploading full video for deep analysis...');
                const { fileUri, fileName } = await ai.uploadVideoToGemini(sourceVideoPath);
                await ai.waitForGeminiProcessing(fileName);
                geminiFileUri = fileUri;
                useGeminiVideo = true;
                console.log('[Localize] Video successfully processed by Gemini!');
            } catch (err) {
                console.error('[Localize] Gemini video upload failed, falling back to basic analysis:', err.message);
                useGeminiVideo = false;
            }
        }

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const translatedText = seg.translatedText || seg.text;
            const charIndex = Math.max(0, (seg.speakerId || 1) - 1);
            const character = (characters || [])[charIndex] || null;
            const sceneFrameBase64 = seg.sceneFrameBase64 || null;

            try {
                let promptData;
                
                if (useGeminiVideo && geminiFileUri) {
                    // Ask Gemini to watch the specific segment of the video
                    const startTime = seg.startTime || 0;
                    const endTime = seg.endTime || (startTime + 5);
                    const promptText = `Please act as a professional film director. Watch the video clip carefully from timestamp ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s. The character speaking is "${character?.name || 'Unknown'}". The translated dialogue they say is: "${translatedText}". 
Write a highly descriptive and technical video generation prompt (max 3 sentences) that recreates this exact visual scene, capturing the exact camera angle, lighting, background, and character's emotion/action during this specific timeframe. Ensure the prompt is optimized for a Text-to-Video AI model.
IMPORTANT: You MUST include very subtle camera movements in the prompt (e.g., "very slow zoom in", "subtle tracking shot", "slight pan left", "gentle zoom out"). Make the motion cinematic but minimal.
Return ONLY valid JSON in this exact format:
{
  "videoPrompt": "The detailed director's prompt...",
  "cameraAngle": "e.g., close-up, wide shot",
  "emotion": "e.g., angry, happy, neutral",
  "action": "e.g., speaking aggressively, smiling",
  "environmentDescription": "e.g., dimly lit office, sunny street"
}`;
                    const rawGeminiResponse = await ai.generateVideoPromptWithGemini(geminiFileUri, promptText);
                    promptData = safeParseJson(rawGeminiResponse, 'gemini video prompt');
                    promptData.duration = seg.duration || 5;
                } else {
                    promptData = await generateVideoPromptForSegment(
                        seg, sceneFrameBase64, character, sceneDescription || '', translatedText
                    );
                }

                prompts.push({
                    segmentIndex: i,
                    ...promptData,
                    status: 'generated'
                });
                console.log(`[Localize] Prompt ${i + 1}/${segments.length} generated${useGeminiVideo ? ' (Gemini Video)' : ''}`);
            } catch (e) {
                console.error(`[Localize] Prompt generation failed for segment ${i}:`, e.message);
                prompts.push({
                    segmentIndex: i,
                    videoPrompt: `${seg.speakerName || 'Character'} speaking to camera. DIALOGUE: "${translatedText}". Vertical 9:16, professional lighting.`,
                    cameraAngle: 'close-up',
                    emotion: 'neutral',
                    action: 'speaking',
                    environmentDescription: '',
                    isAnimated: false,
                    duration: seg.duration || 5,
                    status: 'fallback'
                });
            }
        }

        // Save prompts to file
        fs.writeFileSync(path.join(projectDir, 'video_prompts.json'), JSON.stringify(prompts, null, 2));
        console.log(`[Localize] Generated ${prompts.length} video prompts`);
        return prompts;
    });

}

module.exports = { registerLocalizeHandlers };
