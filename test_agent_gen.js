
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log("Starting generation...");
    try {
        const textAboutUser = "Вы — удивительный и настойчивый исследователь, чья страсть к инновациям и деталям вдохновляет на создание совершенных систем.";
        
        // 1. Generate Image
        const imagePrompt = "A futuristic, friendly AI assistant robot with a warm blue glow, sleek white ceramic shell, photorealistic cinematic lighting, 9:16 vertical, high-end medical visualization style, clean and modern.";
        console.log("Generating image...");
        const imagePaths = await generateImageViaGLabs({
            prompt: imagePrompt,
            model: 'imagen4',
            subFolder: 'AgentTest'
        });
        
        const imagePath = imagePaths[0];
        console.log("Image saved at:", imagePath);
        
        const imageBase64 = fs.readFileSync(imagePath).toString('base64');

        // 2. Generate Video with the text for lip-sync
        console.log("Generating video with narration...");
        const videoPath = await generateVideoViaGLabs({
            prompt: `Futuristic AI robot speaking. Narration (Russian): "${textAboutUser}". Natural lip-sync, high quality, static camera.`,
            model: 'veo_31_fast',
            mode: 'start_image',
            resolution: '720p',
            subFolder: 'AgentTest',
            referenceImages: [{
                data: `data:image/jpeg;base64,${imageBase64}`
            }]
        });

        console.log("Video saved at:", videoPath);
    } catch (e) {
        console.error("Error during generation:", e);
    }
}

run();
