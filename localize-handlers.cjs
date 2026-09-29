const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);
const { request } = require('undici');
const { spawn, execSync } = require('child_process');
const sharp = require('sharp');

const ai = require('./ai-client.cjs');

const LOCALIZE_DIR = path.join(__dirname, 'TikTokLocalizer');
if (!fs.existsSync(LOCALIZE_DIR)) fs.mkdirSync(LOCALIZE_DIR, { recursive: true });

const KEY_FRAME_COUNT = 6;
const MAX_SEGMENT_DURATION = 8.0;   // Veo 3 / Omni Flash limit for generated video
const MAX_GROUP_DURATION = 9.0;     // Allow grouping speech up to 9s before adapting text to 8s clip
const PAUSE_THRESHOLD = 2.0;        // seconds of silence to split utterances — higher = fewer cuts in narration
const MIN_SEGMENT_DURATION = 1.0;   // minimum segment to avoid tiny clips

// ── System Prompt for Smart Segment Merging ───────────────────────────────────
const SMART_MERGE_PROMPT = `You are a video editor AI. Your job is to merge short dialogue segments into cohesive scenes for video generation.

RULES:
1. A merged group can have an ACCUMULATED SPEECH DURATION (sum of each segment's duration) of up to 9.0 seconds. Do NOT count silence or gaps between segments in the timeline timestamps; sum only the duration values. (Any scene over 8s will have its video clip duration automatically capped at 8.0 seconds and text condensed by AI).
2. Merge segments that form ONE continuous scene or dialogue exchange. Continuous narrative flow is paramount.
3. Do NOT merge if the sum of individual segment durations would exceed 9.0 seconds.
4. AGGRESSIVELY MERGE adjacent short segments to minimize total clips and API generation costs. Even if speakers alternate in a back-and-forth dialogue (e.g. Speaker 1 asking a question and Speaker 2 replying), MERGE THEM into one single scene as long as total duration is ≤ 9.0 seconds.
5. Prefer fewer, longer clips (around 6 to 8 seconds) over many short ones — each clip = one API call = real financial cost.
6. Short segments (< 3s) MUST be merged with adjacent segments if duration allows.
7. A segment that is already between 7s and 9s stays alone.

OUTPUT: Return ONLY valid JSON — an array of groups, each group is an array of segment indices (0-based):
{
  "groups": [
    [0, 1, 2],
    [3],
    [4, 5],
    [6, 7, 8, 9]
  ]
}

Every segment index must appear exactly once. No segment may be omitted.`;

// ── System Prompt for Speaker Diarization ─────────────────────────────────────
const SPEAKER_DIARIZATION_PROMPT = `You are an expert video dialogue analyst and casting director. Your task is to identify distinct characters/speakers in a conversation video and accurately assign each spoken line to the right character based primarily on VISUAL GROUNDING.

You will receive:
1. A full transcript with word-level timestamps
2. Frames extracted at every scene change (camera cut), clearly labeled with their exact timestamp.

The video contains a DIALOGUE between participants (the camera cuts/switches between them).
NOTE ON AUDIO: The original audio track may have dubbing inconsistencies, background noise, or pitch variations. YOU MUST PRIMARILY RELY ON VISUAL IDENTIFICATION of who is in the frame, gesturing, or speaking at that timestamp.

YOUR TASK:
1. Identify the distinct speakers visible in the frames. For each speaker provide:
   - "id": 1 or 2 (or 3 if 3 distinct people appear)
   - "name": A descriptive name based on appearance & role (e.g. "Man in blue jacket", "Doctor with glasses", "Young woman with blonde hair")
   - "description": Clear physical description (face, hair, build, distinctive clothing) for consistent visual reference throughout the video
   - "gender": "male" or "female"
   - "vocalPersona": A natural vocal personality archetype that fits this character's look & role (e.g. "Warm charismatic young baritone", "Energetic friendly mezzo-soprano", "Deep authoritative tenor")

2. Split the transcript into speaker-labeled utterances. Each utterance is one person speaking continuously.
   Use this logic:
   - Match TIMESTAMPS of words with the FRAMES showing who is visible and actively speaking at those moments
   - If Speaker 1 is visible on screen talking during a timeframe, those words belong to Speaker 1
   - Conversation is dynamic: track the conversational back-and-forth context
   - Natural pauses (> ${PAUSE_THRESHOLD}s) typically indicate turn-taking or speaker transitions

3. Return a TIMELINE array where each entry represents one continuous utterance:
   - "speakerId": 1 or 2
   - "text": The exact transcribed words for this utterance
   - "start": Start time in seconds
   - "end": End time in seconds

OUTPUT: Return ONLY valid JSON:
{
  "speakers": [
    {
      "id": 1,
      "name": "...",
      "description": "...",
      "gender": "male",
      "vocalPersona": "Warm charismatic baritone, friendly tone"
    },
    {
      "id": 2,
      "name": "...",
      "description": "...",
      "gender": "female",
      "vocalPersona": "Bright expressive mezzo-soprano, curious tone"
    }
  ],
  "timeline": [
    { "speakerId": 1, "text": "...", "start": 0.0, "end": 4.5 },
    { "speakerId": 2, "text": "...", "start": 4.8, "end": 10.2 }
  ]
}

CRITICAL: Return ONLY valid JSON matching this schema.`;

// ── System Prompt for Video Analysis (Characters in frames) ────────────────────
const ANALYSIS_SYSTEM_PROMPT = `You are a professional video content analyst and character designer. Analyze the provided video frames and identify each visible person/character.

For each distinct character provide:
- "name": Short descriptive name
- "description": What they do in the video, their role
- "appearance": Detailed physical description — hair color/style, face shape, build, clothing, accessories
- "imagePrompt": A professional image generation prompt in English to recreate this character as a photorealistic portrait for a vertical 9:16 TikTok video. Include age, face details, hair, clothing, pose, lighting. Be specific about colors and textures. NO text, NO subtitles. Format: "Photorealistic portrait of a [description], vertical 9:16 TikTok frame, professional lighting, clean background, NO text, NO subtitles."
- "bestFrameIndex": Which frame (by its index 1, 2, 3...) best shows this character

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
- Use casual, engaging German (du/Sie as appropriate for TikTok).
- STRICT TIMING & WORD BUDGET: Video clips are strictly constrained to 8 seconds max (strictly 20-22 words maximum). Even if the original dialogue duration was up to 9 seconds, you MUST intelligently adapt, rephrase, or condense the text so that it contains AT MOST 20-22 words, fitting perfectly into an 8-second clip without altering or losing the original meaning of what the actors said.
- VOICE & GENDER CONSISTENCY: Preserve the speaker's personality, emotional tone, and character distinction based on the story context and gender of the actor(s). If the line contains dialogue between two actors, retain their distinct speaking styles and genders within the word budget.
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── System Prompt for Segment Translation (French) ─────────────────────────────
const TRANSLATION_FR_PROMPT = `You are a professional French localizer for TikTok dialogue content.
Translate the provided dialogue line into natural, colloquial French suitable for a TikTok audience.
RULES:
- Use casual, engaging French (tu/vous as appropriate for TikTok).
- STRICT TIMING & WORD BUDGET: Video clips are strictly constrained to 8 seconds max (strictly 20-22 words maximum). Even if the original dialogue duration was up to 9 seconds, you MUST intelligently adapt, rephrase, or condense the text so that it contains AT MOST 20-22 words, fitting perfectly into an 8-second clip without altering or losing the original meaning of what the actors said.
- VOICE & GENDER CONSISTENCY: Preserve the speaker's personality, emotional tone, and appropriate masculine/feminine grammatical phrasing based on the story context and gender of the character(s). If the line contains dialogue between two actors, retain their distinct speaking styles and genders within the word budget.
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── System Prompt for Segment Translation (English) ────────────────────────────
const TRANSLATION_EN_PROMPT = `You are a professional English localizer for TikTok dialogue content.
Translate the provided dialogue line into natural, colloquial English suitable for a TikTok audience.
RULES:
- Use casual, engaging English.
- STRICT TIMING & WORD BUDGET: Video clips are strictly constrained to 8 seconds max (strictly 20-22 words maximum). Even if the original dialogue duration was up to 9 seconds, you MUST intelligently adapt, rephrase, or condense the text so that it contains AT MOST 20-22 words, fitting perfectly into an 8-second clip without altering or losing the original meaning of what the actors said.
- VOICE & GENDER CONSISTENCY: Preserve the speaker's personality, emotional tone, and character distinction based on the story context and gender of the actor(s). If the line contains dialogue between two actors, retain their distinct speaking styles and genders within the word budget.
OUTPUT: Return ONLY the translated text, nothing else. No JSON, no quotes, no explanations.`;

// ── System Prompt for Voice Characteristics Analysis ───────────────────────────
const VOICE_ANALYSIS_PROMPT = `You are a professional voice director and audio analyst. Analyze the speaker's visual profile and audio sample to establish their permanent, consistent CHARACTER VOICE IDENTITY.

You will receive:
1. A visual and persona description of the speaker from the video
2. Sample text and audio context of the speaker

Analyze and return the consistent vocal identity:
- "gender": "male" or "female" (based primarily on visual character profile and apparent gender)
- "ageRange": "child", "young" (18-30), "middle-aged" (30-55), or "elderly" (55+)
- "timbre": "deep" (bass/baritone), "medium" (tenor/mezzo), or "high" (alto/soprano)
- "style": "energetic", "calm", "authoritative", "playful", "dramatic", or "warm"
- "vocalPersona": 1-2 sentence description of their signature voice identity (e.g. "Confident young professional with warm resonant tenor and articulate delivery")
- "speed": a float from 0.8 to 1.3 (1.0 = normal)
- "pitch": "low", "medium", or "high"
- "emotionalBaseline": default emotional tone (e.g. "friendly", "intrigued", "serious", "cheerful")
- "voiceSearchKeywords": array of 3-5 English keywords to match a TTS voice

OUTPUT: Return ONLY valid JSON:
{
  "gender": "male",
  "ageRange": "young",
  "timbre": "medium",
  "style": "warm",
  "vocalPersona": "Confident young professional with warm resonant tenor and articulate delivery",
  "speed": 1.05,
  "pitch": "medium",
  "emotionalBaseline": "friendly",
  "voiceSearchKeywords": ["young", "male", "warm", "casual"]
}`;

