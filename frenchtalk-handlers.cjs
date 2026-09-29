const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const historyManager = require('./history-manager.cjs');
const ai = require('./ai-client.cjs');
const { searchWeb } = require('./search-helper.cjs');

const FRENCHTALK_DIR = path.join(__dirname, 'FrenchTalk');
const BLOGGER_FILE = path.join(FRENCHTALK_DIR, 'blogger.json');

// Fixed voice ID for the blogger girl — always consistent across all videos
const BLOGGER_VOICE_DESCRIPTION = 'young French woman, bright cheerful energetic voice, slightly cheeky and playful tone, fast-paced millennial speech';

// ─── CINEMATIC AESTHETICS ───────────────────────────────────────────────────
const CINEMATIC_MODIFIERS = `Professional studio digital video aesthetics: crisp edge-to-edge full-frame coverage filling the entire screen boundary completely, unobstructed clean visual field, ultra-sharp optical focus, warm ambient interior lighting with soft facial illumination, realistic skin micro-texture, natural subsurface scattering, fine hair details, high dynamic range digital color science with rich warm tones, deep clean shadows, photorealistic 8K sensor quality, polished editorial visual style.`;

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

function buildVideoPrompt({ role, isHook, dialogueText, bloggerName, bloggerVoice,
    bloggerOutfit, strangerDescription, strangerVoice, location, emotion, streetNoiseSuffix, targetLanguage, fullScript = '' }) {

    // @anchor tag helps Omni Flash keep blogger identity consistent across all clips
    const bloggerAnchor = `@${bloggerName.replace(/\s+/g, '')}`;

    const isVlogRole = role === 'vlog_action' || role === 'vlog_comment' || (role === 'outro' && location && location.toLowerCase() !== 'paris street');

    // For vlog roles: reference image carries all appearance/outfit info — do NOT repeat it in text.
    // For street roles: keep the identity pin so the model knows who the blogger is without a ref image.
    const bloggerPin = isVlogRole
        ? `CHARACTER: ${bloggerAnchor} — match the reference image exactly. Do NOT invent or change appearance, outfit, or hair.`
        : `CHARACTER: ${bloggerAnchor} — ${bloggerName}, young beautiful French woman blogger.
OUTFIT: ${bloggerOutfit ? `${bloggerOutfit} — must stay exactly the same in every shot.` : 'match exactly what she wears in the reference photo.'}`;

    const micDetail = isVlogRole
        ? `NO MICROPHONE IN HANDS. Her hands are completely free, natural vlogging posture.`
        : `Holding a small, square, matte-black wireless microphone (Rode Wireless GO II) with a black foam windshield on top, mounted on a 15cm long cylindrical black handle grip (Interview GO). The entire microphone setup is strictly black and grey, no bright colors.`;

    // Full episode context — helps the video model stay consistent with what is actually being shown
    const episodeContext = fullScript
        ? `\nEPISODE CONTEXT (the full script — use this to know exactly what dish/recipe/topic is being made, what ingredients exist, what was done in previous scenes, and what comes next. NEVER invent objects or actions that contradict this):\n"""\n${fullScript}\n"""\nCURRENT LINE: "${dialogueText}"\n`
        : '';

    const strangerDesc = strangerDescription || 'a random Parisian person on the street';

    const translationRule = (targetLanguage && targetLanguage !== 'English')
        ? `\nTRANSLATION OVERRIDE: The speaker MUST translate and speak the dialogue in fluent natural ${targetLanguage.toUpperCase()}. Ensure perfect lip sync for ${targetLanguage}.`
        : '';

    // ─── OUTRO: Director Mode — randomized camera staging ───────────────
    // Inspired by Cinema World Builder's Shot Designer + Director Mode.
    // Each outro gets a different cinematic feel so the channel never looks repetitive.
    if (role === 'outro') {
        const isVlogContext = location && location.toLowerCase() !== 'paris street';
        
        const outroStyles = [
            { // Classic hero angle push-in
                shot: `Medium close-up MCU on ${bloggerName}, slightly tilted angle from below (hero angle).`,
                staging: `Direct eye contact with the camera lens. Warm confident smile, playful wink or blown kiss at the end. She points at the camera or makes a heart gesture with her hands. ${isVlogContext ? 'She is actively in her environment.' : 'She stands casually.'}`,
                camera: `handheld shot. Medium close-up MCU on ${bloggerName}. Direct eye contact with the camera. Warm confident smile, playful energy, pointing at camera. Movement: hold the camera at human operator height with natural body movement, slight push-in toward the subject. Speed: responsive and organic. End: finish closer to the subject with a warm inviting composition.`,
                lighting: `Natural golden hour daylight, warm and flattering. Soft backlight glow.`,
                mood: `Flirty, confident, warm — directly addressing the viewer as if talking to a friend.`
            },
            { // Walk-away-turn-back (dramatic farewell)
                shot: `Medium shot MS on ${bloggerName} walking away from camera, then turning back over her shoulder.`,
                staging: `She walks a few steps away, then spins back with a cheeky grin and points at the camera. Playful "catch you later" energy.`,
                camera: `static shot. Medium shot MS. ${bloggerName} walks away then turns back toward camera. Movement: camera stays still, subject moves. Speed: natural walking pace. End: she faces camera again with a confident pose.`,
                lighting: `Warm backlit golden hour, silhouette rim light on hair and shoulders.`,
                mood: `Playful farewell energy — "I'm leaving but you'll miss me" attitude.`
            },
            { // Extreme close-up whisper (conspiratorial)
                shot: `Extreme close-up ECU on ${bloggerName}'s face, eyes and lips filling the frame.`,
                staging: `She leans in close to the camera lens like sharing a secret. Mischievous half-smile, eyes sparkling. She whispers the CTA. Shallow depth of field, background completely blurred.`,
                camera: `handheld shot. Extreme close-up ECU. She leans toward the lens conspiratorially. Movement: subtle drift closer. Speed: slow, intimate. End: her face fills 80% of the frame.`,
                lighting: `Soft diffused natural light, warm skin tones, bokeh background.`,
                mood: `Intimate, conspiratorial whisper — like she's telling only YOU a secret.`
            },
            { // Spinning/twirl celebration
                shot: `Medium shot MS on ${bloggerName}, full upper body visible.`,
                staging: `She does a playful spin or twirl on the spot, then stops facing camera with a radiant smile and finger guns or peace signs. ${isVlogContext ? 'She is actively in her environment.' : 'She stands casually.'} Energetic, celebratory, end-of-show vibes.`,
                camera: `orbit shot. Slow arc around ${bloggerName} as she twirls. Movement: camera orbits 90 degrees around subject during the spin. Speed: smooth and cinematic. End: front-facing composition with subject centered.`,
                lighting: `Bright natural daylight, vivid colors, high energy.`,
                mood: `Celebratory, high-energy, triumphant — like dropping the mic after a great show.`
            },
            { // Lean on wall (cool casual)
                shot: `Medium close-up MCU on ${bloggerName} leaning casually.`,
                staging: `She leans back with one foot against a surface, relaxed and cool. Arms crossed or one hand on hip. She looks at camera with a slow confident smile. Classic Parisian nonchalance.`,
                camera: `static shot with subtle handheld sway. Medium close-up MCU. Movement: minimal, just natural handheld breathing. Speed: calm. End: hold the cool composed framing.`,
                lighting: `Soft afternoon shade, even flattering light, muted warm tones.`,
                mood: `Cool, effortless, unbothered — "I don't need to try, I'm already iconic" energy.`
            },
            { // Dutch angle dramatic
                shot: `Medium close-up MCU on ${bloggerName}, Dutch angle (15° tilt), dramatic composition.`,
                staging: `Direct eye contact with camera. One eyebrow raised, sly smirk. Dynamic diagonal composition. Bold, provocative, slightly theatrical.`,
                camera: `handheld shot with intentional Dutch angle tilt. Movement: slow straightening from tilted to level during the line. Speed: deliberate, cinematic. End: camera levels out as she delivers the final word.`,
                lighting: `Dramatic side-lighting, strong contrast, cinematic shadows.`,
                mood: `Dramatic, theatrical, boss energy — like ending a movie trailer.`
            },
        ];

        const style = outroStyles[Math.floor(Math.random() * outroStyles.length)];
        const videoType = isVlogContext ? 'aesthetic vlog' : 'street video';

        return `Vertical TikTok ${videoType}, 9:16 portrait.
${bloggerPin}
MIC: ${micDetail}
LOCATION: ${location || 'Paris street'}
SHOT: ${style.shot}
STAGING: ${style.staging}
${style.camera}
LIGHTING: ${style.lighting}
${episodeContext}She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: ${style.mood} Playful call-to-action energy.
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
    }

    const isRelaxedIndoor = /bedroom|bed|sofa|living room|couch/i.test(location);
    const isWorkingIndoor = /kitchen|cooking|cleaning|office/i.test(location);
    
    let poseDescription = '';
    if (isRelaxedIndoor) {
        poseDescription = 'She is sitting comfortably (e.g., in a lotus pose, or with her legs tucked under her) on a bed or sofa.';
    } else if (isWorkingIndoor) {
        poseDescription = 'She is standing up and actively engaged in her task.';
    } else {
        poseDescription = 'She is positioned naturally for the environment, fully immersed in the aesthetic moment.';
    }

    if (role === 'vlog_action') {
        const isCooking = /kitchen|cooking|cook|recipe|ingredient|food|meal|prep|cuisine|dish/i.test(location + ' ' + dialogueText);
        const isGym = /gym|squat|lunge|deadlift|hip thrust|curl|press|plank|burpee|crunch|pull.up|push.up|halter|kettlebell|barbell|dumbbell|machine|bench|tapis|vélo|elliptique|poids|répétition|série|soulev/i.test(location + ' ' + dialogueText);
        const isStretching = /étirement|stretch|yoga|pose|flex|mobilité|souplesse|relax|respir/i.test(dialogueText);
        const isTasting = /goût|saveur|délicieux|incroyable|hmm|mmmm|essai|taste|tast/i.test(dialogueText);

        // ── Dynamic STAGING derived from the actual dialogue content ──────────
        // Extract concrete objects/actions mentioned in the line so the video
        // generator knows EXACTLY what to show on screen, not a generic fallback.
        const actionStaging = (() => {
            // Cooking: find ingredient names and verbs from the dialogue
            if (isCooking) {
                // Extract quantity+ingredient patterns (e.g. "80g de quinoa", "deux kiwis", "une cuillère")
                const ingredientMatch = dialogueText.match(/(\d+\s*g|\d+\s*ml|une?\s+\w+|deux\s+\w+|trois\s+\w+|\d+\s+\w+)\s+(de\s+\w+|\w+)/i);
                const ingredient = ingredientMatch ? ingredientMatch[0] : null;

                // Extract cooking verbs
                const verbMatch = dialogueText.match(/\b(coupe|couper|rincer|laver|mélanger|verser|ajouter|presser|écraser|faire bouillir|cuire|poêler|mixer|blender|éplucher|trancher|râper|peser|mesurer|disposer|dresser|goûter|assaisonner|saupoudrer|arroser)\b/i);
                const verb = verbMatch ? verbMatch[0] : null;

                if (isTasting) {
                    return `${bloggerName} lifts the dish or spoon to her lips and tastes it on camera — eyes wide with genuine delight, a slow satisfied smile. Her hands hold the dish/utensil naturally. This is the payoff moment — make it mouth-watering.`;
                }
                if (verb && ingredient) {
                    return `Extreme close-up on the action: ${bloggerName}'s hands ${verb}-ing ${ingredient} — purposeful, confident movement. Camera is LOW and CLOSE at counter level: texture, colour, and motion fill the frame. ${bloggerName}'s face may appear at the very top edge of frame — hands and food are the visual hero. No pause, no posed glance — she is fully absorbed in the task.`;
                }
                if (ingredient) {
                    return `Extreme close-up on ${ingredient} — ${bloggerName}'s hands handle it purposefully: turning it, measuring, showing its raw texture or colour. Camera is macro-close: the ingredient fills the frame with shallow depth of field. Warm top-light makes the colours vibrant and appetizing. Her face is NOT required — hands and food are the visual focus.`;
                }
                return `Camera holds low and close on the food — hands at work: chopping, stirring, assembling. ${bloggerName}'s face is visible only in the soft background or at the top edge of frame. The FOOD and her HANDS are the visual subject of this shot. She is fully absorbed in cooking, not posing or looking at camera.`;
            }

            // Gym / fitness exercises
            if (isGym) {
                // Extract exercise name and weight/reps from dialogue
                const exerciseMatch = dialogueText.match(/\b(hip thrust|squat|fente|lunge|soulevé de terre|deadlift|curl|press|plank|crunch|pull.up|push.up|burpee|extension)\b/i);
                const weightMatch = dialogueText.match(/(\d+\s*kg|\d+\s*kilo|\d+\s*répétition|\d+\s*série|\d+\s*reps?)/i);
                const exercise = exerciseMatch ? exerciseMatch[0] : null;
                const weight = weightMatch ? weightMatch[0] : null;

                if (exercise) {
                    const weightDetail = weight ? ` with ${weight}` : '';
                    return `${bloggerName} is actively performing ${exercise}${weightDetail} — body in correct form, movement fluid and deliberate. Full body visible in frame showing the exercise technique clearly. Expression focused but effortlessly athletic.`;
                }
                return `${bloggerName} is actively exercising in the gym — performing the movement she describes with correct form. Full body visible, movement is the focus of the shot. She glances at camera between reps with a confident energetic smile.`;
            }

            // Stretching / yoga / recovery
            if (isStretching) {
                return `${bloggerName} is holding a stretching or yoga pose matching what she describes — body fully extended or relaxed into the position. Calm, graceful, controlled movement. She speaks directly to camera while maintaining the pose.`;
            }

            // Generic vlog action — derive from dialogue keywords
            const holdMatch = dialogueText.match(/\b(bouteille|verre|tasse|bol|assiette|sac|paquet|livre|téléphone|produit|crème|flacon|pot)\b/i);
            if (holdMatch) {
                return `${bloggerName} holds up ${holdMatch[0]} clearly toward the camera — object fully visible in frame. She handles it naturally, turning it, showing it, interacting with it. Her engagement with the object is the visual focus of the shot.`;
            }

            // Final fallback — still better than the old generic text
            return `${bloggerName} performs the specific action she describes — her hands and body are actively engaged in the task, not idle. The physical activity directly mirrors the spoken content. She is focused, purposeful, and looks effortlessly natural in the environment.`;
        })();

        const cookingShot = isCooking
            ? `SHOT VARIETY (alternate between these within the 8 seconds):
  - HERO OPEN: Extreme close-up ECU on the food or hands in action — chopping, pouring, stirring, food sizzling in the pan. THIS IS THE FIRST SHOT. Fill the frame with texture, colour, steam, or motion. Make it cinematic and mouth-watering.
  - MID: Medium shot MS on ${bloggerName} actively cooking — hands moving, body fully engaged in the task. She is DOING, not posing or looking at camera.
  - DETAIL: Macro shot of the dish or key ingredient — sharp focus, shallow depth of field, beautiful food styling. Blogger face NOT required in this shot.
CAMERA MOVEMENT: Open on food ECU hero shot → pull back to reveal blogger at work → return to food detail close-up. Each cut motivated by the action. Handheld, low camera angle at counter level, cinematic food-vlog style.`
            : isGym
            ? `SHOT VARIETY (alternate between these within the 8 seconds):
  - WIDE: Full body medium shot MS showing the complete exercise movement — form and technique visible.
  - CLOSE-UP: Close-up on the working muscle group or the weight/equipment being used.
  - FACE: Brief MCU on ${bloggerName}'s determined, energetic expression mid-exercise.
CAMERA MOVEMENT: Motivated by the exercise rhythm. Handheld, dynamic, athletic vlog style.`
            : `SHOT: Medium shot MS showing ${bloggerName} performing the activity she describes in ${location}.
CAMERA: Handheld camera movement, cinematic depth of field. Soft organic camera drift.`;

        return `Vertical TikTok aesthetic vlog, 9:16 portrait.
${bloggerPin}
MIC: ${micDetail}
LOCATION: ${location}.
${cookingShot}
STAGING: ${actionStaging}
LIGHTING: Natural aesthetic lighting matching the environment.${isCooking ? ' For food close-ups: warm soft top-light to make ingredients look vibrant and appetizing.' : ''}
${episodeContext}She says: "${dialogueText}"
Voice: ${bloggerVoice}
Audio: Ambient sounds of ${location}. ${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
    }

    if (role === 'vlog_comment') {
        const isCookingComment = /kitchen|cooking|cook|recipe|ingredient|food|meal|prep|cuisine|dish|bowl|pan|pot|oven|fry|boil|bake|simmer|sauté|chop|slice|mix|blend/i.test(location + ' ' + dialogueText);

        if (isCookingComment) {
            return `Vertical TikTok aesthetic vlog, 9:16 portrait.
