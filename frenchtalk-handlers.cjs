const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const historyManager = require('./history-manager.cjs');
const ai = require('./ai-client.cjs');

const FRENCHTALK_DIR = path.join(__dirname, 'FrenchTalk');
const BLOGGER_FILE = path.join(FRENCHTALK_DIR, 'blogger.json');

// Fixed voice ID for the blogger girl — always consistent across all videos
const BLOGGER_VOICE_DESCRIPTION = 'young French woman, bright cheerful energetic voice, slightly cheeky and playful tone, fast-paced millennial speech';

// ─── CTA (Call-To-Action) PHRASE BANK ───────────────────────────────────────
// Inspired by Cinema World Builder's Dialogue Engine — each CTA has a distinct
// emotional "voice" so the blogger never repeats the same energy twice.
// Categories: sassy, flirty, dramatic, wholesome, savage, conspiratorial, daring
//
// Each generation picks a random STYLE + random EXAMPLES so the AI always
// invents something fresh and tonally varied.
const CTA_STYLES = [
    { mood: 'sassy',          direction: 'Sarcastic queen energy — eye-roll, hand on hip, "I know I\'m good" attitude' },
    { mood: 'flirty',         direction: 'Playful wink, blown kiss, talking like she\'s flirting with the viewer' },
    { mood: 'dramatic',       direction: 'Over-the-top theatrical gasp, fake shock that the viewer hasn\'t subscribed yet' },
    { mood: 'wholesome',      direction: 'Genuine warm smile, soft voice, like thanking a close friend' },
    { mood: 'savage',         direction: 'Roast-comedy energy, mock-threatening, "don\'t test me" vibe' },
    { mood: 'conspiratorial', direction: 'Whisper-lean-in, like sharing a secret — "just between us"' },
    { mood: 'daring',         direction: 'Challenge/dare energy — "I bet you won\'t", competitive smirk' },
    { mood: 'chaotic',        direction: 'Rapid-fire meme energy, unexpected, breaks the fourth wall hard' },
];

const CTA_EXAMPLES = [
    // French — sassy/flirty
    "Je te plais ? Alors abonne-toi, c'est gratuit !",
    "T'as kiffé ? Lâche un like, sois pas radin !",
    "Si t'es encore là, c'est que tu m'aimes. Abonne-toi !",
    "Un petit like ? Allez, fais pas ton timide !",
    "Abonne-toi ou je viens te poser des questions aussi !",
    "T'as souri ? Alors c'est un like obligatoire !",
    "Clique sur s'abonner, promis je mords pas... enfin presque !",
    "Reste pas planté là — like et abonne-toi !",
    // French — dramatic/savage
    "J'ai fait tout ça et t'as même pas liké ? Sérieux ?!",
    "Dernière chance de t'abonner avant que je disparaisse !",
    "Tu veux la suite ? Tu sais ce qu'il te reste à faire...",
    "Like ou je te retrouve dans la rue et je te pose LA question !",
    // English — sassy/flirty
    "Like what you see? Smash that subscribe button!",
    "Still watching? Hit like, you know you want to!",
    "Subscribe or I'm asking YOU next time!",
    "Don't be shy — like, subscribe, you know the drill!",
    "If this made you laugh, that like button is RIGHT there!",
    "One tap to subscribe. Do it. I dare you!",
    "You scrolled this far — might as well subscribe!",
    // English — dramatic/conspiratorial
    "Between you and me... that subscribe button looks lonely.",
    "Plot twist: you subscribe and your life gets 10% more fun!",
    "I see you watching without subscribing. I SEE you.",
    "The algorithm rewards the bold. Subscribe. Be bold.",
    // Russian — sassy/flirty
    "Я тебе нравлюсь? Тогда с тебя подписка и лайк!",
    "Тебе зашло? Не жмись — подпишись!",
    "Палец вверх, подписка — и мы друзья навек!",
    "Лайкни, если досмотрел — я знаю, ты досмотрел!",
    "Подписался? Нет?! Ну ты даёшь...",
    "Жми лайк, пока я не передумала быть милой!",
    // Russian — dramatic/savage/daring
    "Спорим, ты не подпишешься? Слабо?!",
    "Я тут стараюсь, а ты даже лайк зажал? Ну и кто из нас жадина?",
    "Подписка — бесплатно, а удовольствие — бесценно!",
    "Если ты досюда долистал — мы уже практически встречаемся. Подпишись!",
    "Лайк — это как комплимент, только в интернете. Не жадничай!",
    "Я жду. Да, именно тебя. Кнопка подписки. Жми.",
];

// Default stranger voice when none is specified
const DEFAULT_STRANGER_VOICE_DESCRIPTION = 'authentic French person on the street, natural conversational voice, slightly surprised tone';

if (!fs.existsSync(FRENCHTALK_DIR)) fs.mkdirSync(FRENCHTALK_DIR, { recursive: true });
if (!fs.existsSync(path.join(FRENCHTALK_DIR, 'BloggerImages'))) fs.mkdirSync(path.join(FRENCHTALK_DIR, 'BloggerImages'), { recursive: true });

function getBlogger() {
    if (fs.existsSync(BLOGGER_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(BLOGGER_FILE, 'utf8'));
        } catch (e) {
            console.error('[FrenchTalk] Error reading blogger.json:', e);
            return null;
        }
    }
    return null;
}

function saveBlogger(blogger) {
    fs.writeFileSync(BLOGGER_FILE, JSON.stringify(blogger, null, 2));
}

function getEmotionFromText(text) {
    const t = text.toLowerCase();
    if (t.includes('ха-ха') || t.includes('haha') || t.includes('lol') || t.includes('😂') || t.includes('hehe')) {
        return 'laughing warmly, bright amused smile, giggling while speaking';
    }
    if (t.includes('?!') || t.includes('!!!')) {
        return 'dramatically shocked, eyes wide open, hand over mouth';
    }
    if (t.includes('?')) {
        return 'curious and inquisitive, head slightly tilted, one eyebrow raised';
    }
    if (t.includes('!')) {
        return 'enthusiastic, expressive hand gesture, passionate delivery';
    }
    if (t.includes('...') || t.includes('—') || t.includes('–')) {
        return 'thoughtful pause, choosing words carefully, slight squint';
    }
    return 'natural conversational expression, relaxed and engaged';
}