// ── System Prompt for Scene-Based Video Prompt Generation (Sequence Analysis) ──
const SCENE_VIDEO_PROMPT_GENERATOR = `You are an expert AI video director, voice director, and prompt engineer. Your task: study the SOURCE FRAMES and dialogue carefully, identify exactly what is shown and the emotional tone, then write a video generation prompt with scene-specific emotional vocal delivery.

## STEP 1 — IDENTIFY THE SCENE TYPE (required, based on what you see in the frames)
Look at the frames and choose ONE of these types:

**A. TALKING_HEAD**
What you see: A real human face/upper body, clearly in the foreground, mouth area visible.
What to write: Focus the prompt on that person — their face, expression, subtle lip and head movement, emotional state, background. Include lip-sync instructions for that person.

**B. VOICEOVER_VISUAL**
What you see: The frame shows a scene, object, environment, medical imagery, skin texture, bacteria, product, landscape, graphic — with no person speaking in the foreground. The dialogue is narration played over visuals.
What to write: Recreate the exact visual content of the frame as a cinematic shot. Focus on the subject, lighting, texture, and camera movement. The audio plays over the visuals — the visual subject stays on screen throughout.

**C. ANIMATED_CHARACTER**
What you see: A 3D or 2D animated scene (Pixar style, cartoon, CGI) featuring a character — which may be a human, animal, robot, vehicle, food item, or any object — with an expressive face and mouth that can animate.
What to write: Describe the animated character's design, expression, subtle mouth and facial animation, environment. Include lip-sync for the animated character because animated mouths can synchronize with audio regardless of whether the character is human.

**D. MIXED_SCENE**
What you see: A combination — e.g. a person seen from afar, a partial body, a person shown alongside objects, a split-screen, or an unclear composition.
What to write: Describe what is most prominent visually, follow the frame's composition.

## STEP 2 — ANALYZE EMOTIONAL TONE & VOCAL DELIVERY
Analyze the dialogue words and the actor's facial expression/action in the frames:
- "emotion": Primary emotion of this scene (e.g. "excited", "surprised", "curious", "playful", "serious", "concerned", "dramatic", "ironic", "warm", "triumphant", "gentle", "astonished")
- "vocalDelivery": How the character speaks in this specific scene (e.g. "energetic with rising intonations and bright expression", "intrigued whispering tone with sudden emphasis", "confident steady explanation", "humorous sarcastic cadence", "emotional and heartfelt")

## STEP 3 — WRITE THE VIDEO PROMPT
Based on the scene type, construct a precise prompt that includes:
1. The visual subject exactly as seen in the frames (person, object, animated character, environment)
2. The exact visual style (photorealistic cinema, Pixar 3D animation, medical illustration, macro photography, etc.)
3. A subtle cinematic camera movement (very slow zoom in, gentle pan left, subtle tracking shot — keep it minimal)
4. Lighting and color atmosphere from the frames
5. Facial expressions and acting matching the scene emotion
6. End every prompt with: clean frame, no text elements, no captions, no watermarks, vertical 9:16 format

## STEP 4 — OUTPUT (respond with ONLY this JSON, nothing else)
{
  "videoPrompt": "Complete video generation prompt in English. Max 2-4 sentences. Based strictly on what is in the frames.",
  "sceneType": "talking_head" | "voiceover_visual" | "animated_character" | "mixed_scene",
  "cameraAngle": "macro / close-up / medium-shot / wide-shot",
  "emotion": "excited / curious / serious / playful / dramatic / sarcastic / warm / astonished / etc.",
  "vocalDelivery": "expressive vocal delivery style description for this line",
  "action": "what is visually happening in the scene",
  "environmentDescription": "background and setting from the frames",
  "isAnimated": true if the style is 2D/3D animation, false if photorealistic,
  "duration": clip duration in seconds as a number,
  "lipsyncApplies": true if the character or subject should have mouth movement synced to audio (always true for TALKING_HEAD and ANIMATED_CHARACTER, always false for VOICEOVER_VISUAL)
}

## GROUNDING RULES
- The SOURCE FRAMES are the single source of truth. Describe what you see, exactly.
- For VOICEOVER_VISUAL: the audio narration plays over the visual subject — the visual subject stays on screen, the camera moves subtly over it.
- For ANIMATED_CHARACTER: even if the character is a car, robot, fruit, or animal, lip-sync applies because animated characters can speak.
- For all scene types: the audio text is delivered as sound only. The visual prompt describes what viewers see on screen.
- Vertical 9:16 TikTok format applies to all types.`;

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

