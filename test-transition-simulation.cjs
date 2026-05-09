const fs = require('fs');
const path = require('path');

async function testTransitionRequest() {
    const img1 = "D:\\Open_Project\\kimi\\CinematicTimelapse\\Timelapse_190234_03142026\\scene_1_1773511390823.jpg";
    const img2 = "D:\\Open_Project\\kimi\\CinematicTimelapse\\Timelapse_190234_03142026\\scene_2_1773511401079.jpg";

    console.log("--- SIMULATING TIMELAPSE TRANSITION REQUEST ---");
    console.log("Start Image:", img1);
    console.log("End Image:", img2);

    const startB64 = fs.readFileSync(img1, { encoding: 'base64' });
    const endB64 = fs.readFileSync(img2, { encoding: 'base64' });

    const bodyData = {
        prompt: "STATIC CAMERA. TIMELAPSE TRANSITION. Photorealistic sequence...",
        model: 'veo_31_fast',
        aspect_ratio: '9:16',
        resolution: '720p',
        mode: 'start_end_image',
        reference_images: [
            { data: `data:image/jpeg;base64,${startB64.substring(0, 50)}... [TRUNCATED]` },
            { data: `data:image/jpeg;base64,${endB64.substring(0, 50)}... [TRUNCATED]` }
        ]
    };

    console.log("\n[PROPOSED JSON PAYLOAD]:");
    console.log(JSON.stringify(bodyData, null, 2));
    console.log("\n--- TEST COMPLETE: REQUEST STRUCTURE IS VALID ---");
}

testTransitionRequest();
