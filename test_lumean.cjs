require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

async function testLumean() {
    const apiKey = process.env.VOICEAPI_KEY;
    const templateId = process.env.UUID;
    const LUMEAN_BASE = 'https://api.lumean.app/api/public';
    
    if (!apiKey) throw new Error("VOICEAPI_KEY is not set in .env");
    if (!templateId) throw new Error("UUID is not set in .env");

    const headers = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    };

    console.log("1. Creating order...");
    const orderBody = {
        template_id: templateId,
        input_text: "Привет! Это проверка нового API сервера Lumean."
    };

    try {
        const createRes = await axios.post(`${LUMEAN_BASE}/orders`, orderBody, { headers });
        const orderId = createRes.data.data.id;
        console.log(`Order created: ${orderId}`);

        console.log("2. Polling status...");
        let isDone = false;
        let finalOrder = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const statRes = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers });
            const st = statRes.data.data.status;
            console.log(`Status: ${st}`);
            if (st === 'completed' || st === 'partially_completed') {
                isDone = true;
                finalOrder = statRes.data.data;
                break;
            }
            if (st === 'failed' || st === 'cancelled') {
                throw new Error(`Order failed: ${st}`);
            }
        }

        if (!isDone) throw new Error("Timeout waiting for order to complete");

        console.log("3. Getting file URL...");
        const resultItem = finalOrder.result.files[0];
        const path = typeof resultItem === 'string' ? resultItem : resultItem.path;
        console.log(`File path: ${path}`);
        
        const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: path }, { headers });
        const downloadUrl = urlRes.data.data.url;
        console.log(`Download URL: ${downloadUrl}`);

        console.log("4. Downloading audio...");
        const audioRes = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync('test_output.mp3', Buffer.from(audioRes.data));
        console.log("Audio saved as test_output.mp3");

    } catch (err) {
        if (err.response) {
            console.error("API Error Response:", err.response.status, JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err);
        }
    }
}

testLumean();