// ── Intelligent AI word count limiter and semantic reconstructor for lip-sync text ──
// When text exceeds the word budget (max 21 words for an 8s Omni Flash video clip),
// we use LLM to reconstruct and condense the dialogue without losing meaning or emotion.
async function limitLipSyncText(text, maxWords = 21, duration = 8) {
    if (!text) return text;
    const trimmed = text.trim();
    const words = trimmed.split(/\s+/);
    const targetLimit = Math.min(21, maxWords);
    if (words.length <= targetLimit) return trimmed;

    console.log(`[Localize] Text length (${words.length} words) exceeds video generation limit (${targetLimit} words for ~${Math.min(duration || 8, 8)}s Omni Flash clip). Intelligently reconstructing text via AI...`);
    
    let currentText = trimmed;
    let attempts = 0;
    while (currentText.split(/\s+/).length > targetLimit && attempts < 2) {
        attempts++;
        const currentWordsCount = currentText.split(/\s+/).length;
        const prompt = `You are a professional video localizer, voice dialogue director, and script adaptor.
Your task is to reconstruct, rephrase, and condense the following spoken dialogue text so that it fits within a STRICT word budget for an 8-second video generation limit (Omni Flash), while preserving the exact meaning, emotional tone, character style, and original language.

MANDATORY RULES:
1. STRICT WORD BUDGET: You MUST condense the text to contain AT MOST ${targetLimit} words in total. (Current text has ${currentWordsCount} words). Any count over ${targetLimit} words will cause video generation speech truncation.
2. PRESERVE MEANING & TONE: Keep the complete original sense, emotional resonance, and key details of what the actor/character says. Do NOT change the story or message.
3. PRESERVE LANGUAGE & GENDER: The output must be in the EXACT SAME LANGUAGE (German, French, English, etc.) and retain appropriate grammar/gender as the input text. Do NOT translate into English or another language.
4. NATURAL SPEECH: The phrase must form grammatically complete, articulate, natural-sounding sentences that flow smoothly when spoken aloud. Never cut off abruptly.

INPUT DIALOGUE (${currentWordsCount} words):
"${currentText}"

OUTPUT: Return ONLY the reconstructed, condensed speech text. Nothing else. No quotes, no prefix, no explanations, no markdown.`;

        try {
            const response = await ai.chat([
                { role: 'system', content: 'You are an expert audio dialogue script timing editor who intelligently condenses speech text to fit strict video clip duration limits while preserving meaning and character voice.' },
                { role: 'user', content: prompt }
            ], false);
            if (response && response.trim()) {
                currentText = response.trim().replace(/^["']|["']$/g, '');
                console.log(`[Localize] Reconstruction attempt ${attempts}: ${currentWordsCount} words -> ${currentText.split(/\s+/).length} words ("${currentText}")`);
            } else {
                break;
            }
        } catch (err) {
            console.warn(`[Localize] AI text reconstruction failed on attempt ${attempts}: ${err.message}`);
            break;
        }
    }

    return currentText;
}

const LAPLACIAN_KERNEL = {
    width: 3,
    height: 3,
    kernel: [
        0,  1, 0,
        1, -4, 1,
        0,  1, 0
    ]
};

// ── Smart Frame Quality & Blur Detection (Laplacian Variance + Luminance + Contrast) ──
async function calculateFrameQuality(buffer, timestampOffset = 0.5, duration = 5) {
    try {
        // 1. Calculate basic luminance and contrast
        const baseStats = await sharp(buffer)
            .resize(320, 320, { fit: 'inside' })
            .grayscale()
            .stats();
            
        const meanBrightness = baseStats.channels[0].mean;
        const contrast = baseStats.channels[0].stdev;
        
        // 2. Calculate Laplacian variance for high-frequency edge energy (blur vs sharpness)
        const edgeStats = await sharp(buffer)
            .resize(320, 320, { fit: 'inside' })
            .grayscale()
            .convolve(LAPLACIAN_KERNEL)
            .stats();
            
        const sharpness = edgeStats.channels[0].stdev;
        
        // 3. Flags for unusable / degraded frames
        const isTooDark = meanBrightness < 35;
        const isTooBright = meanBrightness > 240;
        const isBlurry = sharpness < 7.0 || contrast < 12;
        
        let score = (sharpness * 2.5) + (contrast * 0.8);
        
        // Penalties for black transition fades or overexposed flashes
        if (isTooDark) {
            score -= (35 - meanBrightness) * 40 + 500;
        } else if (meanBrightness < 55) {
            score -= (55 - meanBrightness) * 8;
        }
        if (isTooBright) {
            score -= (meanBrightness - 240) * 40 + 500;
        }
        
        // Penalty for motion blur or out-of-focus frames
        if (sharpness < 7.0) {
            score -= (7.0 - sharpness) * 50;
        }
        
        // Temporal stability bonus: frames in the stable 15%-80% zone avoid cut/whip-pan artifacts
        if (duration > 0) {
            const relPos = Math.max(0, Math.min(1, timestampOffset / duration));
            if (relPos >= 0.15 && relPos <= 0.80) {
                score += 15;
            } else if (relPos < 0.08) {
                score -= 25; // edge cut penalty
            }
        }
        
        return {
            score,
            sharpness,
            contrast,
            brightness: meanBrightness,
            isBlurry,
            isTooDark,
            isTooBright
        };
    } catch (e) {
        return { score: 0, sharpness: 0, contrast: 0, brightness: 128, isBlurry: false, isTooDark: false, isTooBright: false };
    }
}

async function findBestRepresentativeFrame(seq, segmentDuration = 5) {
    if (!seq || seq.length === 0) return null;
    if (seq.length === 1) return seq[0];

    const scored = [];
    for (let i = 0; i < seq.length; i++) {
        const frame = seq[i];
        if (!frame) continue;
        
        try {
            let buffer = null;
            if (frame.base64) {
                const base64Data = frame.base64.split(';base64,').pop();
                buffer = Buffer.from(base64Data, 'base64');
            } else if (frame.path && fs.existsSync(frame.path)) {
                buffer = fs.readFileSync(frame.path);
            }
            if (!buffer) continue;
            
            const offset = typeof frame.offset === 'number' ? frame.offset : (i * 0.3);
            const quality = await calculateFrameQuality(buffer, offset, segmentDuration);
            scored.push({ frame, ...quality });
        } catch (err) {
            console.warn('[Localize] Quality calc error:', err.message);
            scored.push({ frame, score: 0, sharpness: 0, brightness: 128, contrast: 0, isBlurry: false });
        }
    }

    if (scored.length === 0) return seq[0];

    // Filter out dark or overly blurry frames if better candidates exist
    const usable = scored.filter(s => !s.isTooDark && !s.isTooBright && !s.isBlurry);
    const pool = usable.length > 0 ? usable : scored.filter(s => !s.isTooDark);
    const finalPool = pool.length > 0 ? pool : scored;

    finalPool.sort((a, b) => b.score - a.score);
    const best = finalPool[0];
    console.log(`[Localize] Picked best frame at ${(best.frame.timestamp !== undefined ? best.frame.timestamp : 0).toFixed(2)}s: score=${best.score.toFixed(1)}, sharpness=${best.sharpness?.toFixed(1)}, brightness=${best.brightness?.toFixed(1)}, contrast=${best.contrast?.toFixed(1)} from ${scored.length} candidates`);

    return best.frame;
}

// ── STT logic moved to ai-client.cjs ──────────────────────────────────────────



// ── Pause-based utterance segmentation ─────────────────────────────────────────
function splitTranscriptIntoUtterances(words) {
    if (!words || words.length === 0) return [];

    const utterances = [];
    let currentWords = [words[0]];

    for (let i = 1; i < words.length; i++) {
        const gap = words[i].start - words[i - 1].end;

        if (gap > PAUSE_THRESHOLD) {
            // Natural pause only — punctuation alone is not enough to split
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

        if (duration <= MAX_GROUP_DURATION && duration >= MIN_SEGMENT_DURATION) {
            // Perfect — fits in one segment (if up to 9s, duration is capped at 8s for video generator)
            segments.push({
                speakerId,
                speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                text: entry.text.trim(),
                startTime: entry.start,
                endTime: entry.end,
                duration: Math.min(MAX_SEGMENT_DURATION, Math.round(duration * 100) / 100),
                translatedText: undefined,
                videoUrl: undefined,
                audioUrl: undefined
            });
        } else if (duration > MAX_GROUP_DURATION) {
            // Too long — split into sub-segments (split at sentence boundaries if possible)
            const text = entry.text.trim();
            const sentences = text.split(/(?<=[.!?])\s+/);
            let currentChunk = '';
            let chunkCharCount = 0;
            const totalChars = text.length;
            const charsPerSecond = totalChars / duration;

            for (const sentence of sentences) {
                const estimatedDuration = (currentChunk.length + sentence.length) / charsPerSecond;
                if (estimatedDuration > MAX_GROUP_DURATION && currentChunk.length > 0) {
                    const segStart = entry.start + (chunkCharCount / charsPerSecond);
                    const segEnd = entry.start + ((chunkCharCount + currentChunk.length) / charsPerSecond);
                    const rawDur = (currentChunk.length / charsPerSecond);
                    segments.push({
                        speakerId,
                        speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                        text: currentChunk.trim(),
                        startTime: Math.round(segStart * 100) / 100,
                        endTime: Math.round(Math.min(segEnd, entry.end) * 100) / 100,
                        duration: Math.min(MAX_SEGMENT_DURATION, Math.round(rawDur * 100) / 100),
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
                const rawDur = (currentChunk.length / charsPerSecond);
                segments.push({
                    speakerId,
                    speakerName: speakerNames[speakerId] || `Speaker ${speakerId}`,
                    text: currentChunk.trim(),
                    startTime: Math.round(segStart * 100) / 100,
                    endTime: entry.end,
                    duration: Math.min(MAX_SEGMENT_DURATION, Math.round(rawDur * 100) / 100),
                    translatedText: undefined,
                    videoUrl: undefined,
                    audioUrl: undefined
                });
            }
        }
        // Skip segments shorter than MIN_SEGMENT_DURATION — they get merged with neighbors
    }

    // Merge adjacent segments up to MAX_GROUP_DURATION (9.0s), even across alternating dialogue speakers
    const merged = [];
    for (const seg of segments) {
        if (merged.length > 0) {
            const prev = merged[merged.length - 1];
            // Use accumulated speech duration rather than timestamp span (which might contain silent gaps)
            const accumulatedSpeechDuration = Math.round((prev.duration + seg.duration) * 100) / 100;
            const gap = seg.startTime - prev.endTime;
            if (accumulatedSpeechDuration <= MAX_GROUP_DURATION && gap < 15.0) {
                if (prev.speakerId !== seg.speakerId) {
                    const prevNames = (prev.speakerName || '').split(' + ').map(n => n.trim());
                    const newNames = (seg.speakerName || '').split(' + ').map(n => n.trim());
                    newNames.forEach(n => {
                        if (n && !prevNames.includes(n)) prevNames.push(n);
                    });
                    prev.speakerName = prevNames.join(' + ');
                    prev.text = `${prev.text} — ${seg.text}`;
                } else {
                    prev.text += ' ' + seg.text;
                }
                prev.endTime = seg.endTime;
                prev.duration = Math.min(MAX_SEGMENT_DURATION, accumulatedSpeechDuration);
                continue;
            }
        }
        merged.push(seg);
    }

    console.log(`[Localize] Built ${merged.length} final segments (≤${MAX_GROUP_DURATION}s grouped, duration capped at ${MAX_SEGMENT_DURATION}s)`);
    return merged;
}

// ── Smart segment merging via LLM ─────────────────────────────────────────────
async function smartMergeSegments(segments) {
    if (segments.length <= 1) return segments;

    const segmentList = segments.map((s, i) =>
        `${i}: [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s, ${s.duration.toFixed(2)}s] Speaker:${s.speakerName} — "${s.text}"`
    ).join('\n');

    console.log(`[Localize] SmartMerge: analyzing ${segments.length} segments for merging opportunities...`);

    try {
        const msg = [
            { role: 'system', content: SMART_MERGE_PROMPT },
            { role: 'user', content: `Here are ${segments.length} video segments. Merge adjacent segments into cohesive scenes (allow grouping up to 9.0s of speech per scene; generated video clip duration will be capped at 8s). Aggressively combine alternating dialogue lines between actors to minimize total clips.\n\n${segmentList}` }
        ];
        const raw = await ai.chat(msg, true);
        const parsed = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]);
        const groups = parsed.groups;

        if (!Array.isArray(groups) || groups.length === 0) throw new Error('Invalid groups response');

        // Validate all indices present exactly once
        const seen = new Set();
        for (const group of groups) {
            for (const idx of group) {
                if (idx < 0 || idx >= segments.length || seen.has(idx)) throw new Error(`Invalid index ${idx}`);
                seen.add(idx);
            }
        }
        if (seen.size !== segments.length) throw new Error('Not all segments covered');

        // Build merged segments
        const merged = groups.map(group => {
            if (group.length === 1) {
                const s = segments[group[0]];
                return { ...s, duration: Math.min(MAX_SEGMENT_DURATION, s.duration) };
            }
            const first = segments[group[0]];
            const last = segments[group[group.length - 1]];
            const combinedText = group.map(idx => segments[idx].text).join(' — ');
            const accumulatedDuration = Math.round(group.reduce((sum, idx) => sum + segments[idx].duration, 0) * 100) / 100;
            const cappedDuration = Math.min(MAX_SEGMENT_DURATION, accumulatedDuration);

            // Combine speaker names if multiple actors appear in this scene
            const allNames = [];
            group.forEach(idx => {
                const nList = (segments[idx].speakerName || `Speaker ${segments[idx].speakerId || 1}`).split(' + ');
                nList.forEach(name => {
                    const cleanName = name.trim();
                    if (cleanName && !allNames.includes(cleanName)) allNames.push(cleanName);
                });
            });
            const speakerName = allNames.join(' + ');

            return {
                ...first,
                speakerName,
                text: combinedText,
                endTime: last.endTime,
                duration: cappedDuration
            };
        });

        console.log(`[Localize] SmartMerge: ${segments.length} segments → ${merged.length} scenes (saved ${segments.length - merged.length} API calls)`);
        return merged;
    } catch (e) {
        console.warn(`[Localize] SmartMerge failed (${e.message}), keeping original segments`);
        return segments;
    }
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

// ── Perceptual hash for frame dedup (simple 8x8 average hash) ─────────────────
function computeFrameHash(buffer) {
    // Sample 64 evenly-spaced bytes as a cheap luminance proxy
    const step = Math.max(1, Math.floor(buffer.length / 64));
    let sum = 0;
    const samples = [];
    for (let i = 0; i < 64; i++) {
        const val = buffer[i * step] || 0;
        samples.push(val);
        sum += val;
    }
    const avg = sum / 64;
    // Build a 64-bit bitstring: 1 if pixel > avg
    return samples.map(v => (v > avg ? 1 : 0)).join('');
}

function hammingDistance(hashA, hashB) {
    let dist = 0;
    for (let i = 0; i < hashA.length; i++) {
        if (hashA[i] !== hashB[i]) dist++;
    }
    return dist;
}

// ── Extract high-quality scene candidate frames for each segment ───────────────
// Multi-candidate sampling across the stable duration of the segment (skipping early cut/whip-pan boundary)
// Dedup: perceptual hash drops near-identical consecutive frames (hamming < 8/64)
function extractSegmentSceneFrames(videoPath, segments, projectDir) {
    const sceneFrames = [];
    const DEDUP_THRESHOLD = 8;    // hamming distance — frames with dist < 8 are near-identical

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const segDir = path.join(projectDir, `screenshots_seg_${i + 1}`);
        if (!fs.existsSync(segDir)) fs.mkdirSync(segDir, { recursive: true });

        const startTime = seg.startTime || 0;
        const endTime = seg.endTime || (startTime + 5);
        const duration = Math.max(0.5, endTime - startTime);

        console.log(`[Localize] Extracting candidate frames for segment ${i + 1} (${startTime.toFixed(2)}s - ${endTime.toFixed(2)}s, dur: ${duration.toFixed(2)}s)`);

        let sequence = [];

        // Multi-point sampling across the segment:
        // Skip first 0.15s transition window to avoid cut/dissolve blur!
        const startOffset = Math.min(0.25, duration * 0.12);
        const endOffset = Math.max(startOffset + 0.2, duration - Math.min(0.2, duration * 0.08));
        const sampleCount = Math.min(10, Math.max(5, Math.round(duration / 0.4)));
        const step = (endOffset - startOffset) / Math.max(1, sampleCount - 1);

        for (let j = 0; j < sampleCount; j++) {
            const relTs = startOffset + j * step;
            const absTs = startTime + relTs;
            const framePath = path.join(segDir, `frame_${absTs.toFixed(2)}s.jpg`);

            try {
                execSync(
                    `ffmpeg -ss ${absTs.toFixed(3)} -accurate_seek -i "${videoPath}" -frames:v 1 -q:v 3 -vf "scale=-2:480" -pix_fmt yuvj420p -strict unofficial "${framePath}" -y`,
                    { stdio: 'pipe' }
                );

                if (fs.existsSync(framePath)) {
                    const buf = fs.readFileSync(framePath);
                    sequence.push({
                        timestamp: absTs,
                        offset: relTs,
                        path: framePath,
                        url: `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`,
                        base64: `data:image/jpeg;base64,${buf.toString('base64')}`,
                        reason: 'quality-sampled'
                    });
                }
            } catch (e) {
                console.warn(`[Localize]   Failed to extract candidate frame at ${absTs.toFixed(2)}s:`, e.message);
            }
        }

        // Dedup: drop near-identical consecutive frames
        const deduped = [];
        let lastHash = null;
        for (const frame of sequence) {
            try {
                const buf = Buffer.from(frame.base64.split(';base64,').pop(), 'base64');
                const hash = computeFrameHash(buf);
                if (lastHash === null || hammingDistance(hash, lastHash) >= DEDUP_THRESHOLD) {
                    deduped.push(frame);
                    lastHash = hash;
                }
            } catch {
                deduped.push(frame); // on error keep the frame
            }
        }

        const finalSeq = deduped.length > 0 ? deduped : sequence;
        const dropped = sequence.length - finalSeq.length;
        if (dropped > 0) console.log(`[Localize]   Dedup: removed ${dropped} redundant frames, kept ${finalSeq.length}`);

        sceneFrames.push({ index: i, sequence: finalSeq });
        console.log(`[Localize] Segment ${i + 1}: ${finalSeq.length} candidate frames ready`);
    }
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
            execSync(`ffmpeg -i "${audioPath}" -ss ${bestSeg.startTime.toFixed(2)} -to ${bestSeg.endTime.toFixed(2)} -acodec libmp3lame -ar 22050 -ac 1 -b:a 48k -y "${samplePath}"`, { stdio: 'pipe' });
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

            const gender = voiceData.gender || speaker.gender || (speaker.id === 1 ? 'male' : 'female');
            const vocalPersona = voiceData.vocalPersona || speaker.vocalPersona || `Consistent ${gender} voice, ${voiceData.style || 'warm'} tone`;

            voiceProfiles[speaker.id] = {
                gender,
                ageRange: voiceData.ageRange || 'young',
                timbre: voiceData.timbre || 'medium',
                style: voiceData.style || 'warm',
                vocalPersona,
                speed: voiceData.speed || 1.0,
                pitch: voiceData.pitch || 'medium',
                emotionalBaseline: voiceData.emotionalBaseline || 'friendly',
                emotionalTone: voiceData.emotionalBaseline || voiceData.emotionalTone || 'friendly',
                voiceSearchKeywords: voiceData.voiceSearchKeywords || [],
                samplePath
            };

            console.log(`[Localize] Voice profile for "${speaker.name}": ${gender}, ${voiceData.ageRange}, ${voiceData.timbre}, ${voiceData.style} | Persona: "${vocalPersona}"`);
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

async function ensureCleanSegmentImage(projectFolder, segmentIndex, seg = null) {
    const projectDir = path.join(LOCALIZE_DIR, projectFolder);
    if (!fs.existsSync(projectDir)) return null;

    // 1. Проверяем, существует ли уже чистый кадр без субтитров на диске
    try {
        const cleanFiles = fs.readdirSync(projectDir)
            .filter(f => f.startsWith(`scene_seg_${segmentIndex}_clean_`) && (f.endsWith('.jpg') || f.endsWith('.png')))
            .sort().reverse();

        if (cleanFiles.length > 0) {
            const filePath = path.join(projectDir, cleanFiles[0]);
            const buf = fs.readFileSync(filePath);
            const ext = path.extname(cleanFiles[0]).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
            const base64 = `data:${mime};base64,${buf.toString('base64')}`;
            const url = `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;
            if (seg) {
                seg.sceneFrameBase64 = base64;
                seg.sceneFrameUrl = url;
            }
            return { url, base64, filePath };
        }
    } catch (e) {
        console.warn(`[Localize] Ошибка сканирования диска на предмет чистых кадров:`, e.message);
    }

    // 2. Если чистый кадр отсутствует, считываем исходный скриншот сегмента из анализа видео
    console.log(`[Localize] Сегмент ${segmentIndex}: чистый референсный кадр отсутствует. Автоматически создаем чистую картинку без субтитров...`);
    let segRefImages = [];
    const segScreensDir = path.join(projectDir, `screenshots_seg_${segmentIndex + 1}`);
    if (fs.existsSync(segScreensDir)) {
        const jpgFiles = fs.readdirSync(segScreensDir).filter(f => f.endsWith('.jpg')).sort();
        if (jpgFiles.length > 0) {
            const rawB64 = fs.readFileSync(path.join(segScreensDir, jpgFiles[0]), 'base64');
            segRefImages = [{ data: rawB64 }];
            console.log(`[Localize] В качестве исходника для удаления субтитров взят кадр ${jpgFiles[0]} из screenshots_seg_${segmentIndex + 1}`);
        }
    }

    // Специальный промпт для удаления субтитров, текста, плашек и рамки кадра
    const cleanPrompt = `Create a clean, full-screen vertical 9:16 photographic artwork based on the visual subject and scene shown in the reference image.\nCRITICAL REQUIREMENTS:\n1. NO BLACK BARS OR BORDERS: Expand the scene vertically to completely fill the entire 9:16 vertical canvas from top to bottom. No letterboxing or 16:9 crop marks whatsoever.\n2. ZERO TEXT OR SUBTITLES: Remove all titles, captions, subtitles, logos, watermarks, and typography completely. The image must be 100% clean visual content.\n3. PRESERVE SUBJECT & STYLE: Keep the character appearance, lighting, colors, and art style from the reference scene, rendered as a high-quality, full-screen vertical 9:16 cinematic still.`;

    let attempts = 0;
    while (attempts < 3) {
        try {
            attempts++;
            const savedPaths = await ai.generateImage({
                prompt: cleanPrompt,
                model: 'nano_banana_2',
                aspectRatio: '9:16',
                count: 1,
                sectionDir: LOCALIZE_DIR,
                subFolder: projectFolder,
                sceneIndex: `seg_${segmentIndex}_clean_${Date.now()}`,
                referenceImages: segRefImages
            });

            if (savedPaths && savedPaths.length > 0) {
                const filePath = savedPaths[0];
                const imgBuffer = fs.readFileSync(filePath);
                const imgExt = path.extname(filePath).toLowerCase();
                const imgMime = imgExt === '.png' ? 'image/png' : 'image/jpeg';
                const b64 = `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
                const url = `media:///${filePath.replace(/\\/g, '/')}?t=${Date.now()}`;

                if (seg) {
                    seg.sceneFrameBase64 = b64;
                    seg.sceneFrameUrl = url;
                }

                console.log(`[Localize] Чистая референсная картинка (без субтитров) сгенерирована для сегмента ${segmentIndex + 1}: ${filePath}`);
                return { url, base64: b64, filePath };
            }
        } catch (err) {
            console.warn(`[Localize] Попытка ${attempts} генерации чистого референсного кадра для сегмента ${segmentIndex} не удалась:`, err.message);
            if (attempts < 3) await new Promise(r => setTimeout(r, 2000));
        }
    }

    return null;
}

// ── Generate video prompt based on scene sequence + translated text ──────────
async function generateVideoPromptForSegment(segment, sequenceFrames, character, sceneDescription, translatedText) {
    // Always limit lip-sync text to what can realistically fit in the clip duration
    const maxWords = Math.min(21, Math.max(8, Math.round((segment.duration || 5) * 2.5))); // ~2.5 words/sec, max 21 words for Omni Flash 8s limit
    const lipsyncText = await limitLipSyncText(translatedText, maxWords, segment.duration || 5);

    if (!sequenceFrames || sequenceFrames.length === 0) {
        // Fallback without frames — generate basic voiceover or talking head based on scene description
        const isLikelyVoiceover = sceneDescription && (
            sceneDescription.toLowerCase().includes('narrator') ||
            sceneDescription.toLowerCase().includes('closeup') ||
            sceneDescription.toLowerCase().includes('macro') ||
            sceneDescription.toLowerCase().includes('animation')
        );
        const basePrompt = isLikelyVoiceover
            ? `Cinematic macro close-up shot. ${sceneDescription || 'Medical or instructional visual content'}. Very slow cinematic zoom in. Photorealistic, high detail. Vertical 9:16 TikTok frame. NO text, NO subtitles, clean frame.`
            : `A photorealistic ${segment.speakerName || 'Speaker'} speaking directly to camera. Natural mouth movements, slight head movements, expressive. Vertical 9:16 TikTok frame, professional lighting, 8k detail. Very subtle camera movement.`;
        return {
            videoPrompt: basePrompt,
            sceneType: isLikelyVoiceover ? 'voiceover_visual' : 'talking_head',
            cameraAngle: 'close-up',
            emotion: 'neutral',
            action: isLikelyVoiceover ? 'cinematic visual' : 'speaking to camera',
            environmentDescription: sceneDescription || 'blurred background, cinematic lighting',
            isAnimated: false,
            duration: segment.duration || 5
        };
    }

    try {
        const frameCount = sequenceFrames.filter(f => f.base64).length;
        const promptContent = [
            {
                type: 'text',
                text: `Study the ${frameCount} SOURCE FRAME(S) below carefully.

Complete STEP 1 first: identify the scene type (TALKING_HEAD / VOICEOVER_VISUAL / ANIMATED_CHARACTER / MIXED_SCENE) by looking at what is actually in the frames.

SEGMENT INFO:
- Speaker/Narrator label: ${character?.name || segment.speakerName || 'Narrator'}
- Character visual description: ${character?.appearance || 'N/A'}
- Scene context: ${sceneDescription || 'TikTok video'}
- Clip duration: ${segment.duration || 5} seconds
- Audio track (delivered as sound, not shown on screen): "${lipsyncText}"

Then complete STEP 2 and return the JSON from STEP 3.`
            }
        ];

        // Inject all frames into the prompt payload
        for (const frame of sequenceFrames) {
            if (frame.base64) {
                promptContent.push({
                    type: 'image_url',
                    image_url: { url: frame.base64, detail: 'low' } // use 'low' detail to save tokens since it's a sequence
                });
            }
        }

        const promptMessages = [
            { role: 'system', content: SCENE_VIDEO_PROMPT_GENERATOR },
            { role: 'user', content: promptContent }
        ];

        const promptRaw = await ai.chat(promptMessages, true);
        const promptData = safeParseJson(promptRaw, 'video prompt generation');
        const sceneType = promptData.sceneType || 'talking_head';
        // lipsyncApplies: true for talking_head and animated_character, false for voiceover_visual
        const lipsyncApplies = promptData.lipsyncApplies !== undefined
            ? promptData.lipsyncApplies
            : (sceneType === 'talking_head' || sceneType === 'animated_character');
        console.log(`[Localize] Prompt [${sceneType}] lipsync=${lipsyncApplies}: "${(promptData.videoPrompt || '').substring(0, 80)}..."`);
        return {
            videoPrompt: promptData.videoPrompt || '',
            sceneType,
            lipsyncApplies,
            cameraAngle: promptData.cameraAngle || 'close-up',
            emotion: promptData.emotion || 'neutral',
            vocalDelivery: promptData.vocalDelivery || 'natural expressive intonation',
            action: promptData.action || 'visual',
            environmentDescription: promptData.environmentDescription || '',
            isAnimated: promptData.isAnimated || false,
            duration: promptData.duration || segment.duration || 5
        };
    } catch (e) {
        console.error(`[Localize] Video prompt generation failed:`, e.message);
        return {
            videoPrompt: `Cinematic ${sceneDescription ? 'shot: ' + sceneDescription.substring(0, 80) : 'close-up visual scene'}. Very slow zoom in, photorealistic. Vertical 9:16 TikTok format. Clean frame, no text elements.`,
            sceneType: 'voiceover_visual',
            lipsyncApplies: false,
            cameraAngle: 'close-up',
            emotion: 'neutral',
            vocalDelivery: 'calm natural narration',
            action: 'cinematic visual',
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
            execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 32k -y "${audioPath}"`, { stdio: 'pipe' });

            console.log('[Localize] Step 1: Transcribing audio...');
            const sttResult = await ai.transcribe(audioPath);
            const transcript = sttResult.text;
            const transcriptWords = sttResult.words;
            if (!transcript || transcriptWords.length === 0) {
                throw new Error('Audio transcription returned an empty result. Please check the video audio track.');
            }

            console.log('[Localize] Step 1: Segmenting utterances...');
            const utterances = splitTranscriptIntoUtterances(transcriptWords);

            console.log('[Localize] Step 1: Extracting scene-change frames using FFmpeg...');
            const frames = [];
            const outputPattern = path.join(projectDir, 'scene_frame_%04d.jpg');
            const ffmpegCmd = `ffmpeg -hide_banner -loglevel info -y -i "${videoPath}" -vf "select='eq(n\\,0)+gt(scene\\,0.2)',scale=512:-1,showinfo" -vsync vfr -q:v 4 "${outputPattern}"`;
            
            let ffmpegOutput = '';
            try {
                // We use stderr because showinfo outputs to stderr
                ffmpegOutput = execSync(ffmpegCmd, { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
            } catch (err) {
                // execSync throws if exit code != 0, but stderr is available on the error object
                ffmpegOutput = err.stderr || err.stdout || '';
            }

            // Parse timestamps from showinfo
            const tsRegex = /pts_time:([0-9.]+)/g;
            const timestamps = [];
            let match;
            while ((match = tsRegex.exec(ffmpegOutput)) !== null) {
                timestamps.push(parseFloat(match[1]));
            }

            // Read generated frames
            const extractedFiles = fs.readdirSync(projectDir)
                .filter(f => f.startsWith('scene_frame_') && f.endsWith('.jpg'))
                .sort(); // %04d ensures correct string sorting

            for (let i = 0; i < extractedFiles.length; i++) {
                const frameFile = extractedFiles[i];
                const framePath = path.join(projectDir, frameFile);
                const ts = i < timestamps.length ? timestamps[i] : (timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0);
                const finalTs = parseFloat(ts.toFixed(2));
                const finalBuf = fs.readFileSync(framePath);

                frames.push({
                    index: i + 1,
                    timestamp: finalTs,
                    path: framePath,
                    url: `media:///${framePath.replace(/\\/g, '/')}?t=${Date.now()}`,
                    base64: `data:image/jpeg;base64,${finalBuf.toString('base64')}`
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
                    text: `Analyze this dialogue video. Full transcript with word timestamps:\n\n${JSON.stringify(transcriptWords.slice(0, 500))}\n\nThe transcript has been pre-segmented into ${utterances.length} utterances based on natural pauses:\n\n${utterances.map((u,i) => `U${i+1} [${u.start.toFixed(1)}-${u.end.toFixed(1)}s]: "${u.text}"`).join('\n')}\n\nIdentify the 2 speakers and assign each utterance to Speaker 1 or Speaker 2. The camera switches between them. Use the FRAMES below (which show each scene change with exact timestamps) to see who appears at which moments. Return the complete JSON timeline.`
                }
            ];

            for (const frame of frames) {
                diarizationContent.push({
                    type: 'text',
                    text: `Frame at ${frame.timestamp}s:`
                });
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
            const rawSegments = splitIntoSegments(timeline, speakers);
            fs.writeFileSync(path.join(projectDir, 'speaker_timeline.json'), JSON.stringify({ speakers, timeline }, null, 2));

            console.log('[Localize] Step 2: Smart-merging segments into cohesive scenes...');
            const segments = await smartMergeSegments(rawSegments);
            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));

            console.log('[Localize] Step 2: Extracting scene start frames for segments...');
            const videoPath = path.join(projectDir, 'source_video.mp4');
            const sceneFrames = extractSegmentSceneFrames(videoPath, segments, projectDir);
            for (let i = 0; i < segments.length; i++) {
                const seq = sceneFrames[i]?.sequence || [];
                segments[i].sequenceFrames = seq;
                
                // Find the sharpest, best-lit, non-transition frame for the UI and fallback
                const bestFrame = await findBestRepresentativeFrame(seq, segments[i].duration || 5);
                segments[i].sceneFrameUrl = bestFrame?.url || null; 
                segments[i].sceneFrameBase64 = bestFrame?.base64 || null; 
            }
            fs.writeFileSync(path.join(projectDir, 'scene_frames.json'), JSON.stringify(sceneFrames, null, 2));

            // ── Auto-generate video prompts from frames (right here in Step 2) ──
            // No separate "Generate Prompts" step needed — prompts are built from the frames we just extracted.
            // When user translates later, only the lip-sync text is swapped, the visual prompt stays the same.
            console.log('[Localize] Step 2: Auto-generating video prompts from extracted frames...');
            for (let i = 0; i < segments.length; i++) {
                const seg = segments[i];
                try {
                    const seq = sceneFrames[i]?.sequence || [];
                    const bestFrame = seq.find(f => f.url === seg.sceneFrameUrl) || seq[0] || null;
                    const otherFrames = seq.filter(f => f !== bestFrame);
                    const sampled = bestFrame ? [bestFrame, ...otherFrames.slice(0, 3)] : seq.slice(0, 4);
                    const promptResult = await generateVideoPromptForSegment(
                        seg, sampled, null, '', seg.text
                    );
                    segments[i].sceneType = promptResult.sceneType;
                    segments[i].lipsyncApplies = promptResult.lipsyncApplies;
                    segments[i].isAnimated = promptResult.isAnimated;
                    segments[i].emotion = promptResult.emotion || 'expressive';
                    segments[i].vocalDelivery = promptResult.vocalDelivery || 'natural dynamic intonation';

                    // Append lip-sync audio cue to the prompt so it's visible in UI
                    // and used directly when generating without translation
                    const clipDuration = Math.min(seg.duration || 5, 8);
                    const maxWords = Math.min(21, Math.max(8, Math.round(clipDuration * 2.5)));
                    const lipsyncText = await limitLipSyncText(seg.text, maxWords, clipDuration);
                    if (seg.text && seg.text.trim() !== lipsyncText) {
                        segments[i].text = lipsyncText;
                        seg.text = lipsyncText;
                    }
                    let finalPrompt = promptResult.videoPrompt;
                    if (promptResult.sceneType === 'voiceover_visual') {
                        finalPrompt += ` Narration audio plays over this cinematic visual scene for ${clipDuration} seconds with subtle camera movement. Clean frame, no text elements, vertical 9:16 format.`;
                    } else if (promptResult.sceneType === 'animated_character') {
                        finalPrompt += ` The animated character's mouth and face synchronize with the spoken audio: "${lipsyncText}". Expressive facial animation, ${clipDuration} seconds, clean frame, no text elements, vertical 9:16 format.`;
                    } else {
                        finalPrompt += ` Lip-sync: the character's mouth precisely synchronizes with the spoken audio: "${lipsyncText}". Duration ${clipDuration} seconds. Clean frame, no text elements, vertical 9:16 format.`;
                    }
                    segments[i].videoPrompt = finalPrompt;
                    console.log(`[Localize] Prompt [${i+1}/${segments.length}] ${promptResult.sceneType}: "${promptResult.videoPrompt.substring(0, 60)}..."`);
                } catch (pErr) {
                    console.warn(`[Localize] Prompt gen failed for segment ${i}:`, pErr.message);
                    segments[i].videoPrompt = '';
                }
            }
            // Save segments with prompts
            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));

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
                            imagePrompt: `Photorealistic portrait of ${speakers[i].description || speakers[i].name}, vertical 9:16 TikTok frame, professional lighting, sharp focus, 8k detail. Enhance image quality, reduce noise, fix flaws, allow slight improvements to non-essential details and color palette for a premium cinematic look.`,
                            bestFrameIndex: 1
                        });
                    }
                }
            }

            console.log(`[Localize] Step 3: Cleaning subtitles from ${(segments || []).length} scene frames via i2i...`);
            for (let i = 0; i < (segments || []).length; i++) {
                const seg = segments[i];
                const cleanRes = await ensureCleanSegmentImage(projectFolder, i, seg);
                if (sceneFrames && sceneFrames[i] && cleanRes) {
                    sceneFrames[i].cleanBase64 = cleanRes.base64;
                    sceneFrames[i].cleanUrl = cleanRes.url;
                    segments[i].cleanBase64 = cleanRes.base64;
                    segments[i].cleanUrl = cleanRes.url;
                    segments[i].sceneFrameBase64 = cleanRes.base64;
                    segments[i].sceneFrameUrl = cleanRes.url;
                }
            }
            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));

            // Map character avatars from cleaned scene frames
            for (let i = 0; i < characters.length; i++) {
                const speakerId = i + 1;
                const segIndex = (segments || []).findIndex(s => s.speakerId === speakerId);
                if (segIndex !== -1 && sceneFrames && sceneFrames[segIndex]) {
                    characters[i].generatedImageUrl = sceneFrames[segIndex].cleanBase64 || segments[segIndex].sceneFrameBase64;
                    characters[i].bestFrameUrl = sceneFrames[segIndex].cleanUrl || segments[segIndex].sceneFrameUrl;
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
    ipcMain.handle('localize-translate-segments', async (event, { projectFolder, segments, targetLanguage, provider }) => {
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
                        const maxWords = Math.min(21, Math.max(8, Math.round((seg.duration || 5) * 2.5)));
                        const msg = [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: `Translate and localize this dialogue line to ${langLabel} for a video clip of ${seg.duration || 5} seconds (maximum ${maxWords} words):\n\n"${seg.text}"\n\nRemember: Adapt and condense the phrase if necessary to stay under ${maxWords} words while forming a complete, natural sentence without cutting off.` }
                        ];
                        const raw = await ai.chat(msg, false, provider);
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

        // Sort by original order
        translated.sort((a, b) => a.index - b.index);

        // ── Swap only the lip-sync text in the existing video prompt ──
        // The visual description stays the same (same frames, same scene).
        // Only the spoken audio text changes to the translated version.
        for (const seg of translated) {
            if (seg.translatedText) {
                const maxWords = Math.min(21, Math.max(8, Math.round((seg.duration || 5) * 2.5)));
                const lipsyncText = await limitLipSyncText(seg.translatedText, maxWords, seg.duration || 5);
                seg.translatedText = lipsyncText;
                if (!seg.videoPrompt) continue;

                // Replace lip-sync/narration suffix patterns with the translated version
                let updatedPrompt = seg.videoPrompt;

                // Pattern: "Lip-sync: ...": replace the text inside quotes
                updatedPrompt = updatedPrompt.replace(
                    /Lip-sync:.*?"[^"]*"/,
                    `Lip-sync: the character's mouth precisely synchronizes with the spoken audio: "${lipsyncText}"`
                );
                // Pattern: "The animated character's mouth...": replace the text inside quotes
                updatedPrompt = updatedPrompt.replace(
                    /The animated character's mouth[^"]*"[^"]*"/,
                    `The animated character's mouth and face synchronize with the spoken audio: "${lipsyncText}"`
                );
                // Pattern: "Narration audio plays over..." — no text to replace, just keep it
                // (voiceover visual scenes don't have inline text, audio is separate)

                // If no pattern matched (old format or custom), append the translation note
                if (updatedPrompt === seg.videoPrompt && seg.sceneType !== 'voiceover_visual') {
                    updatedPrompt += ` [${langLabel} audio]: "${lipsyncText}"`;
                }

                seg.videoPrompt = updatedPrompt;
                seg.lipsyncText = lipsyncText;
            }
        }

        fs.writeFileSync(path.join(projectDir, langFile), JSON.stringify(translated, null, 2));
        console.log(`[Localize] Translated ${translated.length} segments to ${langLabel} (lip-sync text swapped in prompts)`);
        return translated;
    });
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-generate-metadata', async (event, { projectFolder, transcript, targetLanguage, originalTitle, provider }) => {
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
            const raw = await ai.chat([{ role: 'user', content: prompt }], true, provider);
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
    async function doGenerateSegmentVideo({ projectFolder, segmentIndex, segments, targetLanguage, characterImages, sceneFrames, characters, sceneDescription, speakerVoices, customPrompt, isMusicVideoMode, videoModel }) {
const projectDir = path.join(LOCALIZE_DIR, projectFolder);
        if (!fs.existsSync(projectDir)) throw new Error(`Project folder not found: ${projectFolder}`);

        const seg = segments[segmentIndex];
        if (!seg) throw new Error(`Segment ${segmentIndex} not found`);

        const isGerman = targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de';
        const langCode = isGerman ? 'de' : 'fr';
        const langLabel = isGerman ? 'German' : 'French';

        // In Music Video Mode, we MUST use the original text so the lip-sync matches the original song.
        const rawTranslatedText = isMusicVideoMode ? seg.text : (seg.translatedText || seg.text);
        // Limit lip-sync text: ~2.5 words/sec for clip duration (8s max → max 21 words for Omni Flash)
        const maxLipSyncWords = Math.min(21, Math.max(8, Math.round((seg.duration || 5) * 2.5)));
        const translatedText = await limitLipSyncText(rawTranslatedText, maxLipSyncWords, seg.duration || 5);
        console.log(`[Localize] Segment ${segmentIndex}: ${rawTranslatedText.split(' ').length} words → ${translatedText.split(' ').length} words lip-sync (MusicMode: ${isMusicVideoMode})`);
        
        let activeCustomPrompt = customPrompt;
        if (rawTranslatedText.trim() !== translatedText.trim()) {
            if (!isMusicVideoMode && seg.translatedText) {
                seg.translatedText = translatedText;
            } else if (!isMusicVideoMode) {
                seg.text = translatedText;
            }
            if (seg.videoPrompt && typeof seg.videoPrompt === 'string') {
                seg.videoPrompt = seg.videoPrompt
                    .replace(/Lip-sync:.*?"[^"]*"/, `Lip-sync: the character's mouth precisely synchronizes with the spoken audio: "${translatedText}"`)
                    .replace(/The animated character's mouth[^"]*"[^"]*"/, `The animated character's mouth and face synchronize with the spoken audio: "${translatedText}"`);
            }
            if (activeCustomPrompt && typeof activeCustomPrompt === 'string') {
                activeCustomPrompt = activeCustomPrompt
                    .replace(/Lip-sync:.*?"[^"]*"/, `Lip-sync: the character's mouth precisely synchronizes with the spoken audio: "${translatedText}"`)
                    .replace(/The animated character's mouth[^"]*"[^"]*"/, `The animated character's mouth and face synchronize with the spoken audio: "${translatedText}"`);
            }
        }

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

        // Step 1: Resolve video prompt — priority order:
        //   1. User's custom prompt (typed in the UI textarea)
        //   2. seg.videoPrompt generated automatically during Step 2 (from source frames)
        //   3. On-demand generation via generateVideoPromptForSegment (fallback only)
        let videoPrompt;
        let promptData = null;
        let sceneType = seg.sceneType || 'talking_head';
        let lipsyncApplies = seg.lipsyncApplies !== false;

        if (activeCustomPrompt) {
            // User manually edited the prompt — use as-is
            videoPrompt = activeCustomPrompt;
            promptData = { videoPrompt: activeCustomPrompt, sceneType, lipsyncApplies };
            console.log(`[Localize] Segment ${segmentIndex}: using user-edited custom prompt`);
        } else if (seg.videoPrompt) {
            // Step 2 already generated this prompt from source frames — reuse it.
            // The translate handler already swapped the lip-sync text, so just use it directly.
            videoPrompt = seg.videoPrompt;
            promptData = { videoPrompt, sceneType, lipsyncApplies, isAnimated: seg.isAnimated || false };
            console.log(`[Localize] Segment ${segmentIndex}: using pre-generated prompt from Step 2 [${sceneType}]`);
        } else {
            // Fallback: Step 2 prompt missing — generate now from disk frames
            console.log(`[Localize] Segment ${segmentIndex}: no pre-generated prompt, generating on-demand...`);
            let seqFrames = [];
            const segDir = path.join(projectDir, `screenshots_seg_${segmentIndex + 1}`);
            if (fs.existsSync(segDir)) {
                const jpgFiles = fs.readdirSync(segDir).filter(f => f.endsWith('.jpg')).sort();
                const step = Math.max(1, Math.ceil(jpgFiles.length / 5));
                const sampled = jpgFiles.filter((_, idx) => idx % step === 0).slice(0, 5);
                for (const fname of sampled) {
                    try {
                        const b64 = `data:image/jpeg;base64,${fs.readFileSync(path.join(segDir, fname), 'base64')}`;
                        seqFrames.push({ timestamp: fname, base64: b64 });
                    } catch {}
                }
            }
            if (seqFrames.length === 0 && sceneFrameBase64) {
                seqFrames = [{ base64: sceneFrameBase64 }];
            }
            promptData = await generateVideoPromptForSegment(
                seg, seqFrames, character, sceneDescription || '', translatedText
            );
            videoPrompt = promptData.videoPrompt;
            sceneType = promptData.sceneType || 'talking_head';
            lipsyncApplies = promptData.lipsyncApplies !== false;

            // Append scene-type-aware audio cue
            const clipDuration = Math.min(seg.duration || 5, 8);
            if (sceneType === 'voiceover_visual') {
                videoPrompt += ` Narration audio plays over this cinematic visual scene. The visual subject stays on screen for ${clipDuration} seconds with subtle camera movement. Clean frame, no text elements, vertical 9:16 format.`;
            } else if (sceneType === 'animated_character') {
                videoPrompt += ` The animated character's mouth and face synchronize with the spoken audio: "${translatedText}". Expressive facial animation, ${clipDuration} seconds, clean frame, no text elements, vertical 9:16 format.`;
            } else {
                videoPrompt += ` Lip-sync: the character's mouth precisely synchronizes with the spoken audio: "${translatedText}". Duration ${clipDuration} seconds. Clean frame, no text elements, vertical 9:16 format.`;
            }
        }

        // ── Inject consistent character voice & dynamic scene emotion specifications ──
        if (!videoPrompt.includes('Voice specification:') && !videoPrompt.includes('Scene emotion')) {
            let vpProfiles = {};
            const vpPath = path.join(projectDir, 'voice_profiles.json');
            if (fs.existsSync(vpPath)) {
                try {
                    vpProfiles = JSON.parse(fs.readFileSync(vpPath, 'utf8')).voiceProfiles || {};
                } catch (e) {}
            }
            const speakerNames = (seg.speakerName || '').split(' + ').map(s => s.trim());
            const voiceDirectives = [];
            for (let spId = 1; spId <= Math.max(2, (characters || []).length); spId++) {
                const charObj = (characters || [])[spId - 1];
                const sName = charObj?.name || `Speaker ${spId}`;
                const isPresent = speakerNames.some(n => n === sName || n === `S${spId}`) || (speakerNames.length === 1 && seg.speakerId === spId);
                if (isPresent || speakerNames.length > 1) {
                    const prof = vpProfiles[spId];
                    const gender = prof?.gender ? (prof.gender === 'male' ? 'male' : 'female') : (spId === 1 ? 'male' : 'female');
                    const timbre = prof?.timbre || 'medium';
                    const persona = prof?.vocalPersona || prof?.style || 'expressive';
                    voiceDirectives.push(`${sName}: signature ${gender} voice (${timbre} timbre, ${persona})`);
                }
            }

            const segEmotion = seg.emotion || promptData?.emotion || 'expressive';
            const segDelivery = seg.vocalDelivery || promptData?.vocalDelivery || 'natural dynamic intonation and emotional inflection';

            let voiceSection = '';
            if (voiceDirectives.length > 0) {
                voiceSection += ` Voice specification: ${voiceDirectives.join('; ')}. Maintain distinct character voice identities across all scenes.`;
            }
            voiceSection += ` Scene emotion & delivery: ${segEmotion} emotional tone, ${segDelivery}, with lively vocal inflections matching the dialogue and action.`;

            videoPrompt += voiceSection;
        }

        console.log(`[Localize] Segment ${segmentIndex} prompt resolved → [${sceneType}] "${videoPrompt.substring(0, 70)}..."`);

        // Step 2: Determine start_image — prefer clean scene frame, then character avatar, then original frame
        const cleanSceneFrameBase64 = sceneFrame?.cleanBase64 || null;
        let startImageBase64 = cleanSceneFrameBase64 || referenceImageBase64 || sceneFrameBase64;

        // Step 2.5: Extract original segment audio clip for audio-driven lipsync driver
        let referenceAudioBase64 = null;
        const sourceVideoPath = path.join(projectDir, 'source_video.mp4');
        if (fs.existsSync(sourceVideoPath) && typeof seg.startTime === 'number' && typeof seg.endTime === 'number') {
            try {
                const segAudioPath = path.join(projectDir, `seg_audio_${segmentIndex}.mp3`);
                const startTime = seg.startTime;
                const duration = Math.max(0.5, seg.endTime - seg.startTime);
                const { execSync } = require('child_process');
                execSync(`ffmpeg -ss ${startTime} -t ${duration} -i "${sourceVideoPath}" -vn -acodec libmp3lame -b:a 128k -y "${segAudioPath}"`, { stdio: 'ignore' });
                if (fs.existsSync(segAudioPath)) {
                    const audioBuffer = fs.readFileSync(segAudioPath);
                    referenceAudioBase64 = `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
                    console.log(`[Localize] Extracted segment ${segmentIndex} audio driver (${duration.toFixed(1)}s) for Omni Flash lipsync.`);
                }
            } catch (audErr) {
                console.warn(`[Localize] Segment audio extraction failed:`, audErr.message);
            }
        }

        // Step 3: Generate video with Omni Flash (with automatic 1-retry on API errors)
        let videoPath;
        const refImages = startImageBase64
            ? [{ data: startImageBase64.replace(/^data:image\/\w+;base64,/, '') }]
            : [];
        const videoArgs = {
            prompt: videoPrompt,
            model: videoModel || 'omni_flash',
            mode: refImages.length > 0 ? 'start_image' : 'text_to_video',
            aspectRatio: '9:16',
            resolution: '720p',
            sectionDir: LOCALIZE_DIR,
            subFolder: projectFolder,
            sceneIndex: `seg_${segmentIndex}_${langCode}`,
            referenceImages: refImages,
            referenceAudio: referenceAudioBase64,
            generateAudio: true
        };

        try {
            videoPath = await ai.generateVideo(videoArgs);
            console.log(`[Localize] Video generated with model: ${videoModel || 'omni_flash'}`);
        } catch (vidErr) {
            console.warn(`[Localize] Video generation failed for segment ${segmentIndex} (${vidErr.message}), retrying once in 3s...`);
            await new Promise(r => setTimeout(r, 3000));
            try {
                videoPath = await ai.generateVideo(videoArgs);
                console.log(`[Localize] Video generation succeeded on retry with model: ${videoModel || 'omni_flash'}`);
            } catch (retryErr) {
                console.error(`[Localize] Video generation retry failed for segment ${segmentIndex}:`, retryErr.message);
                throw retryErr;
            }
        }

        const result = {
            segmentIndex,
            videoUrl: `media:///${videoPath.replace(/\\/g, '/')}?t=${Date.now()}`,
            audioUrl: null, // Audio is embedded in the video via Omni Flash
            videoPrompt: videoPrompt, // Return the prompt used for UI display/editing
            promptData: promptData,   // Full prompt metadata
            translatedText: translatedText
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
    ipcMain.handle('localize-batch-generate-segments', async (event, { projectFolder, segments, targetLanguage, characterImages, sceneFrames, characters, sceneDescription, speakerVoices, isMusicVideoMode, videoModel }) => {
        const results = [];
        const langLabel = (targetLanguage === 'german' || targetLanguage === 'German' || targetLanguage === 'de') ? 'German' : 'French';

        console.log(`[Localize] Batch generating ${segments.length} ${langLabel} videos... (MusicMode: ${isMusicVideoMode})`);

        for (let i = 0; i < segments.length; i++) {
            try {
                const result = await doGenerateSegmentVideo({
                    projectFolder, segmentIndex: i, segments, targetLanguage, characterImages,
                    sceneFrames, characters, sceneDescription, speakerVoices, isMusicVideoMode, videoModel
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

        const prompt = (customPrompt || char.imagePrompt) + ' Single full-frame vertical 9:16 TikTok image, edge-to-edge full composition without any black bars or borders, photorealistic portrait, 8k detail, professional lighting. Enhance image quality, reduce noise, fix flaws, allow slight improvements to color palette for a premium cinematic look.';
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
            { role: 'user', content: `Translate and localize this dialogue line to ${langLabel} (strictly adapt and condense if necessary to fit naturally within 20-22 words max for an 8-second video clip without changing the actor's meaning; preserve appropriate gender speech traits):\n\n"${transcript}"` }
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
                execSync(`ffmpeg -ss ${t.toFixed(2)} -i "${tempVideoPath}" -frames:v 1 -pix_fmt yuvj420p -strict unofficial -q:v 4 "${framePath}" -y`, { stdio: 'pipe' });
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
        
        // --- GEMINI VIDEO ANALYSIS DISABLED PER USER REQUEST ---
        let geminiFileUri = null;
        let useGeminiVideo = false;
        const sourceVideoPath = path.join(projectDir, 'source_video.mp4');
        
        console.log('[Localize] Direct Gemini Video API disabled. Using local AI proxy with screenshots.');

        let batchedGeminiPrompts = [];
        if (useGeminiVideo && geminiFileUri) {
            try {
                console.log(`[Localize] Batch requesting video prompts for all ${segments.length} segments in ONE API call to save tokens and avoid 429...`);
                
                const segmentsData = segments.map((seg, i) => {
                    const charIndex = Math.max(0, (seg.speakerId || 1) - 1);
                    const character = (characters || [])[charIndex] || null;
                    return {
                        id: i,
                        startTime: seg.startTime || 0,
                        endTime: seg.endTime || ((seg.startTime || 0) + 5),
                        characterName: character?.name || 'Unknown',
                        dialogue: seg.translatedText || seg.text
                    };
                });
                
                const promptText = `Please act as a professional film director. Watch the uploaded video carefully. 
I have divided the video into ${segments.length} segments. 
For each segment, watch the specific timeframe and write a highly descriptive and technical video generation prompt (max 3 sentences) that recreates that exact visual scene.
IMPORTANT: You MUST include very subtle camera movements in the prompt (e.g., "very slow zoom in", "subtle tracking shot", "slight pan left", "gentle zoom out"). Make the motion cinematic but minimal.

Here are the segments:
${JSON.stringify(segmentsData, null, 2)}

Return ONLY valid JSON in this exact format:
{
  "prompts": [
    {
      "id": 0,
      "videoPrompt": "The detailed director's prompt...",
      "cameraAngle": "e.g., close-up, wide shot",
      "emotion": "e.g., angry, happy, neutral",
      "action": "e.g., speaking aggressively, smiling",
      "environmentDescription": "e.g., dimly lit office, sunny street"
    }
  ]
}`;
                const rawGeminiResponse = await ai.generateVideoPromptWithGemini(geminiFileUri, promptText);
                const parsed = safeParseJson(rawGeminiResponse, 'gemini batched video prompts');
                batchedGeminiPrompts = parsed.prompts || [];
                if (batchedGeminiPrompts.length === 0) throw new Error("No prompts generated");
                console.log(`[Localize] Successfully generated ${batchedGeminiPrompts.length} batched prompts from Gemini Video!`);
            } catch (err) {
                console.warn(`[Localize] Batched Gemini Video API failed (${err.message}). Falling back to screenshot proxy logic for all segments.`);
                useGeminiVideo = false;
            }
        }

        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            let translatedText = seg.translatedText || seg.text;
            const maxWords = Math.min(21, Math.max(8, Math.round((seg.duration || 5) * 2.5)));
            translatedText = await limitLipSyncText(translatedText, maxWords, seg.duration || 5);
            if (seg.translatedText && seg.translatedText.trim() !== translatedText.trim()) {
                seg.translatedText = translatedText;
            } else if (seg.text && seg.text.trim() !== translatedText.trim() && !seg.translatedText) {
                seg.text = translatedText;
            }
            const charIndex = Math.max(0, (seg.speakerId || 1) - 1);
            const character = (characters || [])[charIndex] || null;
            const sceneFrameBase64 = seg.sceneFrameBase64 || null;

            try {
                let promptData = null;
                
                if (useGeminiVideo && geminiFileUri) {
                    const batched = batchedGeminiPrompts.find(p => p.id === i);
                    if (batched) {
                        promptData = { ...batched, duration: seg.duration || 5 };
                        delete promptData.id;
                    } else {
                        console.warn(`[Localize] Segment ${i} missing from batched response, falling back to screenshot proxy...`);
                    }
                }

                if (!promptData) {
                    promptData = await generateVideoPromptForSegment(
                        seg, seg.sequenceFrames || [], character, sceneDescription || '', translatedText
                    );
                }

                prompts.push({
                    segmentIndex: i,
                    ...promptData,
                    translatedText: translatedText,
                    status: 'generated'
                });
                console.log(`[Localize] Prompt ${i + 1}/${segments.length} generated${useGeminiVideo ? ' (Gemini Video)' : ''}`);
            } catch (e) {
                console.error(`[Localize] Prompt generation failed for segment ${i}:`, e.message);
                prompts.push({
                    segmentIndex: i,
                    videoPrompt: `${seg.speakerName || 'Character'} speaking to camera. DIALOGUE: "${translatedText}". Vertical 9:16, professional lighting. Very subtle camera movement (e.g. slow zoom in, slight pan).`,
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

    // ═══════════════════════════════════════════════════════════════════════════
    // Handler: Re-merge segments in an existing project (≤9s grouped, capped to 8s)
    // ═══════════════════════════════════════════════════════════════════════════
    ipcMain.handle('localize-remerge-project', async (event, { projectFolder }) => {
        try {
            const projectDir = path.join(LOCALIZE_DIR, projectFolder);
            console.log(`[Localize] Re-merging segments for project ${projectFolder}...`);
            
            let timeline = [];
            let speakers = [];
            const stPath = path.join(projectDir, 'speaker_timeline.json');
            if (fs.existsSync(stPath)) {
                const data = JSON.parse(fs.readFileSync(stPath, 'utf8'));
                timeline = data.timeline || [];
                speakers = data.speakers || [];
            } else {
                const segPath = path.join(projectDir, 'dialogue_segments.json');
                if (fs.existsSync(segPath)) {
                    const existingSegs = JSON.parse(fs.readFileSync(segPath, 'utf8'));
                    timeline = existingSegs.map(s => ({
                        start: s.startTime,
                        end: s.endTime,
                        speakerId: s.speakerId,
                        text: s.text
                    }));
                }
            }

            if (timeline.length === 0) throw new Error('No timeline or segment data found in project');

            console.log('[Localize] Re-running splitIntoSegments with new ≤9s speech duration rules...');
            const rawSegments = splitIntoSegments(timeline, speakers);
            console.log('[Localize] Re-running smartMergeSegments...');
            const segments = await smartMergeSegments(rawSegments);

            // Re-extract scene start frames if source video is available
            const videoPath = path.join(projectDir, 'source_video.mp4');
            let sceneFrames = [];
            if (fs.existsSync(videoPath)) {
                console.log('[Localize] Re-extracting scene frames for newly merged segments...');
                sceneFrames = extractSegmentSceneFrames(videoPath, segments, projectDir);
                for (let i = 0; i < segments.length; i++) {
                    const seq = sceneFrames[i]?.sequence || [];
                    segments[i].sequenceFrames = seq;
                    const bestFrame = await findBestRepresentativeFrame(seq, segments[i].duration || 5);
                    segments[i].sceneFrameUrl = bestFrame?.url || null;
                    segments[i].sceneFrameBase64 = bestFrame?.base64 || null;
                }
                fs.writeFileSync(path.join(projectDir, 'scene_frames.json'), JSON.stringify(sceneFrames, null, 2));
            }

            fs.writeFileSync(path.join(projectDir, 'dialogue_segments.json'), JSON.stringify(segments, null, 2));
            console.log(`[Localize] Re-merge successful! Now ${segments.length} cohesive scenes.`);
            return { segments, sceneFrames };
        } catch (err) {
            console.error('[Localize] Re-merge failed:', err.message);
            throw err;
        }
    });

}

module.exports = { registerLocalizeHandlers };
