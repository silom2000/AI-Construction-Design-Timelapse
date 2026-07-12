const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const { callPollinations } = require('./skeleton-handlers.cjs');
const historyManager = require('./history-manager.cjs');

const PRIMATECAST_DIR = path.join(__dirname, 'PrimateCast');
const CHARACTERS_FILE = path.join(PRIMATECAST_DIR, 'characters.json');

// Ensure base directories exist
if (!fs.existsSync(PRIMATECAST_DIR)) fs.mkdirSync(PRIMATECAST_DIR, { recursive: true });
if (!fs.existsSync(path.join(PRIMATECAST_DIR, 'BaseImages'))) fs.mkdirSync(path.join(PRIMATECAST_DIR, 'BaseImages'), { recursive: true });

function getCharacters() {
    if (fs.existsSync(CHARACTERS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(CHARACTERS_FILE, 'utf8'));
        } catch (e) {
            console.error('[PrimateCast] Error reading characters:', e);
            return [];
        }
    }
    return [];
}

function saveCharacters(characters) {
    fs.writeFileSync(CHARACTERS_FILE, JSON.stringify(characters, null, 2));
}

function getDialogueEmotionPrompt(dialogueText) {
    const textLower = dialogueText.toLowerCase();
    
    if (textLower.includes('ха-ха') || textLower.includes('хаха') || textLower.includes('haha') || textLower.includes('хе-хе') || textLower.includes('lol') || textLower.includes('сме') || textLower.includes('chuckle')) {
        return "laughing eyes, joyful smile, laughing while talking, warm chuckle, amused expression";
    }
    if (dialogueText.includes('?!') || dialogueText.includes('!?') || dialogueText.includes('!!!')) {
        return "extremely surprised face, eyes wide open, expressing shocked disbelief, dramatic gasp gesture";
    }
    if (dialogueText.includes('?')) {
        return "questioning look, raising an eyebrow, curious and inquisitive expression, head slightly tilted";
    }
    if (dialogueText.includes('!')) {
        return "highly excited and energetic expression, expressive hand gesturing, passionate and enthusiastic look";
    }
    if (dialogueText.includes('...') || dialogueText.includes('—') || dialogueText.includes('–')) {
        return "thoughtful and contemplative expression, squinted eyes, thinking while speaking, subtle pause";
    }
    
    return "natural speaking expression";
}

function saveEpisodePromptsMetadata(episodeDir, episodeTitle, newPrompt) {
    const jsonPath = path.join(episodeDir, 'prompts.json');
    const txtPath = path.join(episodeDir, 'prompts.txt');
    
    let promptsData = {};
    if (fs.existsSync(jsonPath)) {
        try {
            promptsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        } catch (e) {
            console.error('[PrimateCast] Error reading prompts.json:', e);
        }
    }
    
    // Update or set prompt
    promptsData[newPrompt.segmentIndex] = {
        segmentIndex: newPrompt.segmentIndex,
        speakerName: newPrompt.speakerName,
        dialogueText: newPrompt.dialogueText,
        videoPrompt: newPrompt.videoPrompt,
        timestamp: new Date().toISOString()
    };
    
    // Save prompts.json
    fs.writeFileSync(jsonPath, JSON.stringify(promptsData, null, 2), 'utf8');
    
    // Build human-readable prompts.txt
    const sortedIndices = Object.keys(promptsData).map(Number).sort((a, b) => a - b);
    let txtContent = `========================================================================\n`;
    txtContent += `PRIMATECAST GENERATION PROMPTS\n`;
    txtContent += `Episode: ${episodeTitle}\n`;
    txtContent += `Generated: ${new Date().toLocaleString()}\n`;
    txtContent += `========================================================================\n\n`;
    
    for (const idx of sortedIndices) {
        const p = promptsData[idx];
        txtContent += `🎬 Scene #${p.segmentIndex + 1} — Actor: ${p.speakerName}\n`;
        txtContent += `------------------------------------------------------------------------\n`;
        txtContent += `🗣 Says: "${p.dialogueText}"\n\n`;
        txtContent += `📝 Video Prompt:\n${p.videoPrompt}\n`;
        txtContent += `------------------------------------------------------------------------\n\n`;
    }
    
    fs.writeFileSync(txtPath, txtContent, 'utf8');
}

/**
 * Ensures the image at inputPath has the target aspect ratio by center-cropping it if necessary.
 * Saves the result to outputPath and returns the path to the resized image.
 */