// ─── CINEMATIC VIDEO PROMPT BUILDER ────────────────────────────────────────
// Each role has distinct camera angle, staging, and cinematography rules.
//
// ROLES:
//   hook     — blogger speaks directly to camera BEFORE approaching stranger
//   blogger  — blogger addresses the stranger mid-interview (2-shot, 45°)
//   stranger — stranger responds to blogger (2-shot, 45°, camera on stranger)
//   aside    — blogger steps away and reacts to camera (ECU, cheeky smirk)
//
function buildVideoPrompt({ role, isHook, dialogueText, bloggerName, bloggerVisual, bloggerVoice,
    bloggerOutfit, strangerDescription, strangerVoice, location, emotion, streetNoiseSuffix }) {

    // @anchor tag helps Omni Flash keep blogger identity consistent across all clips
    const bloggerAnchor = `@${bloggerName.replace(/\s+/g, '')}`;

    // Split visual prompt from outfit so model gets them as separate pinned attributes
    const baseAppearance = bloggerVisual || `young beautiful French woman blogger, ${bloggerName}`;
    const outfitLine = bloggerOutfit
        ? `OUTFIT (must stay exactly the same in every shot): ${bloggerOutfit}.`
        : `OUTFIT: match exactly what she wears in the reference photo — do not invent, add, or change any clothing item.`;

    // One specific mic model everywhere — Rode Wireless GO II on an Interview GO handle (very recognisable, matte-grey capsule)
    const micDetail = `Holding a matte-grey Rode Wireless GO II microphone on a short black Interview GO handle grip.`;

    const strangerDesc = strangerDescription || 'a random Parisian person on the street';

    // Pinned blogger identity block — repeated in every prompt so model cannot drift
    const bloggerPin = `CHARACTER: ${bloggerAnchor} — ${baseAppearance}.
${outfitLine}
MIC: ${micDetail}`;

    // ─── OUTRO: Director Mode — randomized camera staging ───────────────
    // Inspired by Cinema World Builder's Shot Designer + Director Mode.
    // Each outro gets a different cinematic feel so the channel never looks repetitive.
    if (role === 'outro') {
        const outroStyles = [
            { // Classic hero angle push-in
                shot: `Medium close-up MCU on ${bloggerName}, slightly tilted angle from below (hero angle).`,
                staging: `Direct eye contact with the camera lens. Warm confident smile, playful wink or blown kiss at the end. She points at the camera or makes a heart gesture with her hands. She holds her Rode Wireless GO II mic casually at her side. Blurred Paris street behind her.`,
                camera: `handheld shot. Medium close-up MCU on ${bloggerName}. Direct eye contact with the camera. Warm confident smile, playful energy, pointing at camera. Movement: hold the camera at human operator height with natural body movement, slight push-in toward the subject. Speed: responsive and organic. End: finish closer to the subject with a warm inviting composition.`,
                lighting: `Natural golden hour daylight, warm and flattering. Soft backlight glow.`,
                mood: `Flirty, confident, warm — directly addressing the viewer as if talking to a friend.`
            },
            { // Walk-away-turn-back (dramatic farewell)
                shot: `Medium shot MS on ${bloggerName} walking away from camera, then turning back over her shoulder.`,
                staging: `She walks a few steps away, then spins back with a cheeky grin and points at the camera. She holds her Rode Wireless GO II mic loosely at her side. Golden Paris light behind her. Playful "catch you later" energy.`,
                camera: `static shot. Medium shot MS. ${bloggerName} walks away then turns back toward camera. Movement: camera stays still, subject moves. Speed: natural walking pace. End: she faces camera again with a confident pose.`,
                lighting: `Warm backlit golden hour, silhouette rim light on hair and shoulders.`,
                mood: `Playful farewell energy — "I'm leaving but you'll miss me" attitude.`
            },
            { // Extreme close-up whisper (conspiratorial)
                shot: `Extreme close-up ECU on ${bloggerName}'s face, eyes and lips filling the frame.`,
                staging: `She leans in close to the camera lens like sharing a secret. Mischievous half-smile, eyes sparkling. She whispers the CTA. Rode Wireless GO II mic held near her chin. Shallow depth of field, background completely blurred.`,
                camera: `handheld shot. Extreme close-up ECU. She leans toward the lens conspiratorially. Movement: subtle drift closer. Speed: slow, intimate. End: her face fills 80% of the frame.`,
                lighting: `Soft diffused natural light, warm skin tones, bokeh background.`,
                mood: `Intimate, conspiratorial whisper — like she's telling only YOU a secret.`
            },
            { // Spinning/twirl celebration
                shot: `Medium shot MS on ${bloggerName}, full upper body visible.`,
                staging: `She does a playful spin or twirl on the spot, then stops facing camera with a radiant smile and finger guns or peace signs. Rode Wireless GO II mic in one hand. Energetic, celebratory, end-of-show vibes. Paris street alive behind her.`,
                camera: `orbit shot. Slow arc around ${bloggerName} as she twirls. Movement: camera orbits 90 degrees around subject during the spin. Speed: smooth and cinematic. End: front-facing composition with subject centered.`,
                lighting: `Bright natural daylight, vivid colors, high energy.`,
                mood: `Celebratory, high-energy, triumphant — like dropping the mic after a great show.`
            },
            { // Lean on wall (cool casual)
                shot: `Medium close-up MCU on ${bloggerName} leaning casually against a Parisian wall or lamppost.`,
                staging: `She leans back with one foot against the wall, relaxed and cool. Arms crossed or one hand on hip, Rode Wireless GO II mic dangling casually. She looks at camera with a slow confident smile. Classic Parisian nonchalance.`,
                camera: `static shot with subtle handheld sway. Medium close-up MCU. Movement: minimal, just natural handheld breathing. Speed: calm. End: hold the cool composed framing.`,
                lighting: `Soft afternoon shade, even flattering light, muted warm tones.`,
                mood: `Cool, effortless, unbothered — "I don't need to try, I'm already iconic" energy.`
            },
            { // Dutch angle dramatic
                shot: `Medium close-up MCU on ${bloggerName}, Dutch angle (15° tilt), dramatic composition.`,
                staging: `Direct eye contact with camera. One eyebrow raised, sly smirk. She slowly raises her Rode Wireless GO II mic like a trophy. Dynamic diagonal composition against Paris skyline. Bold, provocative, slightly theatrical.`,
                camera: `handheld shot with intentional Dutch angle tilt. Movement: slow straightening from tilted to level during the line. Speed: deliberate, cinematic. End: camera levels out as she delivers the final word.`,
                lighting: `Dramatic side-lighting, strong contrast, cinematic shadows.`,
                mood: `Dramatic, theatrical, boss energy — like ending a movie trailer.`
            },
        ];

        const style = outroStyles[Math.floor(Math.random() * outroStyles.length)];

        return `Vertical TikTok street video, 9:16 portrait.
${bloggerPin}
SHOT: ${style.shot}
STAGING: ${style.staging}
${style.camera}
LIGHTING: ${style.lighting}
She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: ${style.mood} Playful call-to-action energy.
${streetNoiseSuffix}
Cinematic 4K. 9:16 portrait. No text overlay. No subtitles.`;
    }

    if (role === 'aside') {
        return `Vertical TikTok street video, 9:16 portrait.
${bloggerPin}
SHOT: Extreme close-up ECU on ${bloggerName}'s face only.
STAGING: Direct eye contact with the camera lens. Mischievous cheeky smirk, one eyebrow raised. Subtle suppressed laugh. She holds her Rode Wireless GO II mic near her chest.
handheld shot. Extreme close-up ECU on ${bloggerName}'s face only. Direct eye contact with the camera lens. Mischievous cheeky smirk, one eyebrow raised. Subtle suppressed laugh. She holds her Rode Wireless GO II mic near her chest. Movement: hold the camera at human operator height with natural body movement. Speed: responsive and organic. Framing: keep the subject readable while the frame has subtle sway and micro-adjustments. End: finish with a natural handheld composition.
LIGHTING: Natural daylight, soft and flattering.
She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: Sarcastic, witty, playful — sharing a private joke with the viewer.
${streetNoiseSuffix}
Cinematic 4K. 9:16 portrait. No text overlay. No subtitles.`;
    }

    if (role === 'blogger' && isHook) {
        return `Vertical TikTok street video, 9:16 portrait.
${bloggerPin}
SHOT: Medium close-up MCU on ${bloggerName}.
STAGING: Direct address to camera. Energetic, conspiratorial lean-in. She holds her Rode Wireless GO II mic up clearly. Busy Paris street behind her.
reverse tracking shot. Direct address to camera. Energetic, conspiratorial lean-in. She holds her Rode Wireless GO II mic up clearly. Busy Paris street behind her. Movement: move backward in front of the walking subject. Speed: match the subject's forward pace. Framing: keep front-facing face and body framing stable as the background moves behind them. End: hold a clear front-facing moving composition.
LIGHTING: Natural Paris daylight. Warm authentic tones.
She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: Cheeky, provocative, excited.
${streetNoiseSuffix}
Cinematic 4K. 9:16 portrait. No text overlay. No subtitles.`;
    }

    if (role === 'blogger') {
        return `Vertical TikTok street video, 9:16 portrait.
${bloggerPin}
SHOT: Medium close-up MCU on ${bloggerName}. Clean single shot.
STAGING: ${bloggerName} is looking slightly off-camera (screen-right) addressing the stranger. She holds her Rode Wireless GO II mic in her hand. Do NOT show the stranger in this shot.
arc right. ${bloggerName} is looking slightly off-camera (screen-right) addressing the stranger. She holds her Rode Wireless GO II mic in her hand. Do NOT show the stranger in this shot. Movement: move on a shallow curved path around the main subject toward the right side. Speed: smooth measured curve. Framing: keep distance, height and subject readability consistent while the angle changes. End: finish from a new right-side angle.
LIGHTING: Natural Paris street lighting.
She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: Curious, slightly provocative smile.
${streetNoiseSuffix}
Cinematic 4K. 9:16 portrait. No text overlay. No subtitles.`;
    }

    if (role === 'stranger') {
        // Find if blogger outfit describes sleeves/jacket
        const bloggerLowerOutfit = (bloggerOutfit || '').toLowerCase();
        const hasSleeves = bloggerLowerOutfit.includes('jacket') ||
                           bloggerLowerOutfit.includes('coat') ||
                           bloggerLowerOutfit.includes('long sleeve') ||
                           bloggerLowerOutfit.includes('sweater') ||
                           bloggerLowerOutfit.includes('hoodie');

        const armDescription = hasSleeves
            ? "A woman's arm (wearing the sleeve described in her outfit) holding a matte-grey Rode Wireless GO II on a short black handle grip"
            : "A woman's bare arm and hand holding a matte-grey Rode Wireless GO II on a short black handle grip";

        return `Vertical TikTok street video, 9:16 portrait.
STRANGER: ${strangerDesc}.
SHOT: Medium close-up MCU on the stranger's face. Clean single shot.
STAGING: The stranger is looking slightly off-camera (screen-left) answering the question. ${armDescription} enters the frame from the left edge, pointed at the stranger's mouth. Do NOT show the blogger's face in this shot. IMPORTANT: The arm holding the microphone MUST perfectly match the blogger's outfit details (sleeveless vs sleeves).
handheld shot. The stranger is looking slightly off-camera (screen-left) answering the question. ${armDescription} enters the frame from the left edge. Movement: hold the camera at human operator height with natural body movement. Speed: responsive and organic. Framing: keep the subject readable while the frame has subtle sway and micro-adjustments. End: finish with a natural handheld composition.
LIGHTING: Natural daylight, authentic street atmosphere.
They say: "${dialogueText}"
Voice: ${strangerVoice}
MOOD: ${emotion} — authentic, slightly caught off-guard.
${streetNoiseSuffix}
Cinematic 4K. 9:16 portrait. No text overlay. No subtitles.`;
    }

    // Fallback
    return `Vertical TikTok street video, 9:16 portrait. ${dialogueText}. ${streetNoiseSuffix} Cinematic 4K. No text overlay.`;
}

