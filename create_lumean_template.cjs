require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function createTemplate() {
    const apiKey = process.env.VOICEAPI_KEY;
    const LUMEAN_BASE = 'https://api.lumean.app/api/public';
    
    if (!apiKey) throw new Error("VOICEAPI_KEY is not set in .env");

    const headers = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    };

    const templateBody = {
        "service_key": "elevenlabs",
        "name": "AISTUDIO ElevenLabs Template",
        "config": {
            "tts_settings": {
                "mode": "mode_v1",
                "model_id": "eleven_multilingual_v2",
                "voice_id": "S3EMTLF63LOyQFQA2vOC",
                "public_owner_id": "a1254f9da709d4a8ae8b568746606d2ef3418390a67380e88423da83da5a874e",
                "voice_settings": { 
                    "stability": 0.9, 
                    "similarity_boost": 0.75, 
                    "style": 0.0,
                    "use_speaker_boost": true, 
                    "speed": 1.0 
                }
            }
        }
    };

    try {
        console.log("Creating template on Lumean...");
        const res = await axios.post(`${LUMEAN_BASE}/templates`, templateBody, { headers });
        const newUuid = res.data.data.id;
        console.log(`Successfully created template! New UUID: ${newUuid}`);

        // Update .env file
        let envContent = fs.readFileSync('.env', 'utf8');
        envContent = envContent.replace(/^UUID=.*$/m, `UUID=${newUuid}`);
        fs.writeFileSync('.env', envContent);
        console.log(".env file updated successfully.");

    } catch (err) {
        if (err.response) {
            console.error("API Error Response:", err.response.status, JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err);
        }
    }
}

createTemplate();