async function ensureImageAspectRatio(inputPath, targetAspectRatio, outputPath) {
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input image does not exist: ${inputPath}`);
    }

    try {
        const metadata = await sharp(inputPath).metadata();
        const originalWidth = metadata.width;
        const originalHeight = metadata.height;

        if (!originalWidth || !originalHeight) {
            return inputPath;
        }

        const currentRatio = originalWidth / originalHeight;
        
        let targetRatioVal = 16 / 9;
        if (targetAspectRatio === '9:16') {
            targetRatioVal = 9 / 16;
        }

        // If ratio is already very close, just return inputPath
        if (Math.abs(currentRatio - targetRatioVal) < 0.05) {
            console.log(`[PrimateCast] Image aspect ratio matches target. Reusing original.`);
            return inputPath;
        }

        console.log(`[PrimateCast] Mismatch in aspect ratio (current: ${currentRatio.toFixed(4)}, target: ${targetRatioVal.toFixed(4)}). Center-cropping image...`);

        let newWidth, newHeight;
        if (targetAspectRatio === '9:16') {
            newWidth = Math.round(originalHeight * 9 / 16);
            newHeight = originalHeight;
            if (newWidth > originalWidth) {
                newWidth = originalWidth;
                newHeight = Math.round(originalWidth * 16 / 9);
            }
        } else { // 16:9
            newWidth = originalWidth;
            newHeight = Math.round(originalWidth * 9 / 16);
            if (newHeight > originalHeight) {
                newHeight = originalHeight;
                newWidth = Math.round(originalHeight * 16 / 9);
            }
        }

        await sharp(inputPath)
            .resize(newWidth, newHeight, {
                fit: 'cover',
                position: 'center'
            })
            .toFile(outputPath);

        console.log(`[PrimateCast] Cropped image saved to: ${outputPath}`);
        return outputPath;
    } catch (err) {
        console.error(`[PrimateCast] Error resizing image:`, err);
        return inputPath; // Fallback to original
    }
}

function registerPrimateCastHandlers(ipcMain) {

    // 1. Get Character Ideas via Gemini
    ipcMain.handle('primatecast-generate-character-idea', async (event, { promptText, provider }) => {
        const systemPrompt = `You are an expert AI character designer for a podcast. 
The user will provide a brief idea for a podcaster character (e.g. "a zoomer macaque" or "a smart chimpanzee").
Generate a detailed visual prompt for G-Labs image generation (aspect ratio 16:9), a voice description for Omni Flash, and a personality profile.
Return ONLY valid JSON in this format:
{
    "name": "Character Name",
    "visualPrompt": "A highly detailed, photorealistic...",
    "voiceDescription": "Deep, calm, intellectual male voice",
    "personality": "Sarcastic and emotional"
}`;
        
        try {
            const rawOutput = await callPollinations([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: promptText }
            ], true, provider);
            
            let jsonStr = rawOutput.trim();
            const match = jsonStr.match(/\{[\s\S]*\}/);
            if (match) {
                jsonStr = match[0];
            } else {
                throw new Error("No JSON found in response: " + rawOutput);
            }
            
            return JSON.parse(jsonStr);
        } catch (err) {
            console.error('[PrimateCast] Idea generation failed:', err);
            throw err;
        }
    });

    // 2. Generate Base Image for Character
    ipcMain.handle('primatecast-generate-base-image', async (event, { visualPrompt, model }) => {
        // model can be 'nano_banana_2'
        const imageModel = model || 'nano_banana_2'; 
        const imagePaths = await generateImageViaGLabs({
            prompt: visualPrompt,
            model: imageModel,
            aspectRatio: '16:9',
            sectionDir: PRIMATECAST_DIR,
            subFolder: 'BaseImages',
            sceneIndex: `base_${Date.now()}`
        });
        
        // Return base64 so UI can preview it
        const imagePath = imagePaths[0];
        const base64 = fs.readFileSync(imagePath, 'base64');
        return { imagePath, base64: `data:image/jpeg;base64,${base64}` };
    });

    // 3. Save Character
    ipcMain.handle('primatecast-save-character', async (event, characterData) => {
        const characters = getCharacters();
        characterData.id = Date.now().toString();
        characters.push(characterData);
        saveCharacters(characters);
        return characters;
    });

    // 4. Get Characters
    ipcMain.handle('primatecast-get-characters', async () => {
        const chars = getCharacters();
        // Append base64 for UI preview
        return chars.map(c => {
            if (fs.existsSync(c.imagePath)) {
                c.base64 = `data:image/jpeg;base64,${fs.readFileSync(c.imagePath, 'base64')}`;
            }
            return c;
        });
    });

    // 5. Delete Character
    ipcMain.handle('primatecast-delete-character', async (event, { id }) => {
        let characters = getCharacters();
        characters = characters.filter(c => c.id !== id);
        saveCharacters(characters);
        return characters;
    });

    // 6. Generate Episode
    ipcMain.handle('primatecast-generate-episode', async (event, { script, host1Id, host2Id, clothes1, clothes2, location, episodeTitle, aspectRatio = '16:9', language = null }) => {
        const characters = getCharacters();
        const host1 = characters.find(c => c.id === host1Id);
        const host2 = characters.find(c => c.id === host2Id);

        if (!host1 || !host2) throw new Error("Hosts not found");

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(PRIMATECAST_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        // Parse script
        const lines = script.split('\n').filter(l => l.trim().length > 0);
        const segments = [];
        
        for (const line of lines) {
            const match = line.match(/^([^:]+):\s*(.*)$/);
            if (match) {
                const name = match[1].trim();
                const text = match[2].trim();
                let speakerHost = null;
                let clothes = "";
                
                if (name.toLowerCase() === host1.name.toLowerCase()) {
                    speakerHost = host1;
                    clothes = clothes1;
                } else if (name.toLowerCase() === host2.name.toLowerCase()) {
                    speakerHost = host2;
                    clothes = clothes2;
                }
                
                if (speakerHost) {
                    segments.push({ speaker: speakerHost, text, clothes });
                }
            }
        }

        if (segments.length === 0) throw new Error("No valid dialogue lines found in script. Format must be 'Name: Text'");

        // Generate Episode Base Images
        event.sender.send('primatecast-progress', { status: 'Генерация образов героев (G-Labs)...', progress: 5 });
        
        const hostImages = {};
        for (const host of [host1, host2]) {
            const hClothes = host.id === host1Id ? clothes1 : clothes2;
            const hasCustomClothes = hClothes && hClothes.trim() !== '';

            if (!hasCustomClothes && host.imagePath && fs.existsSync(host.imagePath)) {
                console.log(`[PrimateCast] Using main base image for ${host.name} as no custom clothes specified.`);
                const croppedPath = path.join(episodeDir, `host_${host.id}_cropped_${aspectRatio.replace(':', '_')}.jpg`);
                hostImages[host.id] = await ensureImageAspectRatio(host.imagePath, aspectRatio, croppedPath);
            } else {
                const episodeVisualPrompt = `A highly detailed, photorealistic ${host.name}. ${host.visualPrompt} Wearing ${hClothes}. Sitting in ${location}.`;
                
                let refBase64 = null;
                if (host.imagePath && fs.existsSync(host.imagePath)) {
                    refBase64 = fs.readFileSync(host.imagePath, 'base64');
                }

                const imgPaths = await generateImageViaGLabs({
                    prompt: episodeVisualPrompt,
                    model: 'nano_banana_2', // Good for styles/references
                    aspectRatio,
                    sectionDir: episodeDir,
                    subFolder: '',
                    sceneIndex: `host_${host.id}`,
                    referenceImages: refBase64 ? [{ data: refBase64 }] : []
                });
                hostImages[host.id] = imgPaths[0];
            }
        }

        // Generate Video for each segment
        const generatedClips = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const progressVal = 10 + Math.round((i / segments.length) * 90);
            
            event.sender.send('primatecast-progress', { 
                status: `Генерация видео ${i+1}/${segments.length}: ${seg.speaker.name}...`,
                progress: progressVal
            });

            const hostImgPath = hostImages[seg.speaker.id];
            let hostImgBase64 = fs.readFileSync(hostImgPath, 'base64');

            const emotion = getDialogueEmotionPrompt(seg.text);
            const isHost1 = seg.speaker.id === host1Id;
            const headTurn = isHost1 
                ? "head is turned in a half-turn to the left (three-quarters profile), facing and looking towards the other host" 
                : "head is turned in a half-turn to the right (three-quarters profile), facing and looking towards the other host";

            // Determine language for the voice description
            let lang = language;
            if (!lang) {
                if (/[\u0400-\u04FF]/.test(seg.text)) {
                    lang = 'Russian';
                } else {
                    lang = 'English';
                }
            }

            let voiceDesc = seg.speaker.voiceDescription || 'natural speaking voice';
            voiceDesc = voiceDesc.trim().replace(/^(a|an|the)\s+/i, '');
            voiceDesc = `${lang} ${voiceDesc.charAt(0).toLowerCase() + voiceDesc.slice(1)}`;

            const videoPrompt = `Photorealistic podcast video. Subject: ${seg.speaker.name}, ${seg.speaker.personality || 'an expressive character'}, showing a ${emotion}, seated at a podcast desk. The character's voice is: ${voiceDesc}. The character's ${headTurn}, and says: "${seg.text}". Natural mouth movements matching the spoken words, slight head nods, hand gestures. Warm studio lighting, background of ${location} softly blurred. Medium chest-up shot. Cinematic, 8K quality, ${aspectRatio}. No text overlay.`;

            const videoPath = await generateVideoViaGLabs({
                prompt: videoPrompt,
                model: 'omni_flash',
                mode: 'start_image',
                aspectRatio,
                resolution: '720p',
                sectionDir: episodeDir,
                subFolder: '',
                sceneIndex: `clip_${String(i+1).padStart(3, '0')}_${seg.speaker.name}`,
                referenceImages: [{ data: hostImgBase64 }],
                generateAudio: true
            });

            generatedClips.push(videoPath);

            saveEpisodePromptsMetadata(episodeDir, episodeTitle, {
                segmentIndex: i,
                speakerName: seg.speaker.name,
                dialogueText: seg.text,
                videoPrompt
            });
        }
        
        event.sender.send('primatecast-progress', { status: 'Готово! Видеоклипы сохранены в папке.', progress: 100 });
        return { folder: episodeDir, clips: generatedClips };
    });

    // 7. Generate Single Segment (for step-by-step UI)
    ipcMain.handle('primatecast-generate-segment', async (event, {
        segmentIndex, speakerId, dialogueText,
        host1Id, host2Id, clothes1, clothes2,
        location, episodeTitle, aspectRatio = '16:9',
        language = null
    }) => {
        const characters = getCharacters();
        const speaker = characters.find(c => c.id === speakerId);
        const host1 = characters.find(c => c.id === host1Id);
        const host2 = characters.find(c => c.id === host2Id);

        if (!speaker || !host1 || !host2) throw new Error('Character not found');

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(PRIMATECAST_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        const hostImagesDir = path.join(episodeDir, 'host_images');
        if (!fs.existsSync(hostImagesDir)) fs.mkdirSync(hostImagesDir, { recursive: true });

        // Check if episode image for this speaker already exists, reuse to save quota
        const cacheSuffix = aspectRatio.replace(':', '_');
        const cachedImgPath = path.join(hostImagesDir, `host_${speakerId}_${cacheSuffix}.jpg`);
        let hostImgPath;

        const speakerClothes = speakerId === host1Id ? clothes1 : clothes2;
        const hasCustomClothes = speakerClothes && speakerClothes.trim() !== '';

        if (!hasCustomClothes && speaker.imagePath && fs.existsSync(speaker.imagePath)) {
            console.log(`[PrimateCast Segment] Using main base image for ${speaker.name} as no custom clothes specified.`);
            const croppedPath = path.join(hostImagesDir, `host_${speakerId}_cropped_${aspectRatio.replace(':', '_')}.jpg`);
            hostImgPath = await ensureImageAspectRatio(speaker.imagePath, aspectRatio, croppedPath);
        } else if (fs.existsSync(cachedImgPath)) {
            console.log(`[PrimateCast Segment] Reusing cached image for ${speaker.name} (${aspectRatio})`);
            hostImgPath = cachedImgPath;
        } else {
            // Generate episode image for this speaker
            const episodeVisualPrompt = `A highly detailed, photorealistic ${speaker.name}. ${speaker.visualPrompt} Wearing ${speakerClothes}. Sitting in ${location}.`;

            let refBase64 = null;
            if (speaker.imagePath && fs.existsSync(speaker.imagePath)) {
                refBase64 = fs.readFileSync(speaker.imagePath, 'base64');
            }

            const imgPaths = await generateImageViaGLabs({
                prompt: episodeVisualPrompt,
                model: 'nano_banana_2',
                aspectRatio,
                sectionDir: hostImagesDir,
                subFolder: '',
                sceneIndex: `host_${speakerId}`,
                referenceImages: refBase64 ? [{ data: refBase64 }] : []
            });
            hostImgPath = imgPaths[0];

            // Cache it with consistent name for reuse
            if (hostImgPath !== cachedImgPath) {
                fs.copyFileSync(hostImgPath, cachedImgPath);
                hostImgPath = cachedImgPath;
            }
        }

        // Generate the video clip for this single dialogue line
        const hostImgBase64 = fs.readFileSync(hostImgPath, 'base64');
        const emotion = getDialogueEmotionPrompt(dialogueText);
        const isHost1 = speakerId === host1Id;
        const headTurn = isHost1 
            ? "head is turned in a half-turn to the left (three-quarters profile), facing and looking towards the other host" 
            : "head is turned in a half-turn to the right (three-quarters profile), facing and looking towards the other host";

        // Determine language for the voice description
        let lang = language;
        if (!lang) {
            if (/[\u0400-\u04FF]/.test(dialogueText)) {
                lang = 'Russian';
            } else {
                lang = 'English';
            }
        }

        let voiceDesc = speaker.voiceDescription || 'natural speaking voice';
        voiceDesc = voiceDesc.trim().replace(/^(a|an|the)\s+/i, '');
        voiceDesc = `${lang} ${voiceDesc.charAt(0).toLowerCase() + voiceDesc.slice(1)}`;

        const videoPrompt = `Photorealistic podcast video. Subject: ${speaker.name}, ${speaker.personality || 'an expressive character'}, showing a ${emotion}, seated at a podcast desk. The character's voice is: ${voiceDesc}. The character's ${headTurn}, and says: "${dialogueText}". Natural mouth movements matching the spoken words, slight head nods, hand gestures. Warm studio lighting, background of ${location} softly blurred. Medium chest-up shot. Cinematic, 8K quality, ${aspectRatio}. No text overlay.`;

        const videoPath = await generateVideoViaGLabs({
            prompt: videoPrompt,
            model: 'omni_flash',
            mode: 'start_image',
            aspectRatio,
            resolution: '720p',
            sectionDir: episodeDir,
            subFolder: '',
            sceneIndex: `clip_${String(segmentIndex + 1).padStart(3, '0')}_${speaker.name}`,
            referenceImages: [{ data: hostImgBase64 }],
            generateAudio: true
        });

        saveEpisodePromptsMetadata(episodeDir, episodeTitle, {
            segmentIndex,
            speakerName: speaker.name,
            dialogueText,
            videoPrompt
        });

        // Return video as base64 for preview
        const videoBase64 = fs.readFileSync(videoPath);
        return {
            videoPath,
            videoBase64: `data:video/mp4;base64,${videoBase64.toString('base64')}`,
            segmentIndex
        };
    });

    // 8. Pre-save all prompts for the episode (before generation)
    ipcMain.handle('primatecast-save-all-prompts', async (event, {
        host1Id, host2Id, clothes1, clothes2,
        location, episodeTitle, aspectRatio = '16:9',
        segments
    }) => {
        const characters = getCharacters();
        const host1 = characters.find(c => c.id === host1Id);
        const host2 = characters.find(c => c.id === host2Id);

        if (!host1 || !host2) throw new Error("Hosts not found");

        const folderName = episodeTitle ? episodeTitle.replace(/[^a-z0-9]/gi, '_') : `Episode_${Date.now()}`;
        const episodeDir = path.join(PRIMATECAST_DIR, folderName);
        if (!fs.existsSync(episodeDir)) fs.mkdirSync(episodeDir, { recursive: true });

        const jsonPath = path.join(episodeDir, 'prompts.json');
        const txtPath = path.join(episodeDir, 'prompts.txt');

        let promptsData = {};
        if (fs.existsSync(jsonPath)) {
            try {
                promptsData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            } catch (e) {
                console.error('[PrimateCast] Error reading prompts.json:', e);
            }
        }

        const updatedPromptsData = {};
        for (const seg of segments) {
            const speaker = characters.find(c => c.id === seg.speakerId);
            if (!speaker) continue;

            const emotion = getDialogueEmotionPrompt(seg.text);
            const isHost1 = seg.speakerId === host1Id;
            const headTurn = isHost1 
                ? "head is turned in a half-turn to the left (three-quarters profile), facing and looking towards the other host" 
                : "head is turned in a half-turn to the right (three-quarters profile), facing and looking towards the other host";

            const videoPrompt = `Photorealistic podcast video. Subject: ${speaker.name}, ${speaker.personality || 'an expressive character'}, showing a ${emotion}, seated at a podcast desk. The character's voice is: ${speaker.voiceDescription || 'a natural speaking voice'}. The character's ${headTurn}, and says: "${seg.text}". Natural mouth movements matching the spoken words, slight head nods, hand gestures. Warm studio lighting, background of ${location} softly blurred. Medium chest-up shot. Cinematic, 8K quality, ${aspectRatio}. No text overlay.`;

            const existing = promptsData[seg.index];
            if (existing && existing.dialogueText === seg.text) {
                updatedPromptsData[seg.index] = {
                    ...existing,
                    videoPrompt
                };
            } else {
                updatedPromptsData[seg.index] = {
                    segmentIndex: seg.index,
                    speakerName: speaker.name,
                    dialogueText: seg.text,
                    videoPrompt,
                    timestamp: new Date().toISOString()
                };
            }
        }

        fs.writeFileSync(jsonPath, JSON.stringify(updatedPromptsData, null, 2), 'utf8');

        const sortedIndices = Object.keys(updatedPromptsData).map(Number).sort((a, b) => a - b);
        let txtContent = `========================================================================\n`;
        txtContent += `PRIMATECAST GENERATION PROMPTS\n`;
        txtContent += `Episode: ${episodeTitle}\n`;
        txtContent += `Generated: ${new Date().toLocaleString()}\n`;
        txtContent += `========================================================================\n\n`;

        for (const idx of sortedIndices) {
            const p = updatedPromptsData[idx];
            txtContent += `🎬 Scene #${p.segmentIndex + 1} — Actor: ${p.speakerName}\n`;
            txtContent += `------------------------------------------------------------------------\n`;
            txtContent += `🗣 Says: "${p.dialogueText}"\n\n`;
            txtContent += `📝 Video Prompt:\n${p.videoPrompt}\n`;
            txtContent += `------------------------------------------------------------------------\n\n`;
        }

        fs.writeFileSync(txtPath, txtContent, 'utf8');
        return { success: true };
    });

    // Simple DuckDuckGo HTML search helper to retrieve background snippets
    async function searchWeb(query) {
        try {
            const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept-Language': 'ru,en-US;q=0.9,en;q=0.8'
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
            console.error('[PrimateCast Search] DDG search failed:', e.message);
            return '';
        }
    }

    // Auto-Topic: fetch REAL trending topics from Google Trends RSS, search custom topics, or adapt custom text
    ipcMain.handle('primatecast-auto-topic', async (event, { language, country, host1Name, host2Name, mode = 'trending', customInput = '', shortVersion = false }) => {
        console.log(`[PrimateCast AutoTopic] lang=${language} country=${country} mode=${mode} shortVersion=${shortVersion}`);

        let trendingTopics = [];
        let topicData = null;
        let searchResults = '';

        if (mode === 'trending') {
            // Step 1: Search the web for current TikTok trends
            event.sender.send('primatecast-progress', { status: `🌐 Поиск популярных трендов TikTok в ${country}...`, progress: 10 });

            try {
                const searchQuery = `viral tiktok trends challenges hashtags ${country} this week`;
                console.log(`[PrimateCast AutoTopic] Searching web for TikTok trends: "${searchQuery}"`);
                searchResults = await searchWeb(searchQuery);
            } catch (searchErr) {
                console.error('[PrimateCast AutoTopic] Web search for TikTok trends failed:', searchErr.message);
            }

            // Step 2: Pass search context (or fallback) to LLM to select topic
            event.sender.send('primatecast-progress', { status: '🤖 Выбираю лучшую тему для подкаста...', progress: 30 });

            const historyKey = `primatecast_${language || 'en'}`;
            const completedTopics = historyManager.getTopics(historyKey);
            let completedText = '';
            if (completedTopics && completedTopics.length > 0) {
                completedText = `\nALREADY GENERATED AND FORBIDDEN (DO NOT SELECT THEM OR ANYTHING SIMILAR):\n- ${completedTopics.slice(-40).join('\n- ')}\n`;
            }

            const selectPrompt = `You are a content strategist for a viral primate podcast aimed at TikTok.
We searched the web for current TikTok trends, popular hashtags, and viral challenges in ${country}:
${searchResults}

${completedText}

Choose ONE trending topic, challenge, or popular meme from this list that:
- Relates to human behavior, society, work, relationships, digital lifestyle, or current internet humor
- Has a funny ironic angle when compared to how animals/primates actually behave
- Will resonate with short-form video viewers in ${country}

Output ONLY valid JSON (no other text):
{
  "topic": "Topic name/challenge in ${language}",
  "topicEn": "Topic name in English",
  "topicRu": "Topic name translated to Russian",
  "hook": "One viral-worthy sentence hook in ${language} that makes people click",
  "hookRu": "One viral-worthy sentence hook translated to Russian",
  "angle": "Funny ironic animal perspective angle in ${language}"
}`;

            const topicRaw = await callPollinations([
                { role: 'user', content: selectPrompt }
            ], true);

            const topicMatch = topicRaw.match(/\{[\s\S]*\}/);
            if (!topicMatch) throw new Error('LLM could not select a topic. Raw: ' + topicRaw.substring(0, 200));
            topicData = JSON.parse(topicMatch[0]);

        } else if (mode === 'custom_topic') {
            // Mode: Custom Topic - Search internet
            event.sender.send('primatecast-progress', { status: '🔍 Ищу информацию в сети интернет...', progress: 15 });
            searchResults = await searchWeb(customInput);

            // Select an ironic angle and structure the custom topic
            event.sender.send('primatecast-progress', { status: '🤖 Анализирую тему и определяю угол подачи...', progress: 40 });
            const selectPrompt = `You are a content strategist for a viral primate podcast.
The user has requested the following custom topic: "${customInput}"
Here is some recent web search context about this topic:
${searchResults}

Choose a funny ironic angle that compares this topic to how animals/primates behave naturally, and prepare the metadata.

Output ONLY valid JSON (no other text):
{
  "topic": "Topic name in ${language}",
  "topicEn": "Topic name in English",
  "topicRu": "Topic name translated to Russian",
  "hook": "One viral-worthy sentence hook in ${language} that makes people click",
  "hookRu": "One viral-worthy sentence hook translated to Russian",
  "angle": "Funny ironic animal perspective angle in ${language}"
}`;

            const topicRaw = await callPollinations([
                { role: 'user', content: selectPrompt }
            ], true);

            const topicMatch = topicRaw.match(/\{[\s\S]*\}/);
            if (!topicMatch) throw new Error('LLM could not select an angle. Raw: ' + topicRaw.substring(0, 200));
            topicData = JSON.parse(topicMatch[0]);

        } else if (mode === 'custom_text') {
            // Mode: Custom Text - LLM parses topic and hook directly from raw text
            event.sender.send('primatecast-progress', { status: '🤖 Читаю и анализирую ваш текст...', progress: 20 });
            const parsePrompt = `Extract the main topic, hook, and write a funny primate perspective angle from this draft text:
"${customInput}"

Output ONLY valid JSON (no other text):
{
  "topic": "Main topic title in ${language}",
  "topicEn": "Main topic title in English",
  "topicRu": "Main topic title translated to Russian",
  "hook": "Create a hook sentence in ${language} summarizing the draft",
  "hookRu": "Hook sentence translated to Russian",
  "angle": "Funny ironic primate perspective angle in ${language}"
}`;

            const topicRaw = await callPollinations([
                { role: 'user', content: parsePrompt }
            ], true);

            const topicMatch = topicRaw.match(/\{[\s\S]*\}/);
            if (!topicMatch) throw new Error('LLM could not parse draft. Raw: ' + topicRaw.substring(0, 200));
            topicData = JSON.parse(topicMatch[0]);
        }

        console.log(`[PrimateCast AutoTopic] Topic title: ${topicData.topicEn}`);
        event.sender.send('primatecast-progress', { status: `✍️ Пишу сценарий: "${topicData.topic}"...`, progress: 50 });

        // Step 3: Generate script (adapt user text, or write from topic + search context)
        let scriptPrompt = '';
        if (mode === 'custom_text') {
            scriptPrompt = `You are an expert viral TikTok scriptwriter for "PrimateCast" — a podcast hosted by two primates dressed as humans who study human behavior with baffled curiosity.

HOSTS:
- ${host1Name} (chimpanzee): calm, intellectual, slightly philosophical, uses precise observations
- ${host2Name} (macaque): energetic, sarcastic, street-smart, reacts emotionally

The user has provided this raw draft text/script/dialogue:
"${customInput}"

Your task is to REWRITE and ADAPT this raw text into a podcast script format for our two hosts. Keep the core points, arguments, or dialogue of the user's text, but make it fit the characters' personalities, language (${language}), and follow these strict technical constraints:

══════════════════════════════════════
⚠️ ABSOLUTE TECHNICAL CONSTRAINT — NON-NEGOTIABLE:
Each dialogue line is spoken in ONE 8-second video clip.
At normal speaking pace = maximum 15-20 WORDS PER LINE.
If a line exceeds 20 words, the audio will be CUT OFF. This ruins the video.
COUNT YOUR WORDS. EVERY LINE MUST BE 10-20 WORDS MAXIMUM.
══════════════════════════════════════

CRITICAL STRUCTURE:
- Total: exactly ${shortVersion ? '6-7' : '13-14'} lines
- Each line format: "${host1Name}: [dialogue]" or "${host2Name}: [dialogue]"
- NO stage directions, NO asterisks, NO descriptions.
- INTERACTIVE DIALOGUE: The hosts must talk TO each other and react to each other's points (e.g., "Wait, is that true?", "Exactly, {host1Name}!", "Huh?"). They must ask questions and address each other by name at least 2-3 times to make it feel like a real podcast debate.
- EMOTIONS & EXPRESSIVENESS: Write the lines to be highly expressive. Use punctuation like "!", "?", "?!", and "..." to convey emotions. Include conversational interjections like "Haha!", "Wait, what?!", "Wow!", "Huh?" or laughing markers.
- Short punchy sentences. Fast pace. Spoken aloud naturally.

Output ONLY the script lines, nothing else.`;
        } else {
            const searchContext = searchResults ? `\nUse this search info for details:\n${searchResults}\n` : '';
            scriptPrompt = `You are an expert viral TikTok scriptwriter for "PrimateCast" — a podcast hosted by two primates dressed as humans who study human behavior with baffled curiosity.

HOSTS:
- ${host1Name} (chimpanzee): calm, intellectual, slightly philosophical, uses precise observations
- ${host2Name} (macaque): energetic, sarcastic, street-smart, reacts emotionally

TOPIC: "${topicData.topic}"
${searchContext}
IRONIC ANGLE: ${topicData.angle}
LANGUAGE: ${language}

══════════════════════════════════════
⚠️ ABSOLUTE TECHNICAL CONSTRAINT — NON-NEGOTIABLE:
Each dialogue line is spoken in ONE 8-second video clip.
At normal speaking pace = maximum 15-20 WORDS PER LINE.
If a line exceeds 20 words, the audio will be CUT OFF. This ruins the video.
COUNT YOUR WORDS. EVERY LINE MUST BE 10-20 WORDS MAXIMUM.
══════════════════════════════════════

${shortVersion ? `CRITICAL TikTok STRUCTURE — FOLLOW EXACTLY:

▶ LINE 1 — THE HOOK (1-2 seconds). THIS IS THE MOST IMPORTANT LINE. MAX 10 WORDS.
   Must be a SHOCKING or PROVOCATIVE statement that makes a human STOP scrolling instantly.
   FORBIDDEN first words: "Hello", "Welcome", "Today", "So,", "Did you know", "Hey", "Guys", "Bonjour", "Hallo"

▶ LINES 2-3 — SETUP/DEVELOPMENT: Establish the human behavior and primate perspective. Punchy. 12-18 words each.

▶ LINES 4-5 — TWIST: Surprising fact that reframes everything. 15-18 words each.

▶ LINES 6-7 — PUNCHLINE: Final memorable line. Humans feel called out but laugh. MAX 15 WORDS.` 
: `CRITICAL TikTok STRUCTURE — FOLLOW EXACTLY:

▶ LINE 1 — THE HOOK (1-2 seconds). THIS IS THE MOST IMPORTANT LINE. MAX 10 WORDS.
   Must be a SHOCKING or PROVOCATIVE statement that makes a human STOP scrolling instantly.
   FORBIDDEN first words: "Hello", "Welcome", "Today", "So,", "Did you know", "Hey", "Guys", "Bonjour", "Hallo"

▶ LINES 2-4 — SETUP: Establish the human behavior. Punchy, 12-15 words each.

▶ LINES 5-9 — DEVELOPMENT: Primate perspective vs humans. Build irony. 15-18 words each.

▶ LINES 10-12 — TWIST: Surprising fact that reframes everything. 15-18 words each.

▶ LINES 13-14 — PUNCHLINE: Final memorable line. Humans feel called out but laugh. MAX 15 WORDS.`}

RULES:
- Each line format: "${host1Name}: [dialogue]" or "${host2Name}: [dialogue]"
- Total: exactly ${shortVersion ? '6-7' : '13-14'} lines
- HARD LIMIT: 20 words per line — COUNT BEFORE WRITING.
- NO stage directions, NO asterisks, NO descriptions.
- INTERACTIVE DIALOGUE: The hosts must talk TO each other and react to each other's points (e.g., "Wait, is that true?", "Exactly, {host1Name}!", "Huh?"). They must ask questions and address each other by name at least 2-3 times.
- EMOTIONS & EXPRESSIVENESS: Write the lines to be highly expressive. Use punctuation like "!", "?", "?!", and "..." to convey emotions. Include conversational interjections like "Haha!", "Wait, what?!", "Wow!", "Huh?" or laughing markers.
- Short punchy sentences. Fast pace. Spoken aloud naturally.
- The irony must punch hard — humans feel seen and slightly embarrassed.

Output ONLY the script lines, nothing else.`;
        }

        const scriptRaw = await callPollinations([
            { role: 'user', content: scriptPrompt }
        ], false);

        // Translate the script to Russian line-by-line
        let scriptRu = '';
        try {
            event.sender.send('primatecast-progress', { status: '🌐 Перевожу скрипт на русский...', progress: 85 });
            const translationPrompt = `You are a professional translator. Translate this script to Russian line-by-line.
Keep the exact speaker names and format: "Speaker: Russian translation".
Do not change the speaker names (use the exact names from the script).
Each line must be translated accurately and match the tone.

Script:
${scriptRaw}`;

            scriptRu = await callPollinations([
                { role: 'user', content: translationPrompt }
            ], false);
            console.log('[PrimateCast AutoTopic] Script translated successfully.');
        } catch (transErr) {
            console.error('[PrimateCast AutoTopic] Script translation failed:', transErr.message);
        }

        // Validate line lengths and warn about overlong lines
        const scriptLines = scriptRaw.trim().split('\n').filter(l => l.trim().length > 0);
        const overlongLines = [];
        for (let i = 0; i < scriptLines.length; i++) {
            const match = scriptLines[i].match(/^([^:]+):\s*(.*)$/);
            if (match) {
                const wordCount = match[2].trim().split(/\s+/).length;
                if (wordCount > 20) {
                    overlongLines.push({ line: i + 1, words: wordCount, text: scriptLines[i].substring(0, 60) });
                }
            }
        }

        if (topicData && topicData.topic) {
            const historyKey = `primatecast_${language || 'en'}`;
            historyManager.addTopic(historyKey, topicData.topic);
        }

        event.sender.send('primatecast-progress', { status: '', progress: 0 });

        return {
            topic: topicData.topic,
            topicEn: topicData.topicEn,
            topicRu: topicData.topicRu || '',
            hook: topicData.hook,
            hookRu: topicData.hookRu || '',
            script: scriptRaw.trim(),
            scriptRu: scriptRu.trim(),
            trendingTopics: trendingTopics,
            overlongLines: overlongLines // Pass to UI for warnings
        };
    });

    // 10. Analyze Video and Generate Podcast script from it
    ipcMain.handle('primatecast-analyze-video', async (event, { videoBase64, language, host1Name, host2Name, shortVersion = false }) => {
        console.log(`[PrimateCast Video Analysis] Received base64 video, lang=${language} shortVersion=${shortVersion}`);
        
        if (!videoBase64) throw new Error("Данные видео не переданы");

        const tempDir = path.join(PRIMATECAST_DIR, 'TempAnalysis');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const videoPath = path.join(tempDir, `temp_video_${Date.now()}.mp4`);
        const audioPath = path.join(tempDir, `audio_${Date.now()}.mp3`);
        
        try {
            // Save base64 video to file
            console.log('[PrimateCast Video Analysis] Saving temp video file...');
            const videoData = videoBase64.includes('base64,')
                ? videoBase64.split(';base64,').pop()
                : videoBase64;
            fs.writeFileSync(videoPath, videoData, 'base64');

            // Step 1: Extract audio using ffmpeg
            event.sender.send('primatecast-progress', { status: '🎵 Извлечение аудиодорожки из видео...', progress: 15 });
            const execSync = require('child_process').execSync;
            execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 -y "${audioPath}"`, { stdio: 'pipe' });

            // Step 2: Transcribe using existing transcribeAudio (whisper via pollinations)
            event.sender.send('primatecast-progress', { status: '🗣️ Транскрибация аудио (STT)...', progress: 40 });
            const { transcribeAudio } = require('./localize-handlers.cjs'); 
            const sttResult = await transcribeAudio(audioPath);
            const transcript = sttResult.text;
            console.log(`[PrimateCast Video Analysis] Transcript: ${transcript.substring(0, 100)}...`);

            if (!transcript.trim()) {
                throw new Error("Не удалось получить текст из видео");
            }

            // Step 3: Call custom local AI to analyze transcript and generate script
            event.sender.send('primatecast-progress', { status: '🤖 Анализ текста моделью Gemini...', progress: 70 });
            
            const analyzePrompt = `You are a content strategist and viral scriptwriter for "PrimateCast" — a podcast hosted by two primates dressed as humans who study human behavior.
We have transcribed a reference video. Here is the transcript:
"${transcript}"

Analyze this transcript:
1. Extract the main topic, hook, and core message.
2. Write a new "PrimateCast" script of exactly ${shortVersion ? '6-7' : '13-14'} lines in ${language} that discusses a similar topic or uses a similar viral hook, adapted for our two hosts:
   - ${host1Name} (chimpanzee): calm, intellectual, slightly philosophical, uses precise observations
   - ${host2Name} (macaque): energetic, sarcastic, street-smart, reacts emotionally

Technical constraints for the script — NON-NEGOTIABLE:
- Each line format: "Speaker: dialogue"
- Exactly ${shortVersion ? '6-7' : '13-14'} lines
- 10-20 words per line (non-negotiable, count words!)
- NO stage directions, NO descriptions, NO asterisks.
- The hosts must talk TO each other, react, and debate.

Output ONLY valid JSON (no other text):
{
  "topic": "Topic title in ${language} (based on reference)",
  "topicEn": "Topic title in English",
  "topicRu": "Topic title translated to Russian",
  "hook": "Create a viral hook sentence in ${language} based on reference",
  "hookRu": "Hook sentence translated to Russian",
  "script": "Host1: line1\\nHost2: line2\\n..."
}`;

            const resultRaw = await callPollinations([
                { role: 'user', content: analyzePrompt }
            ], true); // Force jsonMode

            const jsonMatch = resultRaw.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('LLM did not output valid JSON. Raw: ' + resultRaw.substring(0, 200));
            const topicData = JSON.parse(jsonMatch[0]);

            // Translate script to Russian
            event.sender.send('primatecast-progress', { status: '🌐 Перевожу сценарий на русский...', progress: 90 });
            const translationPrompt = `You are a professional translator. Translate this script to Russian line-by-line.
Keep the exact speaker names and format: "Speaker: Russian translation".
Do not change the speaker names (use the exact names from the script).
Each line must be translated accurately and match the tone.

Script:
${topicData.script}`;

            const scriptRu = await callPollinations([
                { role: 'user', content: translationPrompt }
            ], false);

            event.sender.send('primatecast-progress', { status: '', progress: 0 });

            // Clean up temporary files
            try {
                if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            } catch (e) {
                console.warn("[PrimateCast Video Analysis] Could not delete temp files:", e.message);
            }

            return {
                topic: topicData.topic,
                topicEn: topicData.topicEn,
                topicRu: topicData.topicRu || '',
                hook: topicData.hook,
                hookRu: topicData.hookRu || '',
                script: topicData.script.trim(),
                scriptRu: scriptRu.trim()
            };

        } catch (err) {
            // Clean up temporary audio file in case of error
            try {
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
            } catch (e) {}
            console.error('[PrimateCast Video Analysis] Error:', err);
            event.sender.send('primatecast-progress', { status: '', progress: 0 });
            throw err;
        }
    });
}

module.exports = { registerPrimateCastHandlers };