function saveEpisodePromptsMetadata(episodeDir, episodeTitle, newPrompt) {
    const jsonPath = path.join(episodeDir, 'prompts.json');
    const txtPath = path.join(episodeDir, 'prompts.txt');

    let promptsData = {};
    if (fs.existsSync(jsonPath)) {
        try {
            promptsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        } catch (e) {
            console.error('[FrenchTalk] Error reading prompts.json:', e);
        }
    }

    promptsData[newPrompt.segmentIndex] = {
        segmentIndex: newPrompt.segmentIndex,
        role: newPrompt.role,
        speakerName: newPrompt.speakerName,
        dialogueText: newPrompt.dialogueText,
        videoPrompt: newPrompt.videoPrompt,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(jsonPath, JSON.stringify(promptsData, null, 2), 'utf8');

    const sortedIndices = Object.keys(promptsData).map(Number).sort((a, b) => a - b);
    let txtContent = `========================================================================\n`;
    txtContent += `FRENCHTALK GENERATION PROMPTS\n`;
    txtContent += `Episode: ${episodeTitle}\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += `========================================================================\n\n`;

    for (const idx of sortedIndices) {
        const p = promptsData[idx];
        const roleLabel = p.role === 'outro' ? '🎬 OUTRO (CTA to viewers)' : p.role === 'aside' ? '💬 ASIDE (blogger to camera)' : p.role === 'blogger' ? '🎤 BLOGGER question' : '🗣️ STRANGER reply';
        txtContent += `🎬 Scene #${p.segmentIndex + 1} — ${roleLabel}\n`;
        txtContent += `------------------------------------------------------------------------\n`;
        txtContent += `🗣 Says: "${p.dialogueText}"\n\n`;
        txtContent += `📝 Video Prompt:\n${p.videoPrompt}\n`;
        txtContent += `------------------------------------------------------------------------\n\n`;
    }

    fs.writeFileSync(txtPath, txtContent, 'utf8');
}

async function ensureImageAspectRatio(inputPath, targetAspectRatio, outputPath) {
    if (!fs.existsSync(inputPath)) throw new Error(`Input image does not exist: ${inputPath}`);
    try {
        const metadata = await sharp(inputPath).metadata();
        const { width: originalWidth, height: originalHeight } = metadata;
        if (!originalWidth || !originalHeight) return inputPath;

        const currentRatio = originalWidth / originalHeight;
        const targetRatioVal = targetAspectRatio === '9:16' ? 9 / 16 : 16 / 9;

        if (Math.abs(currentRatio - targetRatioVal) < 0.05) return inputPath;

        let newWidth, newHeight;
        if (targetAspectRatio === '9:16') {
            newWidth = Math.round(originalHeight * 9 / 16);
            newHeight = originalHeight;
            if (newWidth > originalWidth) { newWidth = originalWidth; newHeight = Math.round(originalWidth * 16 / 9); }
        } else {
            newWidth = originalWidth;
            newHeight = Math.round(originalWidth * 9 / 16);
            if (newHeight > originalHeight) { newHeight = originalHeight; newWidth = Math.round(originalHeight * 16 / 9); }
        }

        await sharp(inputPath).resize(newWidth, newHeight, { fit: 'cover', position: 'center' }).toFile(outputPath);
        return outputPath;
    } catch (err) {
        console.error(`[FrenchTalk] Error resizing image:`, err);
        return inputPath;
    }
}

// Simple DuckDuckGo HTML search
async function searchWeb(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept-Language': 'fr,en-US;q=0.9,en;q=0.8'
            }
        });
        if (!response.ok) throw new Error(`DDG returned status ${response.status}`);
        const html = await response.text();
        const snippetMatches = html.matchAll(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
        const snippets = [];
        for (const match of snippetMatches) {
            const clean = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (clean) snippets.push(clean);
        }
        return snippets.slice(0, 5).join('\n\n');
    } catch (e) {
        console.error('[FrenchTalk Search] DDG search failed:', e.message);
        return '';
    }
}