${bloggerPin}
MIC: ${micDetail}
LOCATION: ${location}.
SHOT: Food-first detail shot — camera stays on the cooking process. ${bloggerName}'s face is NOT required in this shot.
STAGING: The DISH is the hero of this shot. Show exactly what is happening in the pan, bowl, or oven right now: sauce bubbling and reducing, colour deepening, steam rising, texture changing, crust forming. ${bloggerName}'s hands may appear at the frame edges — adjusting heat, stirring, tasting from a spoon. The viewer hears her voice but sees the FOOD reacting as she describes it.
CAMERA: Counter-level low angle, macro-close to the food. Shallow depth of field — sharp food, soft bokeh background. Slow gentle push-in toward the most visually interesting detail (the bubbling edge, the caramelized bits, the colour change).
LIGHTING: Warm soft top-light — makes the food look vibrant, appetizing, cinematic.
${episodeContext}She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: Intimate kitchen moment — the food is alive, transforming, beautiful. The viewer wants to reach into the screen and taste it.
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
        }

        return `Vertical TikTok aesthetic vlog, 9:16 portrait.
${bloggerPin}
MIC: ${micDetail}
LOCATION: ${location}.
SHOT: Medium close-up MCU on ${bloggerName}.
STAGING: ${bloggerName} turns directly to face the camera lens, intimate conspiratorial eye contact. She shares a tip or secret with the viewer. Friendly, cheeky, aesthetic girl-vlog vibe.
CAMERA: Handheld, slight push-in, face-level framing.
LIGHTING: Flattering warm indoor/outdoor natural light.
${episodeContext}She says: "${dialogueText}"
Voice: ${bloggerVoice}
MOOD: Intimate, witty, playful, sharing a girl secret.
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
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
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
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
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
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
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
    }

    if (role === 'stranger') {
        return `Vertical TikTok street video, 9:16 portrait.
STRANGER: ${strangerDesc}.
${bloggerPin}
SHOT: Over-the-shoulder (OTS) medium shot. The camera is positioned behind ${bloggerName}.
STAGING: ${bloggerName} is standing with her BACK entirely to the camera in the immediate foreground, slightly out of focus. We only see the back of her head and her back. The STRANGER is standing facing the camera (and facing ${bloggerName}), in sharp focus in the background. ${bloggerName} extends her right arm, holding the black microphone toward the stranger's mouth. 
CAMERA: Handheld, natural eye level, slight natural sway. Over-the-shoulder framing.
LIGHTING: Natural daylight, authentic street atmosphere.
They say: "${dialogueText}"
Voice: ${strangerVoice}
MOOD: ${emotion} — authentic, slightly caught off-guard.
${streetNoiseSuffix}${translationRule}
${CINEMATIC_MODIFIERS}
Clean edge-to-edge full-screen photographic framing, pure digital video feed.`;
    }

    // Fallback
    return `Vertical TikTok street video, 9:16 portrait. ${dialogueText}. ${streetNoiseSuffix}\n${CINEMATIC_MODIFIERS}\nClean edge-to-edge full-screen photographic framing, pure digital video feed.`;
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
        const enhancedPrompt = `${visualPrompt}\n\n${CINEMATIC_MODIFIERS}`;
        const imagePaths = await ai.generateImage({
            prompt: enhancedPrompt,
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

    // 6в. Reset blogger outfit cache for an episode (force re-generation with new outfit/location)
    ipcMain.handle('frenchtalk-reset-outfit-cache', async (event, { episodeTitle, bloggerOutfit, aspectRatio }) => {
        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : null;
        if (!folderName) return { success: true };
        const imagesDir = path.join(FRENCHTALK_DIR, folderName, 'images');
        if (!fs.existsSync(imagesDir)) return { success: true };
        const outfitSlug = (bloggerOutfit || 'default').replace(/[^a-z0-9]/gi, '_');
        const cacheSuffix = `${outfitSlug}_${(aspectRatio || '9:16').replace(':', '_')}`;
        const cachedImgPath = path.join(imagesDir, `blogger_${cacheSuffix}.jpg`);
        try {
            if (fs.existsSync(cachedImgPath)) {
                fs.unlinkSync(cachedImgPath);
                console.log(`[FrenchTalk] Outfit cache cleared: ${cachedImgPath}`);
            }
        } catch (e) { /* ignore */ }
        return { success: true };
    });

    // 6г. Generate outfit reference image — базовая картинка блогера в новой одежде как референс для видео
    ipcMain.handle('frenchtalk-generate-outfit-reference', async (event, { episodeTitle, bloggerOutfit, aspectRatio }) => {
        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен.');

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const imagesDir = path.join(FRENCHTALK_DIR, folderName, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const outfitSlug = (bloggerOutfit || 'default').replace(/[^a-z0-9]/gi, '_');
        const cacheSuffix = `${outfitSlug}_${(aspectRatio || '9:16').replace(':', '_')}`;
        const cachedImgPath = path.join(imagesDir, `blogger_${cacheSuffix}.jpg`);

        // Найти базовую картинку блогера
        let validBloggerImg = null;
        if (blogger.imagePath && fs.existsSync(blogger.imagePath)) {
            validBloggerImg = blogger.imagePath;
        } else {
            const bloggerImgDir = path.join(FRENCHTALK_DIR, 'BloggerImages');
            if (fs.existsSync(bloggerImgDir)) {
                let files = fs.readdirSync(bloggerImgDir).filter(f => f.match(/\.(jpg|jpeg|png)$/i) && !f.startsWith('stranger'));
                if (files.length > 0) {
                    const manualFiles = files.filter(f => !f.startsWith('scene_blogger_base_') && !f.startsWith('blogger_'));
                    if (manualFiles.length > 0) files = manualFiles;
                    files.sort((a, b) => fs.statSync(path.join(bloggerImgDir, b)).mtimeMs - fs.statSync(path.join(bloggerImgDir, a)).mtimeMs);
                    validBloggerImg = path.join(bloggerImgDir, files[0]);
                }
            }
        }
        if (!validBloggerImg) throw new Error('Базовая картинка блогера не найдена. Сначала создайте блогера в Blogger Setup.');

        // Генерируем новый образ в outfit, используя базовую картинку как референс
        const characterSheetPrompt = `A highly detailed, photorealistic 4-angle character design sheet (front view, side profile view, back view, three-quarter view) of a young beautiful French woman blogger, ${blogger.name}. ${blogger.visualPrompt || ''}.
IMPORTANT: She must be wearing exactly this outfit: ${bloggerOutfit}. Do not use her old clothes. White studio background, full body shots, clean layout.

${CINEMATIC_MODIFIERS}`;

        const refBase64 = fs.readFileSync(validBloggerImg, 'base64');
        const ext = validBloggerImg.endsWith('.png') ? 'image/png' : 'image/jpeg';

        const imagePaths = await ai.generateImage({
            prompt: characterSheetPrompt,
            model: 'nano_banana_2',
            aspectRatio: aspectRatio || '9:16',
            sectionDir: imagesDir,
            subFolder: '',
            sceneIndex: `blogger_outfit_${Date.now()}`,
            referenceImages: [{ data: `data:${ext};base64,${refBase64}` }]
        });

        if (!imagePaths || imagePaths.length === 0 || !fs.existsSync(imagePaths[0])) {
            throw new Error('Не удалось сгенерировать образ блогера в новой одежде.');
        }

        fs.copyFileSync(imagePaths[0], cachedImgPath);
        console.log(`[FrenchTalk] Outfit reference generated: ${cachedImgPath}`);

        const base64 = fs.readFileSync(cachedImgPath, 'base64');
        return { imagePath: cachedImgPath, base64: `data:image/jpeg;base64,${base64}` };
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

        let scriptRaw = await ai.chat([{ role: 'user', content: scriptPrompt }], false);
        scriptRaw = scriptRaw.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();

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
            scriptRu = scriptRu.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
        } catch (transErr) {
            console.error('[FrenchTalk AutoTopic] Translation failed:', transErr.message);
        }

        // Validate line lengths
        const scriptLines = scriptRaw.trim().split('\n').filter(l => l.trim().length > 0);
        const overlongLines = [];
        for (let i = 0; i < scriptLines.length; i++) {
            const cleanLine = scriptLines[i].trim();
            const match = cleanLine.match(/^([^:]+):\s*(.*)$/);
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

    // Standalone translation of script to Russian
    ipcMain.handle('frenchtalk-translate-script', async (event, { script, bloggerName }) => {
        console.log(`[FrenchTalk Translate Script] Translating script to Russian...`);
        const translationPrompt = `Translate this FrenchTalk TikTok script to Russian line-by-line.
Keep the exact speaker format: "Speaker: Russian translation".
Do not change speaker names (${bloggerName || 'Camille'}, Stranger, Aside, Outro).
Match the tone — cheeky, playful, witty.
Return ONLY the translated script without any intro, explanatory notes, or markdown codeblocks.

