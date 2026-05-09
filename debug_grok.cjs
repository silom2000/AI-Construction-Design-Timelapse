const { request } = require('undici');
const fs = require('fs');
require('dotenv').config();

async function debug() {
    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const prompt = encodeURIComponent("A skeleton walking in a neon city, cinematic");
    
    // Ищем любую картинку для теста
    const testImgPath = 'SkeletonShorts/scene_1.jpg';
    if (!fs.existsSync(testImgPath)) {
        console.error("No test image found at SkeletonShorts/scene_1.jpg");
        return;
    }
    const base64 = fs.readFileSync(testImgPath, { encoding: 'base64' });
    const dataUri = `data:image/jpeg;base64,${base64}`;

    // Пробуем POST запрос (как в коде)
    const url = `https://gen.pollinations.ai/video/${prompt}?model=grok-video&width=720&height=1280&duration=5`;
    
    console.log("Testing POST to:", url);
    try {
        const { statusCode, body } = await request(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({ image: dataUri })
        });
        
        console.log("POST Status:", statusCode);
        const respText = await body.text();
        console.log("POST Response:", respText.substring(0, 200));

        if (statusCode === 404) {
            console.log("\n404 detected. Trying alternative URL format (without path prompt)...");
            const altUrl = `https://gen.pollinations.ai/video?model=grok-video`;
             const { statusCode: s2, body: b2 } = await request(altUrl, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                },
                body: JSON.stringify({ prompt: "A skeleton walking in a neon city", image: dataUri, width: 720, height: 1280 })
            });
            console.log("ALT POST Status:", s2);
            console.log("ALT POST Response:", (await b2.text()).substring(0, 200));
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

debug();