function registerFrenchTalkHandlers(ipcMain) {

    // 1. Generate Blogger Profile idea
    ipcMain.handle('frenchtalk-generate-blogger-idea', async (event, { promptText, provider }) => {
        const systemPrompt = `You are an AI character designer for a TikTok street interview show filmed in Paris, France.
The user will describe a young female blogger character idea.
Generate a detailed visual prompt for G-Labs image generation (aspect ratio 9:16, portrait), and a personality profile.
The blogger always has ONE consistent voice across ALL videos — do not change it.
Return ONLY valid JSON:
{
    "name": "Character Name",
    "visualPrompt": "A highly detailed, photorealistic portrait of a young beautiful French woman blogger, 22-26 years old, [specific appearance details from user description], holding a microphone or smartphone, vibrant Paris street background, golden hour lighting, 9:16 portrait aspect ratio, cinematic quality",
    "voiceDescription": "${BLOGGER_VOICE_DESCRIPTION}",
    "personality": "Cheeky, witty, charming, slightly provocative — classic Parisian millennial street reporter vibe",
    "outfitBase": "[describe exactly what she wears — specific colors and garments only. Do NOT add any outerwear, coats, or jackets unless explicitly described by the user]"
}`;

        try {
            const rawOutput = await ai.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: promptText }
            ], true, provider);

            let jsonStr = rawOutput.trim();
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (!match) throw new Error('No JSON found in response: ' + rawOutput);
            return JSON.parse(match[0]);
        } catch (err) {
            console.error('[FrenchTalk] Blogger idea generation failed:', err);
            throw err;
        }
    });

    // 2. Generate Base Image for Blogger
    ipcMain.handle('frenchtalk-generate-base-image', async (event, { visualPrompt, model }) => {
        const imageModel = model || 'nano_banana_2';
        const imagePaths = await ai.generateImage({
            prompt: visualPrompt,
            model: imageModel,
            aspectRatio: '9:16',
            sectionDir: FRENCHTALK_DIR,
            subFolder: 'BloggerImages',
            sceneIndex: `blogger_base_${Date.now()}`
        });

        const imagePath = imagePaths[0];
        const base64 = fs.readFileSync(imagePath, 'base64');
        return { imagePath, base64: `data:image/jpeg;base64,${base64}` };
    });

    // 3. Save Blogger
    ipcMain.handle('frenchtalk-save-blogger', async (event, bloggerData) => {
        bloggerData.id = Date.now().toString();
        bloggerData.voiceDescription = BLOGGER_VOICE_DESCRIPTION; // Always enforce fixed voice
        saveBlogger(bloggerData);
        return bloggerData;
    });

    // 4. Get Blogger
    ipcMain.handle('frenchtalk-get-blogger', async () => {
        const blogger = getBlogger();
        if (!blogger) return null;
        if (blogger.imagePath && fs.existsSync(blogger.imagePath)) {
            blogger.base64 = `data:image/jpeg;base64,${fs.readFileSync(blogger.imagePath, 'base64')}`;
        }
        return blogger;
    });

    // 5. Delete Blogger
    ipcMain.handle('frenchtalk-delete-blogger', async () => {
        if (fs.existsSync(BLOGGER_FILE)) fs.unlinkSync(BLOGGER_FILE);
        return null;
    });

    // 6. Get SEO Keywords for TikTok France
    ipcMain.handle('frenchtalk-get-seo-keywords', async (event, { language, country }) => {
        console.log(`[FrenchTalk SEO] Fetching keywords for lang=${language} country=${country}`);
        try {
            event.sender.send('frenchtalk-progress', { status: `🔎 Ищу популярные темы TikTok во Франции...`, progress: 10 });

            const searchQuery = `Most searched TikTok viral questions street interview France ${language} this week`;
            let searchResults = '';
            try { searchResults = await searchWeb(searchQuery); } catch (e) { console.warn('[FrenchTalk SEO] Web search failed', e.message); }

            event.sender.send('frenchtalk-progress', { status: '🤖 Анализирую тренды...', progress: 50 });

            const prompt = `You are an expert TikTok content strategist for ${country}.
Based on recent search trends:
${searchResults}

Identify the top 5-10 MOST ENGAGING street interview questions that a young female blogger could ask random people in ${country}.
These should be funny, provocative, or surprising questions that spark interesting reactions.
They MUST be in ${language}.
Topics: money, relationships, social media, lifestyle, embarrassing moments, opinions on French culture, love, ambitions.

Output ONLY a raw JSON array of objects (no markdown, no other text).
Each object has "original" (question in ${language}) and "ru" (Russian translation).
Example: [{"original": "question in ${language}", "ru": "вопрос на русском"}]`;

            const rawJson = await ai.chat([{ role: 'user', content: prompt }], true);
            const match = rawJson.match(/\[[\s\S]*\]/);
            if (!match) throw new Error('Failed to parse SEO keywords JSON: ' + rawJson);

            const keywords = JSON.parse(match[0]);
            if (!Array.isArray(keywords)) throw new Error('Result is not an array');
            return keywords.slice(0, 10);
        } catch (e) {
            console.error('[FrenchTalk SEO] Error:', e);
            throw e;
        }
    });

    // 6а. Generate a unique extravagant Parisian stranger character
    ipcMain.handle('frenchtalk-generate-stranger', async (event, { language = 'French', exclude = [] } = {}) => {
        const excludeList = exclude.length > 0 ? `\nDO NOT repeat these already-used character concepts: ${exclude.join(', ')}` : '';

        const prompt = `You are an imaginative casting director for a viral TikTok street interview show filmed in Paris.

Invent ONE completely original, visually stunning Parisian character — someone you might actually encounter on a Paris street but who immediately makes you grab your phone to film them.

FREEDOM: You decide EVERYTHING — age (18 to 80+), gender, ethnicity, subculture, era, energy. No constraints. Be surprising. Be bold.
The character must be EXTRAVAGANT and MEMORABLE: wild or unusual look, distinctive style, something that stops scrollers.
They are a real person, not a caricature — but they dress and carry themselves in a way that is impossible to ignore.

Examples of the KIND of freedom you have (do NOT copy these, invent something new):
- A Senegalese-French retired jazz musician, 74, in a white velvet zoot suit and cobalt fedora
- A non-binary Gen-Z skateboarder with a half-shaved lavender head and a vintage Hermès scarf
- A tiny fierce Romanian grandmother in head-to-toe leopard print with six gold chains
- A young Algerian architect in a saffron suit and combat boots, always laughing
- An eccentric 50s-obsessed man of any age in a full rockabilly look, tattoos everywhere
${excludeList}

Output ONLY valid JSON (no markdown, no commentary):
{
  "nameHint": "A poetic label for this character in French or mixed French/English, e.g. 'Le Jazz Fantôme' or 'La Tigresse Dorée'",
  "gender": "Male, Female, or Non-binary",
  "description": "Vivid, photorealistic image-generation prompt. Include: exact age range, gender presentation, skin tone, hair (color, texture, cut), face features, complete outfit with colors and textures, accessories, body language. 70-110 words. Make it so specific an AI can paint them.",
  "voice": "Voice description for TTS/video prompt: pitch, speed, accent, tone, emotional quality. 15-25 words.",
  "personality": "One punchy sentence: how this person reacts when a blogger shoves a mic in their face — their energy, attitude, first expression."
}`;

        const raw = await ai.chat([{ role: 'user', content: prompt }], true);
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Failed to parse stranger JSON: ' + raw.substring(0, 200));
        return JSON.parse(match[0]);
    });

    // 6б. Reset stranger reference images for a given episode (new episode = new character)
    ipcMain.handle('frenchtalk-reset-stranger-ref', async (event, { episodeTitle }) => {
        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : null;
        if (!folderName) return { success: true };

        const imagesDir = path.join(FRENCHTALK_DIR, folderName, 'images');
        const filesToDelete = [
            path.join(imagesDir, 'stranger_frame.jpg'),
            path.join(imagesDir, 'stranger_reference_9_16.jpg'),
            path.join(imagesDir, 'stranger_reference_16_9.jpg'),
        ];
        for (const f of filesToDelete) {
            try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
        }
        console.log(`[FrenchTalk] Stranger ref reset for episode: ${folderName}`);
        return { success: true };
    });


    ipcMain.handle('frenchtalk-auto-topic', async (event, { language, country, bloggerName, strangerType, mode = 'trending', customInput = '', shortVersion = false }) => {
        console.log(`[FrenchTalk AutoTopic] lang=${language} country=${country} mode=${mode} shortVersion=${shortVersion}`);

        let topicData = null;
        let searchResults = '';

        if (mode === 'trending' || mode === 'custom_topic') {
            event.sender.send('frenchtalk-progress', { status: `🔍 Ищу идею для стрит-интервью...`, progress: 15 });
            const q = mode === 'trending'
                ? `viral TikTok street interview questions ${country} trending this week`
                : customInput;
            searchResults = await searchWeb(q);

            event.sender.send('frenchtalk-progress', { status: '🤖 Формирую тему сценария...', progress: 35 });

            const historyKey = `frenchtalk_${language || 'fr'}`;
            const completedTopics = historyManager.getTopics(historyKey);
            let completedText = '';
            if (completedTopics && completedTopics.length > 0) {
                completedText = `\nALREADY GENERATED (DO NOT REPEAT):\n- ${completedTopics.slice(-40).join('\n- ')}\n`;
            }

            const effectiveInput = mode === 'trending' ? '' : customInput;
            const selectPrompt = `You are a TikTok content strategist for a viral street interview show in ${country} called "FrenchTalk".
The blogger is a young, beautiful, cheeky French woman who stops random people on the street, in the metro, or on public transport.
She asks them ONE surprising/funny/provocative question, gets their answer, then steps aside and comments with a smirky, witty, slightly savage reaction to camera.

Web context:
${searchResults}
${effectiveInput ? `\nUser topic idea: "${effectiveInput}"` : ''}
${completedText}

Choose ONE topic/question idea for a street encounter that:
- Is funny, surprising, slightly provocative OR touching
- Generates an interesting/funny stranger reaction
- Works well as a short TikTok

Output ONLY valid JSON:
{
  "topic": "Topic name in ${language}",
  "topicEn": "Topic name in English",
  "topicRu": "Topic name translated to Russian",
  "hook": "The blogger's opening viral hook line in ${language} (MAX 8 words, shocking/provocative)",
  "hookRu": "Hook translated to Russian",
  "question": "The main question the blogger asks the stranger in ${language}",
  "angle": "The funny/ironic comedic angle for the blogger's aside comment"
}`;

            const topicRaw = await ai.chat([{ role: 'user', content: selectPrompt }], true);
            const topicMatch = topicRaw.match(/\{[\s\S]*\}/);
            if (!topicMatch) throw new Error('LLM could not select a topic. Raw: ' + topicRaw.substring(0, 200));
            topicData = JSON.parse(topicMatch[0]);

        } else if (mode === 'custom_text') {
            event.sender.send('frenchtalk-progress', { status: '🤖 Читаю и адаптирую ваш текст...', progress: 20 });
            const parsePrompt = `Extract the main topic, hook, and comedic angle from this text for a French street interview TikTok:
"${customInput}"

Output ONLY valid JSON:
{
  "topic": "Main topic in ${language}",
  "topicEn": "Main topic in English",
  "topicRu": "Main topic in Russian",
  "hook": "Viral hook in ${language} (MAX 8 words)",
  "hookRu": "Hook in Russian",
  "question": "The blogger's question to the stranger in ${language}",
  "angle": "Funny/ironic comedic angle for blogger's aside"
}`;
            const topicRaw = await ai.chat([{ role: 'user', content: parsePrompt }], true);
            const topicMatch = topicRaw.match(/\{[\s\S]*\}/);
            if (!topicMatch) throw new Error('LLM could not parse text. Raw: ' + topicRaw.substring(0, 200));
            topicData = JSON.parse(topicMatch[0]);
        }

        console.log(`[FrenchTalk AutoTopic] Topic: ${topicData.topicEn}`);
        event.sender.send('frenchtalk-progress', { status: `✍️ Пишу сценарий: "${topicData.topic}"...`, progress: 50 });

        // Generate script: blogger question → stranger answer → blogger aside (x N rounds)
        const lineCount = shortVersion ? '5-7' : '9-12';
        // Pick a random CTA STYLE mood + 3-4 random example phrases (Cinema World Builder: Dialogue Engine)
        const ctaStyle = CTA_STYLES[Math.floor(Math.random() * CTA_STYLES.length)];
        const shuffled = [...CTA_EXAMPLES].sort(() => Math.random() - 0.5);
        const ctaSamples = shuffled.slice(0, 4).map(s => `  - "${s}"`).join('\n');

        const scriptPrompt = `You are an expert TikTok scriptwriter for "FrenchTalk" — a street interview show where ${bloggerName}, a young beautiful cheeky French blogger, stops random people in Paris and asks them surprising questions.

TOPIC: "${topicData.topic}"
BLOGGER'S MAIN QUESTION: "${topicData.question}"
COMEDIC ANGLE: "${topicData.angle}"
STRANGER TYPE: ${strangerType || 'a random adult person on the street'}
LANGUAGE: ${language}

THE FORMAT IS A STREET ENCOUNTER with 3 roles:
- BLOGGER: ${bloggerName} — asks questions, initiates, energetic, slightly provocative
- STRANGER: the person being interviewed — authentic, surprised, can be funny/serious/awkward
- ASIDE: the blogger turns to camera and makes a witty/sassy comment AFTER the stranger answers (like a reaction shot)

══════════════════════════════════════
⚠️ ABSOLUTE TECHNICAL CONSTRAINT:
Each line = ONE 8-second video clip.
MAXIMUM 15-20 WORDS PER LINE.
COUNT YOUR WORDS. EVERY LINE MUST BE ≤20 WORDS.
══════════════════════════════════════

STRUCTURE (${lineCount} lines total):
▶ LINE 1 — BLOGGER: The viral HOOK — shocking/provocative opener. MAX 8 WORDS.
   FORBIDDEN first words: "Hello", "Bonjour", "Welcome", "Today", "So", "Hey", "Guys"

▶ LINE 2 — BLOGGER: Introduces the question/encounter setup. 10-15 words.

▶ LINE 3 — STRANGER: First surprised/hesitant reaction to the question. 8-15 words.

▶ LINE 4 — ASIDE: Blogger's sassy camera comment on stranger's reaction. 10-15 words. (Smirky, slightly savage)

▶ LINES 5-7 — Alternating BLOGGER follow-up questions and STRANGER answers. Build the reaction. 10-18 words each.

${!shortVersion ? `▶ LINES 8-10 — STRANGER reveals something unexpected or funny. 12-18 words each.

▶ LINE 11 — ASIDE: Blogger's final witty punchline to camera. MAX 12 WORDS. Memorable closing line.

▶ LINE 12 — OUTRO: TWO parts in one line (MAX 22-24 words total):
   PART 1: Engage viewers — ask them how THEY would answer the question (e.g. "А ты бы что ответил? Пиши в комментариях!" or "And you? What would YOU say? Tell me in the comments!"). 8-12 words.
   PART 2: Cheeky CTA for like/subscribe.
🎭 THIS TIME the CTA mood is: "${ctaStyle.mood.toUpperCase()}" — ${ctaStyle.direction}
Invent a UNIQUE phrase that matches this energy. Inspired by (but NEVER copying) these examples:
${ctaSamples}
Must be original, match the ${ctaStyle.mood} mood, 8-12 words.
TOTAL OUTRO LINE: 18-24 words. Do NOT exceed 24 words.` : `▶ LINE 5-6 — ASIDE: Blogger's final witty punchline to camera.
▶ LINE 7 — OUTRO: TWO parts in one line (MAX 22-24 words total):
   PART 1: Engage viewers — ask them how THEY would answer the question (8-12 words).
   PART 2: Cheeky CTA for like/subscribe.
🎭 THIS TIME the CTA mood is: "${ctaStyle.mood.toUpperCase()}" — ${ctaStyle.direction}
Invent a UNIQUE phrase that matches this energy. Inspired by (but NEVER copying) these examples:
${ctaSamples}
Must be original, match the ${ctaStyle.mood} mood, 8-12 words.
TOTAL OUTRO LINE: 18-24 words. Do NOT exceed 24 words.`}

RULES:
- Format: "${bloggerName}: [text]" OR "Stranger: [text]" OR "Aside: [text]" OR "Outro: [text]"
- Total: exactly ${lineCount.split('-')[1]} lines
- HARD LIMIT: 20 words per line
- NO stage directions, NO asterisks, NO parentheses
- The ASIDE lines are the blogger talking to the camera, not to the stranger — cheeky, slightly mean, very funny
- Blogger's language style: Use modern youth slang, popular TikTok expressions, and vibrant internet language (e.g., "vibes", "literally", "no cap", "serving", "slay", or their French/Russian equivalents depending on the language).
- Blogger's body language in text: Reflect a highly energetic personality with lively gestures and expressive body language implicitly through the phrasing.
- Use punctuation "!", "?", "?!", "..." for expressiveness
- The stranger should sound authentic and slightly awkward/funny

Output ONLY the script lines, nothing else.`;

        const scriptRaw = await ai.chat([{ role: 'user', content: scriptPrompt }], false);

        // Translate to Russian
        let scriptRu = '';
        try {
            event.sender.send('frenchtalk-progress', { status: '🌐 Перевожу сценарий на русский...', progress: 85 });
            const translationPrompt = `Translate this script to Russian line-by-line.
Keep the exact speaker format: "Speaker: Russian translation".
Do not change speaker names (${bloggerName}, Stranger, Aside).
Match the tone — cheeky, playful, witty.

Script:
${scriptRaw}`;
            scriptRu = await ai.chat([{ role: 'user', content: translationPrompt }], false);
        } catch (transErr) {
            console.error('[FrenchTalk AutoTopic] Translation failed:', transErr.message);
        }

        // Validate line lengths
        const scriptLines = scriptRaw.trim().split('\n').filter(l => l.trim().length > 0);
        const overlongLines = [];
        for (let i = 0; i < scriptLines.length; i++) {
            const match = scriptLines[i].match(/^([^:]+):\s*(.*)$/);
            if (match) {
                const wordCount = match[2].trim().split(/\s+/).length;
                const isOutro = match[1].trim().toLowerCase() === 'outro';
                const maxWords = isOutro ? 24 : 20; // Outro has 2 parts: viewer question + CTA
                if (wordCount > maxWords) {
                    overlongLines.push({ line: i + 1, words: wordCount, text: scriptLines[i].substring(0, 60) });
                }
            }
        }

        if (topicData && topicData.topic) {
            const historyKey = `frenchtalk_${language || 'fr'}`;
            historyManager.addTopic(historyKey, topicData.topic);
        }

        event.sender.send('frenchtalk-progress', { status: '', progress: 0 });

        return {
            topic: topicData.topic,
            topicEn: topicData.topicEn,
            topicRu: topicData.topicRu || '',
            hook: topicData.hook,
            hookRu: topicData.hookRu || '',
            question: topicData.question,
            script: scriptRaw.trim(),
            scriptRu: scriptRu.trim(),
            overlongLines
        };
    });

    // 8. Analyze Video and generate FrenchTalk script from it
    ipcMain.handle('frenchtalk-analyze-video', async (event, { videoBase64, language, bloggerName, strangerType, shortVersion = false }) => {
        console.log(`[FrenchTalk Video Analysis] lang=${language} shortVersion=${shortVersion}`);
        if (!videoBase64) throw new Error('Данные видео не переданы');

        const tempDir = path.join(FRENCHTALK_DIR, 'TempAnalysis');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const videoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
        const audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);

        try {
            const videoData = videoBase64.includes('base64,') ? videoBase64.split(';base64,').pop() : videoBase64;
            fs.writeFileSync(videoPath, videoData, 'base64');

            event.sender.send('frenchtalk-progress', { status: '🎵 Извлечение аудио из видео...', progress: 15 });
            const execSync = require('child_process').execSync;
            try {
                execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`, { stdio: 'pipe' });
            } catch (ffmpegErr) {
                const errOutput = ffmpegErr.stderr ? ffmpegErr.stderr.toString() : (ffmpegErr.message || '');
                if (errOutput.includes('does not contain any stream') || errOutput.includes('Invalid argument')) {
                    throw new Error('В видео нет аудиодорожки. Выберите видео со звуком.');
                }
                throw ffmpegErr;
            }

            event.sender.send('frenchtalk-progress', { status: '🗣️ Транскрибирую аудио...', progress: 40 });
            const sttResult = await ai.transcribe(audioPath);
            const transcript = sttResult.text;
            if (!transcript.trim()) throw new Error('Не удалось получить текст из видео');

            event.sender.send('frenchtalk-progress', { status: '🤖 Создаю сценарий на основе видео...', progress: 70 });
            const lineCount = shortVersion ? '5-7' : '9-12';
            // Pick a random CTA style for this video-analysis script too
            const ctaStyleVA = CTA_STYLES[Math.floor(Math.random() * CTA_STYLES.length)];
            const shuffledVA = [...CTA_EXAMPLES].sort(() => Math.random() - 0.5);
            const ctaSamplesVA = shuffledVA.slice(0, 4).map(s => `  - "${s}"`).join('\n');
            const analyzePrompt = `You are a scriptwriter for "FrenchTalk" — a Paris street interview TikTok show.
We transcribed a reference video. Transcript: "${transcript}"

Create a new FrenchTalk street encounter script in ${language} inspired by this content.
Blogger: ${bloggerName} (young, cheeky, beautiful French woman)
Stranger type: ${strangerType || 'a random person on the street'}

Format:
- "${bloggerName}: [text]" — blogger questions
- "Stranger: [text]" — stranger responses
- "Aside: [text]" — blogger's sassy aside to camera
- "Outro: [text]" — blogger's cheeky call-to-action to viewers (like/subscribe).

THE LAST LINE MUST ALWAYS BE "Outro:" — TWO parts in one line (MAX 22-24 words total):
   PART 1: Ask viewers how THEY would answer the question (e.g. "А ты бы что ответил? Пиши в комментариях!" or "And you? What would YOU say? Tell me in the comments!"). 8-12 words.
   PART 2: Cheeky CTA for like/subscribe.
🎭 THIS TIME the CTA mood is: "${ctaStyleVA.mood.toUpperCase()}" — ${ctaStyleVA.direction}
Invent a UNIQUE CTA phrase that matches this energy. Inspired by (but NEVER copying) these examples:
${ctaSamplesVA}
Must be original, match the ${ctaStyleVA.mood} mood, 8-12 words.
TOTAL OUTRO LINE: 18-24 words. Do NOT exceed 24 words.

Exactly ${lineCount.split('-')[1]} lines, MAX 20 words per line.

Output ONLY valid JSON:
{
  "topic": "Topic in ${language}",
  "topicEn": "Topic in English",
  "topicRu": "Topic in Russian",
  "hook": "Viral hook in ${language} (MAX 8 words)",
  "hookRu": "Hook in Russian",
  "question": "Main question in ${language}",
  "script": "${bloggerName}: line1\\nStranger: line2\\nAside: line3\\n...\\nOutro: CTA line"
}`;

            const resultRaw = await ai.chat([{ role: 'user', content: analyzePrompt }], true);
            const jsonMatch = resultRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('LLM did not output valid JSON. Raw: ' + resultRaw.substring(0, 200));
            const topicData = JSON.parse(jsonMatch[0]);

            event.sender.send('frenchtalk-progress', { status: '🌐 Перевожу на русский...', progress: 90 });
            const translationPrompt = `Translate this script to Russian line-by-line. Keep format "Speaker: Russian text".
Script:\n${topicData.script}`;
            const scriptRu = await ai.chat([{ role: 'user', content: translationPrompt }], false);

            try {
                if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            } catch (e) { console.warn('[FrenchTalk] Could not delete temp files:', e.message); }

            event.sender.send('frenchtalk-progress', { status: '', progress: 0 });

            return {
                topic: topicData.topic,
                topicEn: topicData.topicEn,
                topicRu: topicData.topicRu || '',
                hook: topicData.hook,
                hookRu: topicData.hookRu || '',
                question: topicData.question || '',
                script: topicData.script.trim(),
                scriptRu: scriptRu.trim()
            };
        } catch (err) {
            try { if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath); } catch (e) {}
            console.error('[FrenchTalk Video Analysis] Error:', err);
            event.sender.send('frenchtalk-progress', { status: '', progress: 0 });
            throw err;
        }
    });

    // Extract a JPEG frame from a video file using ffmpeg
    async function extractFrameFromVideo(videoPath, outputImagePath, timeSeconds = 0.5) {
        const execSync = require('child_process').execSync;
        try {
            execSync(
                `ffmpeg -y -ss ${timeSeconds} -i "${videoPath}" -vframes 1 -q:v 2 "${outputImagePath}"`,
                { stdio: 'pipe' }
            );
            return fs.existsSync(outputImagePath) ? outputImagePath : null;
        } catch (err) {
            console.error('[FrenchTalk] Frame extraction failed:', err.message);
            return null;
        }
    }

    // 9. Generate Single Segment
    ipcMain.handle('frenchtalk-generate-segment', async (event, {
        segmentIndex, role, dialogueText, speakerLabel,
        bloggerOutfit, location, episodeTitle,
        aspectRatio = '9:16', language = null, videoModel = 'omni_flash',
        strangerDescription = '', strangerVoiceDescription = '',
        strangerRefBase64 = ''
    }) => {
        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен. Сначала создайте персонаж блогера.');

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(FRENCHTALK_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        const imagesDir = path.join(episodeDir, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        let lang = language;
        if (!lang) {
            if (/[Ѐ-ӿ]/.test(dialogueText)) lang = 'Russian';
            else if (/[àâçéèêëîïôùûü]/i.test(dialogueText)) lang = 'French';
            else lang = 'English';
        }

        const emotion = getEmotionFromText(dialogueText);
        const effectiveStrangerVoice = strangerVoiceDescription || DEFAULT_STRANGER_VOICE_DESCRIPTION;
        const streetNoiseSuffix = `Ambient Paris street noise in background — light traffic, distant chatter, urban atmosphere. Natural handheld camera shake.`;

        // isHook = first blogger line of the episode (segmentIndex 0) — direct-to-camera opener
        const isHook = role === 'blogger' && segmentIndex === 0;

        let videoPrompt = '';
        let referenceImages = [];
        let hostImgBase64 = null;

        if (role === 'blogger' || role === 'aside' || role === 'outro') {
            const cacheSuffix = aspectRatio.replace(':', '_');
            const cachedImgPath = path.join(imagesDir, `blogger_${cacheSuffix}.jpg`);

            let hostImgPath;
            if (fs.existsSync(cachedImgPath)) {
                hostImgPath = cachedImgPath;
            } else if (!bloggerOutfit && blogger.imagePath && fs.existsSync(blogger.imagePath)) {
                hostImgPath = await ensureImageAspectRatio(blogger.imagePath, aspectRatio, cachedImgPath);
            } else {
                const episodeVisualPrompt = `${blogger.visualPrompt} Wearing exactly the same outfit as in the reference photo${bloggerOutfit ? `: ${bloggerOutfit}` : ' — do not change or add any clothing'}. Standing in ${location}, holding a microphone or smartphone. Cinematic portrait, 9:16.`;
                let refBase64 = null;
                if (blogger.imagePath && fs.existsSync(blogger.imagePath)) {
                    refBase64 = fs.readFileSync(blogger.imagePath, 'base64');
                }
                const imgPaths = await ai.generateImage({
                    prompt: episodeVisualPrompt,
                    model: 'nano_banana_2',
                    aspectRatio,
                    sectionDir: imagesDir,
                    subFolder: '',
                    sceneIndex: `blogger_ep`,
                    referenceImages: refBase64 ? [{ data: refBase64 }] : []
                });
                hostImgPath = imgPaths[0];
                if (hostImgPath !== cachedImgPath) {
                    fs.copyFileSync(hostImgPath, cachedImgPath);
                    hostImgPath = cachedImgPath;
                }
            }

            hostImgBase64 = fs.readFileSync(hostImgPath, 'base64');

            videoPrompt = buildVideoPrompt({
                role,
                isHook,
                dialogueText,
                bloggerName: blogger.name,
                bloggerVisual: blogger.visualPrompt || null,
                bloggerOutfit: bloggerOutfit || blogger.outfitBase || '',
                bloggerVoice: blogger.voiceDescription || BLOGGER_VOICE_DESCRIPTION,
                strangerDescription,
                strangerVoice: effectiveStrangerVoice,
                location,
                emotion,
                streetNoiseSuffix
            });

            // For mid-interview blogger shots (not hook, not aside): add stranger as 2nd reference
            // so the model sees both faces and keeps blogger's identity stable in the two-shot
            if (role === 'blogger' && !isHook) {
                const strangerRefImagePath = path.join(imagesDir, `stranger_reference_${aspectRatio.replace(':', '_')}.jpg`);
                const strangerFramePath = path.join(imagesDir, `stranger_frame.jpg`);
                let strangerRef = null;
                if (fs.existsSync(strangerFramePath)) {
                    strangerRef = fs.readFileSync(strangerFramePath, 'base64');
                } else if (fs.existsSync(strangerRefImagePath)) {
                    strangerRef = fs.readFileSync(strangerRefImagePath, 'base64');
                }
                referenceImages = strangerRef
                    ? [{ data: hostImgBase64 }, { data: strangerRef }]
                    : [{ data: hostImgBase64 }];
            } else {
                referenceImages = [{ data: hostImgBase64 }];
            }

        } else {
            // STRANGER role — use a consistent appearance across ALL stranger clips in this episode.
            // Strategy:
            //   1. First stranger clip: generate image from text prompt → save as stranger_reference.jpg
            //   2. After first stranger video is generated: extract a frame → save as stranger_frame.jpg
            //   3. All subsequent stranger clips: use stranger_frame.jpg (real face from video) as reference
            const strangerRefImagePath = path.join(imagesDir, `stranger_reference_${aspectRatio.replace(':', '_')}.jpg`);
            const strangerFramePath = path.join(imagesDir, `stranger_frame.jpg`);

            let strangerImgBase64 = null;

            if (fs.existsSync(strangerFramePath)) {
                // Best case: we have a real extracted frame from a previous video — most consistent appearance
                strangerImgBase64 = fs.readFileSync(strangerFramePath, 'base64');
                console.log(`[FrenchTalk] Stranger seg#${segmentIndex}: using extracted video frame as reference`);
            } else if (fs.existsSync(strangerRefImagePath)) {
                // We have a generated stranger reference image (from first stranger clip generation)
                strangerImgBase64 = fs.readFileSync(strangerRefImagePath, 'base64');
                console.log(`[FrenchTalk] Stranger seg#${segmentIndex}: using generated reference image`);
            } else {
                // First stranger clip: generate the reference image now
                console.log(`[FrenchTalk] Stranger seg#${segmentIndex}: generating new stranger reference image`);
                const strangerPrompt = `A photorealistic portrait of ${strangerDescription || 'a random French adult person on the street, authentic and natural'}, surprised/thoughtful expression, ${emotion}, Paris street background blurred, natural lighting, 9:16 portrait, cinematic 4K.`;
                const strangerPaths = await ai.generateImage({
                    prompt: strangerPrompt,
                    model: 'nano_banana_2',
                    aspectRatio,
                    sectionDir: imagesDir,
                    subFolder: '',
                    sceneIndex: `stranger_ref`
                });
                const generatedPath = strangerPaths[0];
                fs.copyFileSync(generatedPath, strangerRefImagePath);
                strangerImgBase64 = fs.readFileSync(strangerRefImagePath, 'base64');
            }

            videoPrompt = buildVideoPrompt({
                role: 'stranger',
                isHook: false,
                dialogueText,
                bloggerName: blogger.name,
                bloggerVisual: blogger.visualPrompt || null,
                bloggerOutfit: bloggerOutfit || blogger.outfitBase || '',
                bloggerVoice: blogger.voiceDescription || BLOGGER_VOICE_DESCRIPTION,
                strangerDescription,
                strangerVoice: effectiveStrangerVoice,
                location,
                emotion,
                streetNoiseSuffix
            });
            // Add blogger as 2nd reference so the model keeps both faces consistent in the two-shot
            const cachedBloggerPath = path.join(imagesDir, `blogger_${aspectRatio.replace(':', '_')}.jpg`);
            let bloggerRefForStranger = null;
            if (fs.existsSync(cachedBloggerPath)) {
                bloggerRefForStranger = fs.readFileSync(cachedBloggerPath, 'base64');
            } else if (blogger.imagePath && fs.existsSync(blogger.imagePath)) {
                bloggerRefForStranger = fs.readFileSync(blogger.imagePath, 'base64');
            }
            referenceImages = bloggerRefForStranger
                ? [{ data: strangerImgBase64 }, { data: bloggerRefForStranger }]
                : [{ data: strangerImgBase64 }];
        }

        const videoPath = await ai.generateVideo({
            prompt: videoPrompt,
            model: videoModel,
            mode: 'start_image',
            aspectRatio,
            resolution: '720p',
            sectionDir: episodeDir,
            subFolder: '',
            sceneIndex: `clip_${String(segmentIndex + 1).padStart(3, '0')}_${role}`,
            referenceImages,
            generateAudio: true
        });

        // After the FIRST stranger video is generated, extract a frame to use as the
        // reference for all subsequent stranger clips — guarantees visual consistency.
        if (role === 'stranger') {
            const strangerFramePath = path.join(imagesDir, `stranger_frame.jpg`);
            if (!fs.existsSync(strangerFramePath) && fs.existsSync(videoPath)) {
                console.log(`[FrenchTalk] Extracting stranger reference frame from first stranger video...`);
                await extractFrameFromVideo(videoPath, strangerFramePath, 1.0);
                if (fs.existsSync(strangerFramePath)) {
                    console.log(`[FrenchTalk] Stranger reference frame saved: ${strangerFramePath}`);
                }
            }
        }

        saveEpisodePromptsMetadata(episodeDir, episodeTitle, {
            segmentIndex, role,
            speakerName: speakerLabel,
            dialogueText, videoPrompt
        });

        const videoBase64 = fs.readFileSync(videoPath);
        return {
            videoPath,
            videoBase64: `data:video/mp4;base64,${videoBase64.toString('base64')}`,
            segmentIndex
        };
    });

    // 10. Save all prompts (debounced pre-save)
    ipcMain.handle('frenchtalk-save-all-prompts', async (event, {
        bloggerName, bloggerOutfit, location, episodeTitle,
        aspectRatio = '9:16', segments
    }) => {
        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(FRENCHTALK_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        const jsonPath = path.join(episodeDir, 'prompts.json');
        const txtPath = path.join(episodeDir, 'prompts.txt');

        const updatedPromptsData = {};
        for (const seg of segments) {
            const emotion = getEncounterEmotionPrompt(seg.text, seg.role);
            const roleLabel = seg.role === 'aside' ? 'Aside (to camera)' : seg.role === 'blogger' ? 'Blogger question' : 'Stranger reply';

            let videoPrompt = `[${roleLabel}] Location: ${location}. Emotion: ${emotion}. Says: "${seg.text}"`;

            updatedPromptsData[seg.index] = {
                segmentIndex: seg.index,
                role: seg.role,
                speakerName: seg.speakerLabel || seg.role,
                dialogueText: seg.text,
                videoPrompt,
                timestamp: new Date().toISOString()
            };
        }

        fs.writeFileSync(jsonPath, JSON.stringify(updatedPromptsData, null, 2), 'utf8');

        const sortedIndices = Object.keys(updatedPromptsData).map(Number).sort((a, b) => a - b);
        let txtContent = `========================================================================\nFRENCHTALK GENERATION PROMPTS\nEpisode: ${episodeTitle}\nGenerated: ${new Date().toLocaleString()}\n========================================================================\n\n`;
        for (const idx of sortedIndices) {
            const p = updatedPromptsData[idx];
            txtContent += `🎬 Scene #${p.segmentIndex + 1} — ${p.speakerName}\n------------------------------------------------------------------------\n🗣 Says: "${p.dialogueText}"\n📝 Prompt: ${p.videoPrompt}\n------------------------------------------------------------------------\n\n`;
        }
        fs.writeFileSync(txtPath, txtContent, 'utf8');
        return { success: true };
    });
}

module.exports = { registerFrenchTalkHandlers };