Script:
${script}`;
        const raw = await ai.chat([{ role: 'user', content: translationPrompt }], false);
        const cleanScriptRu = raw.trim().replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
        return { scriptRu: cleanScriptRu };
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
                execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -ar 16000 -ac 1 -b:a 32k -y "${audioPath}"`, { stdio: 'pipe' });
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
        strangerRefBase64 = '', fullScript = ''
    }) => {
        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен. Сначала создайте персонаж блогера.');

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(FRENCHTALK_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        // Persist parsed recipe alongside this episode (if cache is fresh — within 2 hours)
        const recipeCacheFile = path.join(FRENCHTALK_DIR, '_recipe_cache.json');
        const recipeDestFile = path.join(episodeDir, 'recipe_parsed.json');
        if (!fs.existsSync(recipeDestFile) && fs.existsSync(recipeCacheFile)) {
            try {
                const cacheRaw = fs.readFileSync(recipeCacheFile, 'utf8');
                const cache = JSON.parse(cacheRaw);
                const ageMs = Date.now() - new Date(cache.cachedAt).getTime();
                if (ageMs < 2 * 60 * 60 * 1000) { // 2 hours freshness window
                    fs.writeFileSync(recipeDestFile, JSON.stringify(cache.recipe, null, 2), 'utf8');
                    console.log(`[FrenchTalk Segment] recipe_parsed.json saved for episode: ${folderName}`);
                }
            } catch (cacheErr) {
                console.warn('[FrenchTalk Segment] Could not copy recipe cache:', cacheErr.message);
            }
        }

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
        const streetNoiseSuffix = `AUDIO: Clear and audible ambient Paris street noise in the background (traffic, distant chatter, bustling urban atmosphere) underneath the voice. Natural handheld camera shake.`;

        // isHook = first blogger line of the episode (segmentIndex 0) — direct-to-camera opener
        const isHook = role === 'blogger' && segmentIndex === 0;

        let videoPrompt = '';
        let referenceImages = [];
        let hostImgBase64 = null;

        if (role === 'blogger' || role === 'aside' || role === 'outro' || role === 'vlog_action' || role === 'vlog_comment') {
            const isVlog = role === 'vlog_action' || role === 'vlog_comment';
            const outfitSlug = (bloggerOutfit || 'default').replace(/[^a-z0-9]/gi, '_');
            const cacheSuffix = `${outfitSlug}_${aspectRatio.replace(':', '_')}`;
            const cachedImgPath = path.join(imagesDir, `blogger_${cacheSuffix}.jpg`);

            let hostImgPath;
            if (fs.existsSync(cachedImgPath)) {
                hostImgPath = cachedImgPath;
            } else {
                let validBloggerImg = null;
                if (blogger.imagePath && fs.existsSync(blogger.imagePath)) {
                    validBloggerImg = blogger.imagePath;
                } else {
                    // Fallback: search for the newest image in BloggerImages directory
                    const bloggerImgDir = path.join(FRENCHTALK_DIR, 'BloggerImages');
                    if (fs.existsSync(bloggerImgDir)) {
                        let files = fs.readdirSync(bloggerImgDir).filter(f => f.match(/\.(jpg|jpeg|png)$/i) && !f.startsWith('stranger'));
                        if (files.length > 0) {
                            // Prioritize manually uploaded files over system-generated ones
                            const manualFiles = files.filter(f => !f.startsWith('scene_blogger_base_') && !f.startsWith('blogger_'));
                            if (manualFiles.length > 0) {
                                files = manualFiles;
                            }
                            
                            // Get the most recently modified image from the prioritized list
                            files.sort((a, b) => fs.statSync(path.join(bloggerImgDir, b)).mtimeMs - fs.statSync(path.join(bloggerImgDir, a)).mtimeMs);
                            validBloggerImg = path.join(bloggerImgDir, files[0]);
                            console.log(`[FrenchTalk] Fallback: using prioritized blogger image ${files[0]}`);
                        }
                    }
                }

                if (validBloggerImg) {
                    if (bloggerOutfit && bloggerOutfit.toLowerCase() !== 'default' && bloggerOutfit !== blogger.outfitBase) {
                        console.log(`[FrenchTalk] Outfit changed to "${bloggerOutfit}". Generating 4-angle character reference sheet...`);
                        
                        const characterSheetPrompt = `A highly detailed, photorealistic 4-angle character design sheet (front view, side profile view, back view, three-quarter view) of a young beautiful French woman blogger, ${blogger.name}. ${blogger.visualPrompt || ''}. 
IMPORTANT: She must be wearing exactly this outfit: ${bloggerOutfit}. Do not use her old clothes. White studio background, full body shots, clean layout.

${CINEMATIC_MODIFIERS}`;

                        try {
                            // Read blogger source image as reference — so the outfit sheet matches the actual blogger
                            const bloggerRefBase64 = fs.readFileSync(validBloggerImg, 'base64');
                            const bloggerRefExt = validBloggerImg.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

                            const imagePaths = await ai.generateImage({
                                prompt: characterSheetPrompt,
                                model: 'nano_banana_2',
                                aspectRatio: aspectRatio,
                                sectionDir: imagesDir,
                                subFolder: '',
                                sceneIndex: `blogger_sheet_${Date.now()}`,
                                referenceImages: [{ data: `data:${bloggerRefExt};base64,${bloggerRefBase64}` }]
                            });

                            if (imagePaths && imagePaths.length > 0 && fs.existsSync(imagePaths[0])) {
                                fs.copyFileSync(imagePaths[0], cachedImgPath);
                                hostImgPath = cachedImgPath;
                                console.log(`[FrenchTalk] Successfully generated outfit character sheet: ${cachedImgPath}`);
                            } else {
                                throw new Error('No image returned from generateImage');
                            }
                        } catch (imgErr) {
                            console.error(`[FrenchTalk] Failed to generate 4-angle character sheet:`, imgErr);
                            console.log(`[FrenchTalk] Falling back to base image crop.`);
                            hostImgPath = await ensureImageAspectRatio(validBloggerImg, aspectRatio, cachedImgPath);
                        }
                    } else {
                        hostImgPath = await ensureImageAspectRatio(validBloggerImg, aspectRatio, cachedImgPath);
                    }
                } else {
                    throw new Error('Blogger reference image not found! Please create a blogger first.');
                }
            }

            hostImgBase64 = fs.readFileSync(hostImgPath, 'base64');

            videoPrompt = buildVideoPrompt({
                role,
                isHook,
                dialogueText,
                bloggerName: blogger.name,
                bloggerVoice: blogger.voiceDescription || BLOGGER_VOICE_DESCRIPTION,
                bloggerOutfit: bloggerOutfit || blogger.outfitBase || '',
                strangerDescription,
                strangerVoice: effectiveStrangerVoice,
                location,
                emotion,
                streetNoiseSuffix,
                targetLanguage: lang,
                fullScript
            });

            // Gather location reference images (if available) for Vlog / Interior consistency
            referenceImages = [{ data: hostImgBase64 }];
            const locationsDir = path.join(FRENCHTALK_DIR, 'Locations');
            if (fs.existsSync(locationsDir) && location) {
                const sanitizedLoc = location.replace(/[^a-z0-9]/gi, '_');
                const locFiles = fs.readdirSync(locationsDir)
                    .filter(f => /\.(jpg|jpeg|png)$/i.test(f) && f.toLowerCase().includes(sanitizedLoc.toLowerCase()))
                    .slice(0, 3);
                for (const f of locFiles) {
                    const locPath = path.join(locationsDir, f);
                    if (fs.existsSync(locPath)) {
                        const locB64 = fs.readFileSync(locPath, 'base64');
                        referenceImages.push({ data: locB64 });
                    }
                }
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
                streetNoiseSuffix,
                targetLanguage: lang
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
        // Inject Rode microphone reference image if it exists
        const micRefPath = path.join(FRENCHTALK_DIR, 'rode_mic_ref.jpg');
        if (fs.existsSync(micRefPath)) {
            const micB64 = fs.readFileSync(micRefPath, 'base64');
            referenceImages.push({ data: micB64 });
        }

        // Extremely aggressive sanitation to avoid false-positive NSFW filters on Omni Flash
        const safeVideoPrompt = videoPrompt
            .replace(/large natural bust/gi, 'elegant posture')
            .replace(/curvy feminine figure/gi, 'graceful figure')
            .replace(/low-cut/gi, 'v-neck')
            .replace(/cleavage/gi, 'neckline')
            .replace(/sexual/gi, '')
            .replace(/naked/gi, '')
            .replace(/nude/gi, '');

        const videoPath = await ai.generateVideo({
            prompt: safeVideoPrompt,
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

    // 11. Generate 4 Multi-Angle Location Reference Images (Studio Apartment, Kitchen, Gym, etc.)
    ipcMain.handle('frenchtalk-generate-location-ref', async (event, { locationName, visualPrompt, model }) => {
        const locationsDir = path.join(FRENCHTALK_DIR, 'Locations');
        if (!fs.existsSync(locationsDir)) fs.mkdirSync(locationsDir, { recursive: true });

        console.log(`[FrenchTalk Locations] Generating 4 multi-angle reference images for: ${locationName}`);
        
        const angles = [
            'Main frontal view showing main room interior layout',
            'Reverse angle shot facing the opposite wall and entrance',
            'Side angle view focusing on furniture, materials and decor',
            'Wide corner perspective showing full space architecture'
        ];

        const generatedImages = [];
        const sanitizedLoc = locationName.replace(/[^a-z0-9]/gi, '_');

        for (let i = 0; i < angles.length; i++) {
            const angleText = angles[i];
            const prompt = `A photorealistic 9:16 portrait architectural photo of ${visualPrompt}. Angle ${i+1}: ${angleText}. Consistent interior design, high end aesthetic, natural lighting, 4K, no people.`;
            
            const imagePaths = await ai.generateImage({
                prompt,
                model: model || 'nano_banana_2',
                aspectRatio: '9:16',
                sectionDir: FRENCHTALK_DIR,
                subFolder: 'Locations',
                sceneIndex: `loc_${sanitizedLoc}_angle${i+1}_${Date.now()}`
            });

            const imagePath = imagePaths[0];
            const base64 = fs.readFileSync(imagePath, 'base64');
            generatedImages.push({ imagePath, base64: `data:image/jpeg;base64,${base64}` });
        }

        return generatedImages[0];
    });

    // 12. Get existing location reference images
    ipcMain.handle('frenchtalk-get-location-refs', async () => {
        const locationsDir = path.join(FRENCHTALK_DIR, 'Locations');
        if (!fs.existsSync(locationsDir)) return [];

        const files = fs.readdirSync(locationsDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
        return files.map(f => {
            const fullPath = path.join(locationsDir, f);
            const base64 = fs.readFileSync(fullPath).toString('base64');
            return {
                name: f,
                path: fullPath,
                url: `media:///${fullPath.replace(/\\/g, '/')}?t=${Date.now()}`,
                base64: `data:image/jpeg;base64,${base64}`
            };
        });
    });

    // ── Helper: Extract text from Screenshot using Vision OCR ────────
    async function extractVlogScreenshotInfo(screenshotBase64, event) {
        if (!screenshotBase64 || typeof screenshotBase64 !== 'string') return null;
        console.log(`[FrenchTalk Vlog Screenshot] Analyzing screenshot via Vision OCR...`);
        if (event && event.sender) {
            event.sender.send('frenchtalk-progress', { status: '🔍 Сканирую рецепты/секреты со скриншота через Vision AI...', progress: 30 });
        }

        const ocrPrompt = `You are a world-class OCR and content analyst.
Analyze this image carefully. Extract ALL text, beauty secrets, recipes, outfit ideas, fitness tips, lifestyle advice, or quotes verbatim.
If the image contains numbered steps or ingredient lists, extract EVERY SINGLE detail without skipping anything.
Also provide a short 1-sentence summary of the main topic.

OUTPUT FORMAT:
Main Theme: [Core topic]
Extracted Details:
1. [Full text / ingredients / steps]
...`;

        try {
            const cleanBase64 = screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/jpeg;base64,${screenshotBase64}`;
            const visionResponse = await ai.chat([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: ocrPrompt },
                        { type: 'image_url', image_url: { url: cleanBase64 } }
                    ]
                }
            ]);
            return { text: visionResponse };
        } catch (err) {
            console.error(`[FrenchTalk Vlog Screenshot] Vision OCR failed:`, err.message);
            throw new Error(`Ошибка распознавания скриншота: ${err.message}`);
        }
    }

    // ── Helper: Extract Speech and Keyframes from Local Video Upload ────────
    async function extractVlogLocalVideoInfo(videoBase64, event) {
        if (!videoBase64 || typeof videoBase64 !== 'string') return null;
        console.log(`[FrenchTalk Vlog Local Video] Processing uploaded local video file...`);
        if (event && event.sender) {
            event.sender.send('frenchtalk-progress', { status: '📥 Извлекаю аудио и ключевые кадры из загруженного видео...', progress: 20 });
        }

        const crypto = require('crypto');
        const { spawn, execSync } = require('child_process');
        const tempDir = path.join(FRENCHTALK_DIR, 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `vlog_vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const tempVideoPath = path.join(tempDir, `${tempFilePrefix}.mp4`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);
        const framesDir = path.join(tempDir, `${tempFilePrefix}_frames`);
        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

        try {
            const cleanBase64 = videoBase64.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '');
            fs.writeFileSync(tempVideoPath, Buffer.from(cleanBase64, 'base64'));

            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', [
                    '-i', tempVideoPath,
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-ar', '16000',   // 16 kHz — native Whisper/Gemini STT rate
                    '-ac', '1',       // mono
                    '-b:a', '32k',    // sufficient for speech recognition
                    '-y', targetMp3
                ], { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0 && fs.existsSync(targetMp3)) resolve(true);
                    else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-300)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
            });

            if (event && event.sender) {
                event.sender.send('frenchtalk-progress', { status: '🗣️ Распознаю речь из видео через STT...', progress: 45 });
            }
            let transcriptText = '';
            try {
                const sttResult = await ai.transcribe(targetMp3);
                transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();
            } catch (sttErr) {
                console.warn(`[FrenchTalk Vlog Local Video] STT transcription failed: ${sttErr.message}`);
            }

            if (event && event.sender) {
                event.sender.send('frenchtalk-progress', { status: '🔍 Анализирую действия и предметы через Vision AI...', progress: 60 });
            }

            let duration = 10;
            try {
                const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`).toString().trim();
                duration = Math.max(1, parseFloat(durationStr) || 10);
            } catch (_) {}

            const sampleCount = 4;
            const timestamps = [];
            for (let i = 0; i < sampleCount; i++) {
                const t = Math.min(duration - 0.2, Math.max(0.2, (duration / (sampleCount + 1)) * (i + 1)));
                timestamps.push(t.toFixed(2));
            }

            const frameBase64List = [];
            for (let i = 0; i < timestamps.length; i++) {
                const t = timestamps[i];
                const framePath = path.join(framesDir, `frame_${i + 1}.jpg`);
                try {
                    execSync(`ffmpeg -ss ${t} -i "${tempVideoPath}" -vframes 1 -q:v 3 -y "${framePath}"`, { windowsHide: true });
                    if (fs.existsSync(framePath)) {
                        const frameBuf = fs.readFileSync(framePath);
                        frameBase64List.push(`data:image/jpeg;base64,${frameBuf.toString('base64')}`);
                    }
                } catch (frameErr) {}
            }

            let visualDescription = '';
            if (frameBase64List.length > 0) {
                try {
                    const contentParts = [
                        {
                            type: 'text',
                            text: `Analyze these consecutive frames from a reference video.
Identify in detail:
1. What objects, cosmetics, clothes, or ingredients are shown.
2. What specific routine, recipe, makeup technique, styling or lifestyle action is demonstrated.
3. Step-by-step summary of the actions.`
                        }
                    ];
                    for (const fBase64 of frameBase64List) {
                        contentParts.push({ type: 'image_url', image_url: { url: fBase64 } });
                    }
                    visualDescription = await ai.chat([{ role: 'user', content: contentParts }]);
                } catch (visionErr) {}
            }

            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
                if (fs.existsSync(framesDir)) {
                    for (const f of fs.readdirSync(framesDir)) fs.unlinkSync(path.join(framesDir, f));
                    fs.rmdirSync(framesDir);
                }
            } catch (_) {}

            return {
                transcript: transcriptText,
                visualDescription: visualDescription,
                combinedSummary: `Video Spoken Content: "${transcriptText || 'None'}"\n\nVisual Actions & Demonstration: "${visualDescription || 'None'}"`
            };
        } catch (err) {
            console.error(`[FrenchTalk Vlog Local Video] Error:`, err.message);
            throw new Error(`Ошибка обработки видео: ${err.message}`);
        }
    }

    // ── Helper: Download and Transcribe Reference Video URL via yt-dlp ──────
    async function extractVlogReferenceVideoInfo(referenceUrl, event) {
        if (!referenceUrl || typeof referenceUrl !== 'string' || !referenceUrl.trim().startsWith('http')) {
            return null;
        }
        const crypto = require('crypto');
        const { spawn } = require('child_process');
        const cleanUrl = referenceUrl.trim();
        console.log(`[FrenchTalk Vlog Reference] Extracting audio from URL: ${cleanUrl}`);
        if (event && event.sender) {
            event.sender.send('frenchtalk-progress', { status: '📥 Скачиваю видео по ссылке (TikTok/Reels/Shorts/Facebook)...', progress: 15 });
        }

        const tempDir = path.join(FRENCHTALK_DIR, 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const outputTemplate = path.join(tempDir, `${tempFilePrefix}.%(ext)s`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);

        try {
            const cookiesFile = path.join(__dirname, 'instagram_cookies.txt');
            const ytdlpArgs = [
                '-x',
                '--audio-format', 'mp3',
                '--audio-quality', '4',
                '--no-playlist',
                '--max-filesize', '100M',
                '--socket-timeout', '30',
                ...(fs.existsSync(cookiesFile) ? ['--cookies', cookiesFile] : []),
                '-o', outputTemplate,
                cleanUrl
            ];

            await new Promise((resolve, reject) => {
                const proc = spawn('yt-dlp', ytdlpArgs, { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0) resolve(true);
                    else reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(-300)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start yt-dlp: ${err.message}`)));
            });

            let extractedAudioPath = targetMp3;
            if (!fs.existsSync(extractedAudioPath)) {
                const found = fs.readdirSync(tempDir).find(f => f.startsWith(tempFilePrefix) && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav') || f.endsWith('.webm')));
                if (found) extractedAudioPath = path.join(tempDir, found);
            }

            if (!fs.existsSync(extractedAudioPath)) {
                throw new Error('Не удалось извлечь аудиодорожку из референсного видео.');
            }

            if (event && event.sender) {
                event.sender.send('frenchtalk-progress', { status: '🗣️ Распознаю речь и секреты блогера...', progress: 45 });
            }

            const sttResult = await ai.transcribe(extractedAudioPath);
            const transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();

            try {
                if (fs.existsSync(extractedAudioPath)) fs.unlinkSync(extractedAudioPath);
            } catch (e) {}

            if (!transcriptText) {
                throw new Error('Не удалось распознать речь из референсного видео.');
            }

            return {
                url: cleanUrl,
                transcript: transcriptText
            };
        } catch (err) {
            console.error(`[FrenchTalk Vlog Reference] Extraction error:`, err.message);
            throw new Error(`Ошибка разбора референсного видео: ${err.message}`);
        }
    }

    // 13. Generate Girl Secrets & Vlog Script (Action -> Comment -> Outro)
    ipcMain.handle('frenchtalk-auto-vlog-topic', async (event, {
        language, country, bloggerName, vlogTopic, outfit, location, customInput = '', useWebSearch = false,
        referenceUrl = '', screenshotBase64 = null, videoBase64 = null
    }) => {
        console.log(`[FrenchTalk Vlog] Generating script for topic="${vlogTopic}", outfit="${outfit}", location="${location}"`);

        // 1. Process reference materials if present
        let localVideoData = null;
        if (videoBase64 && typeof videoBase64 === 'string') {
            try {
                localVideoData = await extractVlogLocalVideoInfo(videoBase64, event);
            } catch (vErr) {
                console.warn(`[FrenchTalk Vlog] Video extraction error:`, vErr.message);
            }
        }

        let screenshotData = null;
        if (screenshotBase64 && typeof screenshotBase64 === 'string') {
            try {
                screenshotData = await extractVlogScreenshotInfo(screenshotBase64, event);
            } catch (sErr) {
                console.warn(`[FrenchTalk Vlog] Screenshot extraction error:`, sErr.message);
            }
        }

        let refData = null;
        if (referenceUrl && typeof referenceUrl === 'string' && referenceUrl.trim().startsWith('http')) {
            try {
                refData = await extractVlogReferenceVideoInfo(referenceUrl, event);
            } catch (rErr) {
                console.warn(`[FrenchTalk Vlog] URL extraction error:`, rErr.message);
            }
        }

        if (event && event.sender) {
            event.sender.send('frenchtalk-progress', { status: '📋 Анализирую материалы для сценария...', progress: 40 });
        }

        const effectiveTopic = localVideoData
            ? `Video Demonstration & Speech: "${localVideoData.combinedSummary.slice(0, 700)}..."`
            : (screenshotData
                ? `Rules/Recipe/Tips from Screenshot: "${screenshotData.text.slice(0, 500)}..."`
                : (refData ? `Transcript from Reference Video (${refData.url}): "${refData.transcript.slice(0, 500)}..."` : (customInput || vlogTopic)));

        // Detect if topic is cooking/recipe-oriented → use extended 12-14 scene structure
        const isCookingTopic = /kitchen|cook|recipe|ingredient|food|meal|prep|cuisine|dish|bowl|salad|smoothie|juice|breakfast|lunch|dinner|snack|detox|bake|fry|boil|mix|blend|chop|slice|рецепт|ингредиент|готовить|блюдо|кулинария|еда|завтрак|обед|ужин|жарить|варить|печь|recette|cuisine|plat|repas|nourriture|cuisiner|ingrédient/i.test(effectiveTopic + ' ' + location);

        // Web search for fresh trends/recipes (triggered by checkbox "Искать свежие рецепты/тренды в сети")
        let webContext = '';
        if (useWebSearch) {
            if (event && event.sender) {
                event.sender.send('frenchtalk-progress', { status: '🔍 Ищу свежие рецепты и тренды в сети...', progress: 55 });
            }
            const searchTopic = customInput ? customInput.slice(0, 80) : vlogTopic;
            const searchQuery = isCookingTopic
                ? `recette tendance TikTok France "${searchTopic}" facile rapide 2024`
                : `tendances lifestyle beauté TikTok France "${searchTopic}" cette semaine`;
            try {
                webContext = await searchWeb(searchQuery);
                console.log(`[FrenchTalk Vlog] Web search done: ${webContext.length} chars returned`);
            } catch (e) {
                console.warn('[FrenchTalk Vlog] Web search failed, continuing without it:', e.message);
            }
        }

        if (event && event.sender) {
            event.sender.send('frenchtalk-progress', { status: '✍️ ИИ пишет сценарий Личного Влога Блогера...', progress: 75 });
        }

        const prompt = `You are a master viral scriptwriter for lifestyle, beauty, cooking, and girl secrets TikTok vlogs featuring ${bloggerName}, a chic, charming lifestyle blogger who is passionate about cooking techniques, delicious flavors, kitchen aesthetics, beauty, home comfort, and everyday girl secrets. She is a HOME COOK — not a nutritionist, not a dietitian. She NEVER talks about calories, macros, protein, or nutrition science.
${isCookingTopic && (customInput || localVideoData || screenshotData) ? `
🧑‍🍳 CULINARY EXPERT PERSONA (MANDATORY for this video): ${bloggerName} is a PASSIONATE AND SKILLED HOME CHEF — not just a lifestyle blogger who occasionally cooks. She has made this dish many times and knows it inside-out. She speaks with the confidence and authority of a culinary expert:
- She knows EXACTLY WHY each step matters: why you brown the meat first, when the oil is at the right temperature, when the onion is properly caramelized — and she explains it naturally while doing it
- She describes what she SEES (colour, texture, gloss), SMELLS (aromas blooming), HEARS (the sizzle, the bubble), and FEELS (pressing the dough, testing doneness)
- She uses precise culinary language naturally: sauté, deglaze, fold in, reduce, simmer, season to taste, rest before serving
- She shares insider chef tricks that separate a good dish from an extraordinary one
- She cites exact quantities and timings with authority: not "some garlic" but "two fat cloves, finely minced"
⚡ GOAL: After watching, the viewer thinks: "This girl REALLY knows how to cook — I'm making this today."
` : ''}
CHANNEL NICHE: Lifestyle, cooking recipes (focused on PROCESS & FLAVORS), beauty tips, aesthetic home routines, girls' secrets.
⛔ STRICTLY FORBIDDEN CONTENT: calories, caloric values, macros, proteins, carbs, fats, nutrition facts, diet talk, weight loss. ZERO tolerance — replacing any such mention with a sensory cooking detail instead.
VLOG THEME / TOPIC: "${vlogTopic}"
OUTFIT: "${outfit}"
LOCATION: "${location}"
LANGUAGE: ${language || 'French'}
CONTENT TYPE: ${isCookingTopic ? 'RECIPE / COOKING VLOG — use extended 12-14 scene structure below' : 'LIFESTYLE / BEAUTY / TIPS VLOG — use standard 9-line structure below'}

IMPORTANT — LOCATION RULE: Do NOT mention city names (Paris, Warsaw, London, etc.) or phrases like "my Parisian home / apartment / kitchen" in ANY line. Keep location references universal — just "my kitchen", "my room", "here at home", etc.

${localVideoData ? `\nUPLOADED VIDEO MATERIAL (SPEECH & ACTIONS) — ADAPT THIS EXACT ROUTINE OR RECIPE FOR ${bloggerName.toUpperCase()} IN ${language.toUpperCase()}:\n"""\n${localVideoData.combinedSummary}\n"""\n` : ''}
${screenshotData ? `\nSCREENSHOT CONTENT (OCR & RULES) — ADAPT THESE EXACT TIPS, RECIPE STEPS OR FACTS FOR ${bloggerName.toUpperCase()} IN ${language.toUpperCase()}:\n"""\n${screenshotData.text}\n"""\n` : ''}
${refData ? `\nREFERENCE VIDEO CONTENT — ADAPT THIS STORY OR RECIPE FOR ${bloggerName.toUpperCase()} IN ${language.toUpperCase()}:\n"""\n${refData.transcript}\n"""\n` : ''}
${(customInput && !localVideoData && !screenshotData && !refData) ? `\n🍳 FULL RECIPE DATA — THIS IS YOUR PRIMARY SOURCE. USE EVERY INGREDIENT WITH ITS EXACT QUANTITY AND EVERY STEP WITH ITS EXACT TIMING. DO NOT SKIP ANYTHING:\n"""\n${customInput}\n"""\n⚠️ MANDATORY: Every ingredient name and quantity (e.g. "½ cup of red wine", "1 tbsp of anchovy paste", "1.3 kg chicken cut into 8 pieces") MUST appear spoken aloud in a Vlog Action line. Every timing from the recipe (e.g. "8 minutes", "3 minutes", "10 minutes", "reduce for 2 minutes") MUST be spoken aloud in the matching Vlog Action line.\n` : ''}

══════════════════════════════════════
⚠️ CRITICAL RULES (apply to ALL content types):
1. THIS IS A SPOKEN VLOG SCRIPT. EVERY LINE IS REAL FIRST-PERSON SPOKEN DIALOGUE by ${bloggerName}. NO 3rd-person descriptions.
2. ${isCookingTopic
   ? `CULINARY & TASTE FOCUS IS MANDATORY: Every cooking vlog must naturally weave in at least 4-5 of these concrete elements:
   - Specific flavor notes (e.g. "a sweet and tangy kick")
   - Textural descriptions (e.g. "crispy on the outside, melting inside")
   - Cooking techniques and tools (e.g. "blanch in ice water to keep it bright green")
   - Exact cooking times and temperatures (e.g. "roast at 200 degrees for exactly 15 minutes")
   - Pro chef tricks or plating aesthetics (e.g. "finish with a drizzle of olive oil for a glossy shine")
   - ⛔ ABSOLUTE BAN: ZERO mentions of calories, caloric content, macros, proteins, carbs, fats, nutritional values, diet, or weight loss — in ANY line including the title hook. If you are tempted to say "320 calories" — replace it with a flavor or texture detail instead.`
   : `LIFESTYLE & BEAUTY FOCUS IS MANDATORY: Every lifestyle vlog must weave in these elements:
   - Practical everyday hacks (e.g. "this trick saves me 20 minutes every morning")
   - Beauty/style secrets (e.g. "apply this on damp skin to absorb better")
   - Home comfort aesthetics or practical steps
   - ⛔ ABSOLUTE BAN: ZERO mentions of calories, nutrition, diets, macros, or weight loss. You are a lifestyle/beauty blogger — NOT a nutritionist!`
}
3. NO empty aesthetic fluff. Every line must carry real, actionable value — ${isCookingTopic ? `a specific ingredient quantity, cooking technique, flavor description, or preparation step` : `a specific life hack, beauty trick, practical step, or product description`}.
4. HARD WORD COUNT LIMIT: EVERY LINE MUST CONTAIN 12 TO 22 WORDS (optimized for 8-second video clip). Count carefully!
5. NEVER mention city names or "Parisian" — keep location neutral.
6. EMOTIONAL PENDULUM (MANDATORY — alternating tension & relief each line):
   TENSION phrases — use in odd lines (1, 3, 5, 7, 9, 11): spark curiosity or suspense:
     "Mais attendez, ce n'est pas si simple...", "Et pourtant...", "Tu te demandes pourquoi ?",
     "Et là, attention !", "Mais voilà ce que personne ne te dit...", "Et ce n'est pas tout !",
     or their natural equivalent in the script language.
   RELIEF phrases — use in even lines (2, 4, 6, 8, 10, 12): resolve tension, give hope or a positive fact:
     "Bonne nouvelle !", "Et justement, j'ai la solution !", "C'est plus simple qu'on ne le croit !",
     "Et le résultat est bluffant !", "La bonne nouvelle, c'est que...",
     or their natural equivalent in the script language.
   RULE: Every line must naturally embed one such phrase or its emotional equivalent.

${isCookingTopic ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🍳 RECIPE / COOKING VLOG — EXTRA MANDATORY RULES:
R1. COOKING SHOW STYLE: Write like a home cook DOING the recipe live on camera — every line is a physical action, a sensory reaction, or a hands-on tip she is performing RIGHT NOW. NOT a food science class. NOT nutrition facts. The viewer must feel like they are standing in the kitchen with her.
R2. INGREDIENTS WITH EXACT QUANTITIES: EVERY ingredient from the recipe MUST be spoken aloud with its exact quantity (e.g. "half a teaspoon of dried thyme", "one tablespoon of olive oil", "half a cup of red wine"). Viewer must be able to shop and cook from what they hear.
R3. PREPARATION STEPS WITH TIMING: EVERY cooking step from the recipe MUST have its own Vlog Action line with exact timing (e.g. "I'm browning the chicken for exactly 8 minutes", "I sauté the onion and garlic for 3 minutes", "now I let it simmer covered for 10 minutes").
R4. SENSORY REACTIONS: At least 2 Blogger Comment lines must describe what she SEES, SMELLS, HEARS or TASTES during cooking (e.g. "the kitchen smells incredible right now", "look at that golden crust forming").
R5. SCENE COUNT IS FLEXIBLE — generate as many lines as needed to cover EVERY ingredient and EVERY step of the recipe. Minimum 12 lines. No maximum — if the recipe has many steps, use more lines. Always end with an Outro.
R6. EMOTIONAL WAVE — MANDATORY FOR BLOGGER COMMENT LINES ONLY (Vlog Action lines must stay recipe-accurate, no emotional connectors):
   Apply this tension→relief→tension pattern across Blogger Comment lines to keep viewers watching:
   🔴 TENSION openers (create suspense, curiosity, a "wait for it" feeling) — use in comments 2, 6, 10:
     FR: «Mais attention, ce n'est pas si simple...», «Et là, vous n'allez pas me croire...», «Et ce n'est pas tout !»
     EN: «But here's what nobody tells you...», «And this is where it gets interesting...», «But wait — there's more»
     RU: «Но не всё так просто...», «И вот тут начинаются вопросы...», «Обратите особое внимание на...», «И это ещё не всё»
   🟢 RELIEF openers (resolve tension, deliver the payoff, give a tip or good news) — use in comments 4, 8:
     FR: «Bonne nouvelle !», «Et justement, j'ai l'astuce !», «Et le résultat est bluffant !»
     EN: «Good news — this is actually easy», «Here's the trick», «And the result is incredible»
     RU: «К нашей радости...», «А вот сейчас самое важное», «Но есть и хорошая новость», «Забегая вперёд»
   🏆 PAYOFF opener — mandatory in comment 12 (tasting/finale moment):
     FR: «Et maintenant, LE moment de vérité...», «Et là — c'est à couper le souffle»
     EN: «And now — the moment you've been waiting for», «This is it.»
     RU: «А вот сейчас самое важное», «И вот в этот момент...», «И огорчает в этой ситуации только одно...»
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⛔ BANNED PATTERNS IN COOKING VLOG LINES (automatic failure if present):
- Any sentence starting with "This ingredient contains..." or "This releases..." or "This is rich in..."
- Any explanation of food science, chemistry, or nutrition
- Phrases like "essential oils", "umami depth", "nutritional value", "healthy fats", "antioxidants"
- Any reference to WHY something is healthy or good for the body
✅ INSTEAD: describe the SMELL, COLOR, SOUND, TEXTURE, or the PHYSICAL ACTION happening in the pan/oven/bowl RIGHT NOW.

STRUCTURE FOR RECIPE VLOG — FIRST-PERSON LIVE COOKING NARRATION:
📌 PATTERN: alternate Vlog Action → Blogger Comment → Vlog Action → Blogger Comment → ... → Outro
📌 Each Vlog Action = a concrete cooking step with exact ingredients, quantities, timings from the recipe.
📌 Each Blogger Comment = a sensory reaction, kitchen tip, or observation about what's happening RIGHT NOW.
📌 Cover EVERY step and ingredient from the recipe — do not skip any. Add more lines if necessary.

▶ LINE 1  — Vlog Action: ${bloggerName} names the dish, grabs the very first ingredient with its EXACT quantity, and starts cooking — what her hands are doing RIGHT NOW. 12-20 words. Example: "Today I'm making chicken provençal — I'm cutting 1.3 kg chicken into 8 pieces and seasoning with ¾ tsp salt and ½ tsp pepper right now."
▶ LINE 2  — Blogger Comment: Reacts to what she sees or smells in the pan — a sensory observation + one hands-on tip for this exact step. 12-22 words. Example: "That sizzling sound tells me the oil is hot enough — exactly 8 minutes per side for a perfect golden crust."
▶ LINE 3  — Vlog Action: ${bloggerName} adds the next ingredients OUT LOUD with exact quantities — what she is physically doing. 12-20 words. Example: "Now I add the finely chopped onion and 1 clove of garlic — stirring every 30 seconds for 3 minutes."
▶ LINE 4  — Blogger Comment: Describes a specific kitchen moment — color change, aroma, texture — that signals the step is done. 12-22 words. Example: "When the onion turns translucent and smells sweet and caramelized — that's my signal to pour in the wine."
▶ LINE 5  — Vlog Action: ${bloggerName} performs the next cooking step — names the action + exact quantity + timing from the recipe. 12-20 words. Example: "I pour in half a cup of red wine and let it bubble down for exactly 1-2 minutes."
▶ LINE 6  — Blogger Comment: Quick personal kitchen trick she does at this exact moment — a shortcut or a detail she notices. 12-22 words. Example: "My trick — I tilt the pan so the wine hits the hot edges and evaporates faster and more evenly!"
▶ LINE 7  — Vlog Action: ${bloggerName} adds the next layer of ingredients — names ALL of them with quantities, describes the action. 12-20 words. Example: "In go 1½ cups of canned tomatoes with juice, ½ tsp rosemary, ½ tsp thyme, ⅓ cup black olives, and 1 tsp anchovy paste."
▶ LINE 8  — Blogger Comment: Reacts to the transformation — what the dish looks, smells, sounds like right now. 12-22 words. Example: "The whole kitchen smells like Provence right now — the herbs are blooming and the sauce is turning deep ruby red."
▶ LINE 9  — Vlog Action: ${bloggerName} does the next key step with exact timing — covers, returns the protein, lowers heat. 12-20 words. Example: "I nestle the chicken thighs and legs back in, cover the pan, and simmer on low for exactly 10 minutes."
▶ LINE 10 — Blogger Comment: Describes the dish visually and aromatically right now — color, texture, how the protein looks. 12-22 words. Example: "Look at this sauce — it has turned deep ruby and the chicken is already pulling away from the bone gently."
▶ LINE 11 — Vlog Action: ${bloggerName} adds remaining pieces or finishes the final step with exact timing from the recipe. 12-20 words. Example: "Now I add the rest of the chicken pieces and cook everything together for another 10 minutes — then ¼ tsp more pepper."
▶ LINE 12 — Blogger Comment: Tasting moment — immediate authentic reaction describing one specific flavor she can taste right now. 12-22 words. Example: "I'm tasting it right now — the anchovy paste dissolved completely into the sauce and gave it an incredible depth of flavor."
▶ LINE 13 — Vlog Action: ${bloggerName} plates the dish — names what she serves alongside, describes what the plate looks like. 12-20 words. Example: "I serve it with crispy pan-fried potatoes — pour the ruby sauce over everything and finish with a rosemary sprig."
▶ (Continue with more Vlog Action / Blogger Comment as needed to cover every recipe step. Do NOT stop early.)
▶ FINAL LINE — Outro: Flirty, witty, personal call-to-action — save the recipe, subscribe, send a photo of their version. 10-18 words.`
: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 LIFESTYLE / TIPS VLOG — EXTRA MANDATORY RULES:
W1. SPECIFICITY: Every tip must include at least one concrete detail — a texture, a specific product property, duration in minutes, or exact lifehack step.
W2. ACTIONABILITY: Every line must describe something the viewer can do TODAY — practical advice, beauty secrets, or home hacks. NEVER mention diets, calories, or weight loss.
W3. GENERATE EXACTLY 9 LINES TOTAL (minimum 9).
W4. EMOTIONAL WAVE — MANDATORY FOR BLOGGER COMMENT LINES (Lines 2, 4, 6, 8):
   Alternate tension and relief across comment lines to keep viewers hooked:
   🔴 TENSION openers (lines 2, 6) — spark curiosity or reveal a surprising twist:
     FR: «Mais ce que personne ne te dit...», «Et pourtant, il y a un détail que tu rates»
     EN: «But here's what most people miss...», «And this is the part nobody tells you»
     RU: «Но не всё так просто...», «Как всегда, есть нюансы», «И вот тут начинаются вопросы», «Внимательные зрители могут заметить»
   🟢 RELIEF openers (lines 4, 8) — deliver the payoff, give a clear solution or memorable truth:
     FR: «Bonne nouvelle !», «Et la solution est plus simple qu'on croit»
     EN: «Good news — here's all you need», «And honestly? It changed everything»
     RU: «К нашей радости...», «А вот сейчас самое важное», «Очевидно, что...», «Конечно, есть и светлая сторона»
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STRUCTURE FOR LIFESTYLE VLOG (9 lines):
▶ LINE 1 — Vlog Action: ${bloggerName} introduces today's lifestyle/beauty topic with an intriguing hook + specific fact. 12-20 words.
▶ LINE 2 — Blogger Comment: First concrete girl secret or lifehack tip. 12-22 words.
▶ LINE 3 — Vlog Action: ${bloggerName} demonstrates or explains tip #2 — names a specific step or technique. 12-20 words.
▶ LINE 4 — Blogger Comment: Insight explaining WHY this trick works so well (e.g. saves time, feels incredible). 12-22 words.
▶ LINE 5 — Vlog Action: ${bloggerName} reveals tip #3 — a practical hack with a concrete result. 12-20 words.
▶ LINE 6 — Blogger Comment: Another surprising fact or personal secret about this routine. 12-22 words.
▶ LINE 7 — Vlog Action: ${bloggerName} shows or demonstrates the final tip — makes it visual and actionable. 12-20 words.
▶ LINE 8 — Blogger Comment: Final punchy summary — one memorable truth the viewer will remember and share. 12-22 words.
▶ LINE 9 — Outro: Flirty, witty call-to-action asking for likes & subscribe. 10-18 words.`}
══════════════════════════════════════

Format EXACTLY as:
Speaker: [direct spoken text]
Where Speaker is "Vlog Action" or "Blogger Comment" or "Outro".

Output ONLY the direct spoken script lines in ${language}.`;

        const fullPrompt = webContext
            ? prompt + `\n\n🌐 FRESH WEB CONTEXT — CURRENT TRENDS & RECIPES FROM THE INTERNET (use this as inspiration and up-to-date reference, but ALWAYS adapt to ${bloggerName}'s voice and the given topic/recipe — do NOT copy verbatim):\n"""\n${webContext}\n"""\n`
            : prompt;

        const scriptRaw = await ai.chat([{ role: 'user', content: fullPrompt }], false);

        // ── Chef Inspector ──────────────────────────────────────────────────────
        // Automatically validates culinary accuracy before translation & video gen.
        // Runs only for cooking topics; falls back to original script on error.
        let finalScript = scriptRaw;
        if (isCookingTopic) {
            if (event && event.sender) {
                event.sender.send('frenchtalk-progress', { status: '👨‍🍳 Шеф-повар инспектирует рецепт...', progress: 85 });
            }
            try {
                const chefInspectionPrompt = `You are a Michelin-trained French culinary expert and recipe fact-checker. Your ONLY job is to silently fix factual culinary errors in this vlog script.

SCRIPT TO INSPECT:
"""
${scriptRaw}
"""

FIX ONLY these types of errors (leave everything else untouched):
1. Wrong culinary science explanations — e.g. claiming starch "prevents cream from binding" is wrong; excess starch makes cream gluey/pasty, not less bound. Fix the explanation to be accurate.
2. Incorrect technique descriptions — wrong reason given for a cooking step, wrong method described.
3. Impossible or implausible ingredient quantities or ratios.
4. Wrong cooking temperatures or times for the specific dish.
5. Illogical cooking step order.
6. Factually wrong taste, texture, or aroma claims.

DO NOT change:
- Format: "Vlog Action: ..." / "Blogger Comment: ..." / "Outro: ..."
- Number of lines — same count must be preserved
- Emotional tone, style, tension/relief structure, word choice — unless a word is factually wrong
- Anything that is culinarily correct

If everything is correct — return the script exactly as-is, unchanged.
Output ONLY the corrected script. No preamble, no explanation, no notes.`;

                const inspected = await ai.chat([{ role: 'user', content: chefInspectionPrompt }], false);
                if (inspected && inspected.trim().length > 100) {
                    finalScript = inspected.trim();
                    console.log('[FrenchTalk Vlog] ✅ Chef inspection passed');
                }
            } catch (e) {
                console.warn('[FrenchTalk Vlog] Chef inspection failed — using original script:', e.message);
            }
        }
        // ────────────────────────────────────────────────────────────────────────

        // Translate to Russian
        let scriptRu = '';
        try {
            const translationPrompt = `Translate this vlog script to Russian line-by-line. Keep the exact format "Speaker: Translation".\n\nScript:\n${finalScript}`;
            scriptRu = await ai.chat([{ role: 'user', content: translationPrompt }], false);
        } catch (e) {
            console.error('[FrenchTalk Vlog] Translation failed:', e.message);
        }

        // Generate TikTok Metadata (Title, Description, Hashtags)
        let tiktokMetadata = { title: '', description: '', hashtags: '' };
        try {
            const metadataPrompt = `Based on this vlog script, generate metadata for TikTok.
Script:
${finalScript}

⛔ STRICT RULES FOR METADATA:
- NEVER include calories, caloric values, macros, nutrition facts, proteins, carbs, fats, or any diet/weight-loss language in the title or description.
- The title must highlight the DISH NAME and a sensory hook (flavor, texture, technique, ease) — NOT calorie counts.
- The description must focus on the cooking experience, flavors, or a culinary tip — NOT nutritional content.
- GOOD title example: "Crêpes roulées au fromage fondu et légumes — la recette parfaite du soir ! 🌯"
- BAD title example: "Crêpes 320 cal : la recette saine !" ← FORBIDDEN

Output EXACTLY in this JSON format, nothing else:
{
  "title": "A catchy short title for the video (in ${language || 'French'}) — dish name + flavor/technique hook, NO calories",
  "description": "A 1-2 sentence description for the TikTok caption (in ${language || 'French'}) — cooking process or taste focused, NO nutrition numbers",
  "hashtags": "#recette #cuisine #etc (4-6 relevant hashtags)"
}`;
            const metadataRaw = await ai.chat([{ role: 'user', content: metadataPrompt }], true);
            const match = metadataRaw.match(/\{[\s\S]*\}/);
            if (match) {
                tiktokMetadata = JSON.parse(match[0]);
            }
        } catch (e) {
            console.error('[FrenchTalk Vlog] Metadata generation failed:', e.message);
        }

        return {
            script: finalScript.trim(),
            scriptRu: scriptRu.trim(),
            metadata: tiktokMetadata
        };
    });

    let STREAM_PACK_DAYS = {
        Monday: {
            labelRu: 'Понедельник',
            outfit: 'cozy beige knitted oversized sweater',
            outfitRu: 'Уютный бежевый вязаный оверсайз свитер',
            location: 'cozy living room couch, warm soft ambient home lamp lighting, aesthetic interior',
            locationRu: 'Уютная гостиная, диван, теплое домашнее освещение'
        },
        Tuesday: {
            labelRu: 'Вторник',
            outfit: 'elegant white silk top with delicate shoulder straps',
            outfitRu: 'Шелковый топ у окна',
            location: 'modern apartment window with morning natural sun rays, high-rise view in Paris',
            locationRu: 'У окна с утренним естественным светом'
        },
        Wednesday: {
            labelRu: 'Среда',
            outfit: 'stylish linen kitchen apron over a simple casual t-shirt',
            outfitRu: 'Кухонный фартук',
            location: 'bright modern Parisian kitchen with coffee maker and aesthetic marble countertop',
            locationRu: 'Современная светлая кухня'
        },
        Thursday: {
            labelRu: 'Четверг',
            outfit: 'sophisticated chic black button-up blouse',
            outfitRu: 'Черная элегантная блуза',
            location: 'aesthetic home office study with bookshelves, soft background bokeh lamp',
            locationRu: 'Домашний кабинет с книжными полками'
        },
        Friday: {
            labelRu: 'Пятница',
            outfit: 'glamorous deep-red silk evening dress',
            outfitRu: 'Вечернее платье на диване с вином',
            location: 'relaxing on a plush sofa with a crystal glass of red wine on the side table, evening intimate ambient mood lighting',
            locationRu: 'Уютный диван, вечернее освещение, бокал вина'
        },
        Saturday: {
            labelRu: 'Суббота',
            outfit: 'luxurious satin sleepwear pajamas set',
            outfitRu: 'Шелковая пижама в спальне',
            location: 'cozy master bedroom, warm bedding, relaxed weekend morning atmosphere',
            locationRu: 'Уютная спальня, атмосфера выходного дня'
        },
        Sunday: {
            labelRu: 'Воскресенье',
            outfit: 'sport-chic activewear outfit, stylish beige fitness zip hoodie',
            outfitRu: 'Спорт-шик на балконе',
            location: 'sunny apartment Parisian balcony overlooking rooftops and plants, fresh open-air natural lighting',
            locationRu: 'Солнечный балкон с растениями и видом на крыши'
        }
    };

    const streamDaysFile = path.join(FRENCHTALK_DIR, 'stream_pack_days.json');
    if (fs.existsSync(streamDaysFile)) {
        try {
            const loaded = JSON.parse(fs.readFileSync(streamDaysFile, 'utf8'));
            STREAM_PACK_DAYS = Object.assign(STREAM_PACK_DAYS, loaded);
        } catch (e) {
            console.warn('[StreamPacks] Could not load custom stream_pack_days.json:', e.message);
        }
    }

    const IDLE_ACTIONS = [
        { descEn: "Looking straight into camera with a warm gentle smile, subtly nodding and blinking naturally.", descRu: "Смотрит в камеру с теплой улыбкой, легкий кивок, естественная мимика." },
        { descEn: "Gently tucking a strand of hair behind ear while smiling softly at the stream audience.", descRu: "Поправляет прядь волос за ухо, нежно улыбаясь зрителям." },
        { descEn: "Holding a favorite coffee mug, taking a gentle sip, holding warm eye contact with camera.", descRu: "Держит чашку кофе, делает глоток, поддерживая визуальный контакт." },
        { descEn: "Looking down at smartphone in hands, scrolling slightly, then glancing up at camera with a bright smile.", descRu: "Листает телефон в руках, затем поднимает взгляд на камеру с улыбкой." },
        { descEn: "Subtly adjusting posture, resting chin gracefully on hand, looking directly at camera with charming gaze.", descRu: "Подпирает подбородок рукой, очаровательный взгляд прямо в камеру." },
        { descEn: "Checking reflection in camera preview, giving a cute quick playful expression and tender smile.", descRu: "Оценивающе смотрит в камеру, милое игривое выражение лица." },
        { descEn: "Relaxed thoughtful expression, looking slightly off-camera then turning bright eyes straight to viewer.", descRu: "Задумчивый взгляд в сторону, затем перевод взгляда прямо на зрителя." },
        { descEn: "Soft gentle laugh without opening mouth wide, cheerful and pleasant welcoming demeanor.", descRu: "Мягкая тихая улыбчивая реакция, доброжелательная мимика без слов." },
        { descEn: "Gently stretching shoulders while seated comfortably, enjoying the cozy stream atmosphere.", descRu: "Уютно устраивается, комфортная расслабленная атмосфера стрима." },
        { descEn: "Holding a cup of tea, warming hands on it, looking down in peace then smiling at viewer.", descRu: "Греет руки о чашку, мирно смотрит на зрителей." },
        { descEn: "Subtly adjusting collar or sleeves of outfit, keeping elegant posture and friendly eye contact.", descRu: "Поправляет одежду, элегантная осанка, дружелюбный взгляд." },
        { descEn: "Peaceful steady eye contact with chat, slow gentle blinking, quiet listening expression.", descRu: "Внимательный взгляд в камеру, слушающая мимика, легкое моргание." }
    ];

    const FALLBACK_TALKING_REPLIES = [
        { text: "Honnêtement, mon secret pour rester de bonne humeur à Paris, c'est un bon croissant au beurre le matin !", ru: "Честно говоря, мой секрет хорошего настроения в Париже — это свежий масляный круассан по утрам!" },
        { text: "Vous trouvez pas que la météo aujourd'hui est parfaite pour rester au chaud à papoter avec vous ?", ru: "Не кажется ли вам, что погода сегодня просто идеальная, чтобы сидеть в тепле и болтать с вами?" },
        { text: "Oh là là, regarde ce commentaire dans le chat ! T'es vraiment trop mignon d'écrire ça !", ru: "Ого, посмотри на этот комментарий в чате! Ты невероятно милый, что пишешь такое!" },
        { text: "Alors dites-moi dans le chat, qui parmi vous a déjà eu l'occasion de visiter les rues de Paris ?", ru: "Ну-ка расскажите в чате, кто из вас уже успел побывать на улочках Парижа?" },
        { text: "J'hésite encore entre boire un thé au jasmin ou un grand chocolat chaud ce soir, un conseil ?", ru: "Я всё ещё сомневаюсь, выпить ли вечером жасминовый чай или горячий шоколад, что посоветуете?" },
        { text: "Pour moi, le style parisien c'est avant tout de se sentir élégante tout en restant hyper à l'aise !", ru: "Для меня парижский стиль — это прежде всего чувствовать себя элегантно, оставаясь при этом в полном комфорте!" },
        { text: "Arrêtez de me taquiner sur ma passion pour la pâtisserie française, c'est mon seul vrai péché mignon !", ru: "Хватит дразнить меня из-за моей страсти к французской выпечке, это моя единственная слабость!" },
        { text: "Si tu passes une journée un peu difficile, rappelle-toi que demain est une toute nouvelle aventure !", ru: "Если у тебя сегодня выдался тяжёлый день, помни, что завтра начнётся совершенно новое приключение!" },
        { text: "Regardez l'ambiance lumineuse ici, c'est tellement cosy pour discuter tranquillement entre amis ce soir !", ru: "Посмотрите на это уютное освещение, здесь так здорово спокойно болтать по душам сегодняшним вечером!" },
        { text: "C'est fou comme le temps passe vite quand on s'amuse bien ensemble, vous me donnez tellement d'énergie !", ru: "С ума сойти, как быстро летит время, когда нам так весело вместе, вы дарите мне столько энергии!" },
        { text: "Quel est votre film ou série préférée du moment ? J'ai vraiment besoin de recommendations pour ce soir !", ru: "Какой у вас любимый фильм или сериал прямо сейчас? Мне срочно нужны рекомендации на вечер!" },
        { text: "Franchement, j'adore trop vos questions ce soir, vous avez toujours un sens de l'humour incroyable !", ru: "Честно говоря, обожаю ваши вопросы сегодня вечером, у вас просто потрясающее чувство юмора!" },
        { text: "Le meilleur conseil beauté que je puisse vous donner, c'est de sourire de tout votre cœur chaque jour !", ru: "Лучший совет по красоте, который я могу дать — это каждый день улыбаться от всего сердца!" },
        { text: "Un jour, il faudrait absolument qu'on organise une grande rencontre IRL dans un charmant café parisien !", ru: "Однажды нам обязательно нужно устроить настоящую встречу в каком-нибудь очаровательном парижском кафе!" },
        { text: "Je regarde souvent les toits de Paris et je me dis à quel point cette ville est pleine de magie.", ru: "Я часто смотрю на крыши Парижа и понимаю, насколько же этот город наполнен магией." },
        { text: "Merci à tous ceux qui viennent d'arriver dans le live, installez-vous confortablement, vous êtes chez vous !", ru: "Спасибо всем, кто только что присоединился к эфиру, устраивайтесь поудобнее, чувствуйте себя как дома!" },
        { text: "Est-ce que vous aussi vous avez des petites habitudes bizarres le soir ? Avouez tout dans le chat !", ru: "А у вас тоже есть забавные вечерние привычки? Признавайтесь честно в чате!" },
        { text: "Ce que j'aime le plus dans notre communauté, c'est toute cette bienveillance et ce positif au quotidien !", ru: "Что я больше всего ценю в нашем сообществе — это постоянную доброжелательность и ежедневный позитив!" },
        { text: "Je vous prépare une surprise trop sympa pour le prochain épisode de vlogs, vous n'êtes pas prêts !", ru: "Я готовлю для вас невероятно классный сюрприз в следующем влоге, вы даже не представляете!" },
        { text: "Allez, envoyez-moi tous des petits cœurs dans le chat pour qu'on fasse réchauffer la soirée !", ru: "Давайте, отправляйте мне миллионы сердечек в чате, чтобы согреть наш сегодняшний вечер!" }
    ];

    const FALLBACK_GIFT_REACTIONS = [
        { text: "Oh mon dieu ! Ce cadeau est juste incroyable ! Tu es une vraie merveille, je t'envoie mille bisous !", ru: "О боже мой! Этот подарок просто невероятен! Ты настоящее чудо, отправляю тебе тысячу поцелуев!" },
        { text: "Wouah, je n'en reviens pas ! Merci du fond du cœur pour ta générosité exceptionnelle, tu as illuminé ma soirée !", ru: "Вау, глазам не верю! Спасибо от всего сердца за твою невероятную щедрость, ты сделал мой вечер!" },
        { text: "Mais quelle incroyable surprise ! Tu es officiel mon coup de cœur du stream ce soir, un immense merci !", ru: "Какой потрясающий сюрприз! Ты официально любимец нашего сегодняшнего стрима, огромное спасибо!" },
        { text: "Olala, tu me chouchoutes beaucoup trop là ! Ça me touche énormément, gros câlin viruel à toi !", ru: "Ого, ты меня просто невероятно балуешь! Меня это так тронуло, обнимаю тебя крепко-крепко!" },
        { text: "C'est folie totale ! Merci pour ce super don, tu me donnes un sourire radieux pour tout le reste de la semaine !", ru: "Это просто безумие! Спасибо за этот шикарный донат, ты подарил мне лучезарную улыбку на всю неделю!" },
        { text: "Un geste aussi adorable, ça me fait fondre direct ! T'es vraiment une superstar absolue dans mon cœur !", ru: "Такой очаровательный жест заставляет меня просто таять! Ты настоящая суперзвезда в моём сердце!" }
    ];

    ipcMain.handle('frenchtalk-save-streampack-days-info', async (event, updatedDaysInfo) => {
        const toSave = JSON.parse(JSON.stringify(updatedDaysInfo));
        for (const d of Object.keys(toSave)) {
            delete toSave[d].bgRoomBase64;
            delete toSave[d].sceneBase64;
        }
        STREAM_PACK_DAYS = Object.assign(STREAM_PACK_DAYS, toSave);
        const file = path.join(FRENCHTALK_DIR, 'stream_pack_days.json');
        fs.writeFileSync(file, JSON.stringify(STREAM_PACK_DAYS, null, 2), 'utf8');
        return { success: true, daysInfo: STREAM_PACK_DAYS };
    });

    ipcMain.handle('frenchtalk-get-streampacks', async () => {
        const result = {};
        const daysInfoWithImages = JSON.parse(JSON.stringify(STREAM_PACK_DAYS));
        for (const [day, info] of Object.entries(daysInfoWithImages)) {
            const dir = path.join(FRENCHTALK_DIR, `StreamPack_${day}`);
            const imagesDir = path.join(dir, 'images');
            const bgRoomPath = path.join(imagesDir, `bg_room_${day}.jpg`);
            if (fs.existsSync(bgRoomPath)) {
                try { info.bgRoomBase64 = `data:image/jpeg;base64,${fs.readFileSync(bgRoomPath, 'base64')}`; } catch(e){}
            } else {
                info.bgRoomBase64 = null;
            }
            const scenePath = path.join(imagesDir, `pro_home_scene_${day}.jpg`);
            if (fs.existsSync(scenePath)) {
                try { info.sceneBase64 = `data:image/jpeg;base64,${fs.readFileSync(scenePath, 'base64')}`; } catch(e){}
            } else {
                info.sceneBase64 = null;
            }

            const jsonPath = path.join(dir, 'pack_data.json');
            if (fs.existsSync(jsonPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
                    for (const clip of data.clips || []) {
                        if (clip.videoPath && fs.existsSync(clip.videoPath)) {
                            if (!clip.videoBase64) {
                                const b64 = fs.readFileSync(clip.videoPath).toString('base64');
                                clip.videoBase64 = `data:video/mp4;base64,${b64}`;
                            }
                        } else {
                            clip.videoPath = null;
                            clip.videoBase64 = null;
                            if (clip.status === 'done' || clip.status === 'generating') clip.status = 'idle';
                        }
                    }
                    result[day] = data;
                } catch (e) {
                    console.error(`[FrenchTalk StreamPacks] Failed to read ${day}:`, e.message);
                    result[day] = null;
                }
            } else {
                result[day] = null;
            }
        }
        return { packs: result, daysInfo: daysInfoWithImages };
    });

    ipcMain.handle('frenchtalk-generate-streampack-script', async (event, { day }) => {
        const dayInfo = STREAM_PACK_DAYS[day];
        if (!dayInfo) throw new Error(`Неизвестный день недели: ${day}`);

        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен. Сначала создайте персонажа в вкладке Blogger Setup.');

        const dir = path.join(FRENCHTALK_DIR, `StreamPack_${day}`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const imagesDir = path.join(dir, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        event.sender.send('frenchtalk-progress', { status: `🔴 Генерирую французские стримерские реплики для ${dayInfo.labelRu}...`, progress: 30 });

        const prompt = `You are a professional comedy and script writer for a viral AI live streamer named ${blogger.name}, a charismatic, young French woman broadcasting live from her home in Paris on a ${day} (${dayInfo.labelRu}).
She is wearing: ${dayInfo.outfit}. Setting: ${dayInfo.location}.

CRITICAL INSTRUCTION FOR CREATIVE VARIETY:
Do NOT repeat phrases, structure, or topics! Every single reply must cover a completely DIFFERENT topic, emotion, and conversational situation. Avoid boring generic thank-yous. Make them rich, lively, intimate, funny, sassy, and genuinely engaging!

Generate exactly:
1. "talking_replies": 15 short French spoken replies to imaginary chat viewers (10 to 18 words each). Each must follow a distinct theme:
   - Reply 1: Commenting on her outfit or style of the day.
   - Reply 2: A playful reaction to a flirtatious or humorous chat comment.
   - Reply 3: Sharing a Parisian daily life observation or cafe adventure.
   - Reply 4: Asking viewers about their favorite hobby or mood today.
   - Reply 5: A witty piece of girl advice or lifestyle philosophy.
   - Reply 6: Talking about French food, wine, coffee, or pastries.
   - Reply 7: Teasing an upcoming mystery project or travel plan.
   - Reply 8: Reacting to the relaxing vibe of her room/setting right now.
   - Reply 9: Sassy commentary on modern relationships or dating in Paris.
   - Reply 10: Sending warmth and encouragement to someone feeling down.
   - Reply 11: A cute joke or playful confession about her weekend habits.
   - Reply 12: Responding to a question about French culture or romance.
   - Reply 13: Asking fans to guess her secret talent or dream destination.
   - Reply 14: Commenting on music, books, or a movie she loves.
   - Reply 15: Sending a cozy evening or morning blessing to all viewers.

2. "gift_reactions": 3 excited French gift/donation thank-you expressions (10 to 16 words each). Each must have a different energetic tone:
   - Reaction 1: Romantic & flirtatious (air kisses, sweet adoration).
   - Reaction 2: Explosive joy & shock (overwhelmed gratitude, laughing).
   - Reaction 3: Playful VIP honor (proclaiming the donor a superstar or champion of the chat).

Output ONLY valid JSON:
{
  "talking_replies": [
    { "text": "..." }
  ],
  "gift_reactions": [
    { "text": "..." }
  ]
}`;

        let talkingReplies = [];
        let giftReactions = [];

        try {
            const raw = await ai.chat([{ role: 'user', content: prompt }], true);
            const clean = raw.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
            const jsonMatch = clean.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                talkingReplies = (parsed.talking_replies || []).slice(0, 15);
                giftReactions = (parsed.gift_reactions || []).slice(0, 3);
            }
        } catch (e) {
            console.error('[FrenchTalk StreamPacks] AI prompt error:', e.message);
        }

        // Fill creatively varied defaults if model returned fewer or failed
        let fallbackTalkIdx = 0;
        while (talkingReplies.length < 15) {
            const fallback = FALLBACK_TALKING_REPLIES[fallbackTalkIdx % FALLBACK_TALKING_REPLIES.length];
            if (!talkingReplies.some(r => r.text === fallback.text)) {
                talkingReplies.push({ text: fallback.text, translationRu: fallback.ru });
            }
            fallbackTalkIdx++;
            if (fallbackTalkIdx > 100) break;
        }
        let fallbackGiftIdx = 0;
        while (giftReactions.length < 3) {
            const fallback = FALLBACK_GIFT_REACTIONS[fallbackGiftIdx % FALLBACK_GIFT_REACTIONS.length];
            if (!giftReactions.some(r => r.text === fallback.text)) {
                giftReactions.push({ text: fallback.text, translationRu: fallback.ru });
            }
            fallbackGiftIdx++;
            if (fallbackGiftIdx > 50) break;
        }

        const untranslatedTalk = talkingReplies.filter(r => !r.translationRu);
        const untranslatedGift = giftReactions.filter(r => !r.translationRu);
        const allSpokenToTranslate = [...untranslatedTalk.map(r => r.text), ...untranslatedGift.map(r => r.text)];

        if (allSpokenToTranslate.length > 0) {
            event.sender.send('frenchtalk-progress', { status: `🌐 Перевожу новые реплики на русский язык...`, progress: 70 });
            const transPrompt = `Translate these ${allSpokenToTranslate.length} short French sentences into Russian line by line. Keep exact cheerful and playful tone.
Return ONLY a valid JSON array of ${allSpokenToTranslate.length} string translations in exact matching order:
${JSON.stringify(allSpokenToTranslate, null, 2)}`;

            let translations = [];
            try {
                const transRaw = await ai.chat([{ role: 'user', content: transPrompt }], true);
                const cleanTrans = transRaw.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
                const arrMatch = cleanTrans.match(/\[[\s\S]*\]/);
                if (arrMatch) {
                    translations = JSON.parse(arrMatch[0]);
                }
            } catch (e) {
                console.error('[FrenchTalk StreamPacks] Translation error:', e.message);
            }

            let tIdx = 0;
            for (let i = 0; i < untranslatedTalk.length; i++) {
                untranslatedTalk[i].translationRu = translations[tIdx++] || 'Авто-перевод недоступен';
            }
            for (let i = 0; i < untranslatedGift.length; i++) {
                untranslatedGift[i].translationRu = translations[tIdx++] || 'Спасибо огромное за подарок!';
            }
        }

        const clips = [];
        for (let i = 0; i < 12; i++) {
            clips.push({
                index: i,
                role: 'idle_loop',
                text: IDLE_ACTIONS[i].descEn,
                translationRu: IDLE_ACTIONS[i].descRu,
                words: 0,
                status: 'idle',
                videoPath: null,
                videoBase64: null
            });
        }
        for (let i = 0; i < 15; i++) {
            clips.push({
                index: 12 + i,
                role: 'talking_reply',
                text: talkingReplies[i].text,
                translationRu: talkingReplies[i].translationRu,
                words: talkingReplies[i].text.split(/\s+/).length,
                status: 'idle',
                videoPath: null,
                videoBase64: null
            });
        }
        for (let i = 0; i < 3; i++) {
            clips.push({
                index: 27 + i,
                role: 'gift_reaction',
                text: giftReactions[i].text,
                translationRu: giftReactions[i].translationRu,
                words: giftReactions[i].text.split(/\s+/).length,
                status: 'idle',
                videoPath: null,
                videoBase64: null
            });
        }

        const packData = { day, labelRu: dayInfo.labelRu, outfit: dayInfo.outfit, outfitRu: dayInfo.outfitRu, location: dayInfo.location, locationRu: dayInfo.locationRu, clips };
        fs.writeFileSync(path.join(dir, 'pack_data.json'), JSON.stringify(packData, null, 2));
        event.sender.send('frenchtalk-progress', { status: '', progress: 0 });

        return packData;
    });

    ipcMain.handle('frenchtalk-generate-streampack-image', async (event, { day, type }) => {
        const dayInfo = STREAM_PACK_DAYS[day];
        if (!dayInfo) throw new Error(`Неизвестный день недели: ${day}`);

        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен. Сначала создайте персонажа в вкладке Blogger Setup.');

        const dir = path.join(FRENCHTALK_DIR, `StreamPack_${day}`);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const imagesDir = path.join(dir, 'images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const cleanupTemp = () => {
            if (fs.existsSync(imagesDir)) {
                fs.readdirSync(imagesDir).forEach(f => {
                    if (f.includes('_temp') || f.includes('temp1')) {
                        try { fs.unlinkSync(path.join(imagesDir, f)); } catch (e) {}
                    }
                });
            }
        };

        if (type === 'room') {
            console.log(`[StreamPacks] Generating background room image for ${day}...`);
            event.sender.send('frenchtalk-progress', { status: `🖼️ Генерирую уютный интерьер комнаты для ${dayInfo.labelRu}...`, progress: 50 });
            const bgImgPath = path.join(imagesDir, `bg_room_${day}.jpg`);
            const bgPrompt = `Architectural interior photography of a classic cozy Parisian home room: ${dayInfo.location}. Still-life photograph showing only interior design, residential sofa or furniture, decorations, indoor plants, and warm ambient room lamp lighting. Architectural showroom display of an unpopulated residential room, vertical 9:16 aspect ratio, cinematic cozy lighting.`;
            try {
                const bgPaths = await ai.generateImage({
                    prompt: bgPrompt,
                    aspectRatio: '9:16',
                    sectionDir: imagesDir,
                    sceneIndex: `bg_room_${day}_temp_${Date.now()}`
                });
                const genBgPath = Array.isArray(bgPaths) ? bgPaths[0] : bgPaths;
                if (genBgPath && fs.existsSync(genBgPath)) {
                    fs.copyFileSync(genBgPath, bgImgPath);
                }
                cleanupTemp();
            } catch (e) {
                cleanupTemp();
                throw new Error(`Ошибка генерации комнаты: ${e.message}`);
            }
            if (!fs.existsSync(bgImgPath)) {
                throw new Error(`Не удалось сохранить изображение комнаты для ${dayInfo.labelRu}.`);
            }
            event.sender.send('frenchtalk-progress', { status: '', progress: 0 });
            return { success: true, bgRoomBase64: `data:image/jpeg;base64,${fs.readFileSync(bgImgPath, 'base64')}` };
        } 
        else if (type === 'scene') {
            const bgImgPath = path.join(imagesDir, `bg_room_${day}.jpg`);
            if (!fs.existsSync(bgImgPath)) {
                throw new Error(`Сначала сгенерируйте интерьер комнаты! Ниже нажмите кнопку «Создать комнату».`);
            }

            let refImgPath = blogger.imagePath;
            if (!refImgPath || !fs.existsSync(refImgPath)) {
                const bloggerImgDir = path.join(FRENCHTALK_DIR, 'BloggerImages');
                if (fs.existsSync(bloggerImgDir)) {
                    const files = fs.readdirSync(bloggerImgDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f) && !f.startsWith('stranger'));
                    if (files.length > 0) refImgPath = path.join(bloggerImgDir, files[0]);
                }
            }
            if (!refImgPath || !fs.existsSync(refImgPath)) {
                throw new Error('Базовый реф-image блогера не найден в Blogger Setup.');
            }

            const hostImgBase64 = fs.readFileSync(refImgPath, 'base64');
            const roomImgBase64 = fs.readFileSync(bgImgPath, 'base64');

            console.log(`[StreamPacks] Generating pro camera home scene start image for ${day}...`);
            event.sender.send('frenchtalk-progress', { status: `📸 Создаю профессиональный кадр (Hasselblad X2D, реализм кожи и света) дома для ${dayInfo.labelRu}...`, progress: 50 });

            const masterScenePath = path.join(imagesDir, `pro_home_scene_${day}.jpg`);
            const refImgsForMaster = [{ data: hostImgBase64 }, { data: roomImgBase64 }];

            const masterPrompt = `INSTRUCTION FOR REFERENCE IMAGES: You must maintain 100% exact facial identity, face anatomy, blonde hair color, facial features, and body structure of the female blogger from the FIRST reference image. The SECOND reference image is strictly the interior room background and atmosphere behind her.

SUBJECT & FRAMING: A hyperrealistic vertical 9:16 influencer livestream portrait of the exact same young beautiful French woman from the first reference image. Prominent close-to-medium conversational portrait framing, filling the foreground of the shot as she sits comfortably on her couch in her Parisian home (${dayInfo.location}). She is looking straight into the camera lens with a warm, cheerful, inviting smile.
OUTFIT: She is wearing exactly: ${dayInfo.outfit}.
REALISM & DETAILS: Skin with visible micro-texture, natural pores, subtle sebaceous shine, soft subsurface scattering (SSS), natural lip texture with vertical striations, moist corneas. Hyperrealistic eyes: depth and wetness of iris, micro-reflections in cornea, natural eyelid crease, individual eyelashes with natural variation.
CAMERA & LENS: Shot on Hasselblad X2D with 80mm f/1.4 portrait lens (wide-open f/1.4 aperture for ultra shallow depth of field), medium format rendering, film-like micro-contrast, prominent 3D subject pop with clean separation from the background.
LIGHTING & DEPTH OF FIELD: Lit by soft window light and warm ambient room lamps, wraparound fill light, natural skin gradients without harsh specular highlights, catchlight in eyes from indoor window reflection. Cinematic shallow depth of field with realistic optical background blur: while the woman in the foreground is razor-sharp down to every micro-detail of her eyelashes and skin, the entire interior living room behind her (walls, paintings, plants, lamp, curtain, window from the second reference image) is gently and beautifully out of focus (softened with creamy optical background blur at f/1.4 and warm practical light bokeh balls). Professional award-winning photography quality, artistic optical separation between sharp foreground subject and soft blurred ambient background. ${CINEMATIC_MODIFIERS}`;

            try {
                const masterPaths = await ai.generateImage({
                    prompt: masterPrompt,
                    aspectRatio: '9:16',
                    sectionDir: imagesDir,
                    sceneIndex: `pro_home_scene_${day}_temp_${Date.now()}`,
                    referenceImages: refImgsForMaster
                });
                const genMasterPath = Array.isArray(masterPaths) ? masterPaths[0] : masterPaths;
                if (genMasterPath && fs.existsSync(genMasterPath)) {
                    fs.copyFileSync(genMasterPath, masterScenePath);
                }
                cleanupTemp();
            } catch (e) {
                cleanupTemp();
                throw new Error(`Ошибка генерации сцены на диване: ${e.message}`);
            }
            if (!fs.existsSync(masterScenePath)) {
                throw new Error(`Не удалось сохранить кадр на диване для ${dayInfo.labelRu}.`);
            }
            event.sender.send('frenchtalk-progress', { status: '', progress: 0 });
            return { success: true, sceneBase64: `data:image/jpeg;base64,${fs.readFileSync(masterScenePath, 'base64')}` };
        }
        throw new Error(`Неизвестный тип картинки: ${type}`);
    });

    ipcMain.handle('frenchtalk-generate-streampack-clip', async (event, { day, clipIndex, videoModel = 'omni_flash', aspectRatio = '9:16' }) => {
        const dayInfo = STREAM_PACK_DAYS[day];
        if (!dayInfo) throw new Error(`Неизвестный день недели: ${day}`);

        const blogger = getBlogger();
        if (!blogger) throw new Error('Блогер не настроен.');

        const dir = path.join(FRENCHTALK_DIR, `StreamPack_${day}`);
        const jsonPath = path.join(dir, 'pack_data.json');
        if (!fs.existsSync(jsonPath)) throw new Error(`Сначала сгенерируйте сценарий для ${dayInfo.labelRu}`);

        const packData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const clip = packData.clips.find(c => c.index === clipIndex);
        if (!clip) throw new Error(`Клип №${clipIndex + 1} не найден в пакете.`);

        const imagesDir = path.join(dir, 'images');
        const masterScenePath = path.join(imagesDir, `pro_home_scene_${day}.jpg`);
        if (!fs.existsSync(masterScenePath)) {
            throw new Error(`⚠️ Референсная картинка сцены с девушкой еще не сгенерирована! Пожалуйста, сначала сгенерируйте и проверьте картинки (комнату и сцену) в карточке настройки дня выше перед запуском видеоклипов.`);
        }

        const startImageBase64 = fs.readFileSync(masterScenePath, 'base64');
        const referenceImages = [{ data: startImageBase64 }];

        const CONTINUITY_LOCK = `STRICT REFERENCE CONTINUITY ANCHOR: You must strictly animate directly from the provided start reference image without changing any visual details. Freeze and lock 100% identity and environment from the reference picture: the room background, wall colors, paintings on wall, bookcase, plants, ambient lamp lighting, sofa style and color, subject's facial appearance, hairstyle, and outfit must remain completely identical to the reference starting image. Do not hallucinate or alter any room furniture or colors. Fixed stationary tripod camera angle, zero camera movement, zero panning, zero zooming.`;

        let videoPrompt = '';
        if (clip.role === 'idle_loop') {
            videoPrompt = `Animate only the subject's subtle body movements and facial expression from the starting image: ${clip.text} STRICT TECHNICAL CONSTRAINT: SHE IS COMPLETELY SILENT, LIPS CLOSED, NO TALKING, DO NOT OPEN MOUTH TO SPEAK OR TALK. Natural relaxed idle breathing, gentle natural eye blinking, holding steady eye contact forward toward the viewer. AUDIO: quiet indoor room atmosphere without vocal speech. ${CONTINUITY_LOCK}`;
        } else if (clip.role === 'talking_reply') {
            videoPrompt = `Animate realistic lip movements, expressive conversational facial mimicry, natural hand gestures, and polite warm smiling from the starting image while she speaks directly toward the viewer, saying in French: "${clip.text}". VOICE: ${blogger.voiceDescription || BLOGGER_VOICE_DESCRIPTION}. AUDIO: spoken French dialogue with natural indoor acoustics. ${CONTINUITY_LOCK}`;
        } else if (clip.role === 'gift_reaction') {
            videoPrompt = `Animate active energetic hand gestures of overjoyed emotional delight, vivid facial mimicry of heartfelt excitement, beaming a bright radiant smile from the starting image while saying in French: "${clip.text}". VOICE: ${blogger.voiceDescription || BLOGGER_VOICE_DESCRIPTION}. AUDIO: ecstatic emotional spoken French reaction. ${CONTINUITY_LOCK}`;
        }

        const safeVideoPrompt = videoPrompt
            .replace(/large natural bust/gi, 'elegant posture')
            .replace(/curvy feminine figure/gi, 'graceful figure')
            .replace(/low-cut/gi, 'v-neck')
            .replace(/cleavage/gi, 'neckline')
            .replace(/sexual/gi, '')
            .replace(/naked/gi, '')
            .replace(/nude/gi, '');

        let prefix = 'idle_';
        if (clip.role === 'talking_reply') prefix = 'talking_';
        else if (clip.role === 'gift_reaction') prefix = 'reaction_';

        const generatedPath = await ai.generateVideo({
            prompt: safeVideoPrompt,
            model: videoModel,
            mode: 'start_image',
            aspectRatio,
            resolution: '720p',
            sectionDir: dir,
            subFolder: '',
            sceneIndex: `${prefix}temp_${clipIndex}_${Date.now()}`,
            referenceImages,
            generateAudio: true
        });

        const finalFileName = `${prefix}${String(clipIndex + 1).padStart(2, '0')}_${Date.now()}.mp4`;
        const finalPath = path.join(dir, finalFileName);

        if (fs.existsSync(generatedPath)) {
            fs.renameSync(generatedPath, finalPath);
        } else {
            throw new Error(`Не удалось найти сгенерированный видеофайл.`);
        }

        const b64 = fs.readFileSync(finalPath).toString('base64');
        const videoBase64 = `data:video/mp4;base64,${b64}`;

        // Update pack_data.json
        clip.status = 'done';
        clip.videoPath = finalPath;
        clip.videoBase64 = videoBase64;
        fs.writeFileSync(jsonPath, JSON.stringify(packData, null, 2));

        return { videoPath: finalPath, videoBase64, clipIndex };
    });

    // 14. Parse recipe from URL (russianfood.com and similar)
    ipcMain.handle('frenchtalk-parse-recipe', async (event, { url }) => {
        if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
            throw new Error('Некорректный URL рецепта.');
        }
        console.log(`[FrenchTalk Recipe] Parsing recipe from: ${url}`);

        const { execFileSync } = require('child_process');
        const scriptPath = path.join(__dirname, 'parse_recipe.py');

        // Try to find python executable
        let pythonExe = 'python';
        const candidates = [
            'C:\\Program Files\\Python310\\python.exe',
            'C:\\Program Files\\Python311\\python.exe',
            'C:\\Program Files\\Python312\\python.exe',
            'C:\\Users\\Admin\\AppData\\Local\\Programs\\Python\\Python310\\python.exe',
            'python3',
            'python'
        ];
        for (const c of candidates) {
            try {
                execFileSync(c, ['--version'], { windowsHide: true, encoding: 'utf8' });
                pythonExe = c;
                break;
            } catch (_) {}
        }

        if (!fs.existsSync(scriptPath)) {
            throw new Error('parse_recipe.py не найден в директории приложения.');
        }

        try {
            const stdout = execFileSync(pythonExe, [scriptPath, url.trim()], {
                windowsHide: true,
                encoding: 'utf8',
                timeout: 30000
            });
            const result = JSON.parse(stdout.trim());
            console.log(`[FrenchTalk Recipe] Parsed: "${result.title}", ${result.ingredients.length} ingredients, ${result.steps.length} steps, ${result.images.length} images`);

            // Save parsed recipe to a global cache so the video generator can persist it per episode
            try {
                const cacheFile = path.join(FRENCHTALK_DIR, '_recipe_cache.json');
                fs.writeFileSync(cacheFile, JSON.stringify({
                    cachedAt: new Date().toISOString(),
                    url: url.trim(),
                    recipe: result
                }, null, 2), 'utf8');
                console.log('[FrenchTalk Recipe] Cache saved to _recipe_cache.json');
            } catch (cacheErr) {
                console.warn('[FrenchTalk Recipe] Could not save recipe cache:', cacheErr.message);
            }

            return result;
        } catch (err) {
            console.error('[FrenchTalk Recipe] Parse error:', err.message);
            throw new Error(`Ошибка парсинга рецепта: ${err.message.substring(0, 300)}`);
        }
    });
}

module.exports = { registerFrenchTalkHandlers };
