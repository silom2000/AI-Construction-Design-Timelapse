const { request } = require('undici');
require('dotenv').config();
const freepikKeys = require('./freepik-key-manager.cjs');

async function probeFreepik() {
    const totalKeys = freepikKeys.totalKeys();
    if (totalKeys === 0) {
        console.error('No Freepik API key found in .env');
        return;
    }

    const models = ['flux', 'classic-fast', 'mystic', 'flux-2-turbo', 'seedream-3-0'];
    const prompt = 'A luxury modern living room with large windows and marble floors, 8k resolution';

    for (const model of models) {
        let triedKeys = 0;
        let success = false;

        while (triedKeys < totalKeys && !success) {
            const apiKey = freepikKeys.current();
            const url = `https://api.freepik.com/v1/ai/text-to-image/${model}`;
            console.log(`Probing model: ${model} with key ${freepikKeys.currentKeyIndex()}/${totalKeys}`);

            try {
                const { statusCode, body } = await request(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-freepik-api-key': apiKey,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                        num_images: 1,
                        image: {
                            size: 'square_1_1'
                        }
                    })
                });

                const text = await body.text();
                console.log(`Model ${model} status: ${statusCode}`);

                if (statusCode === 200 || statusCode === 201) {
                    console.log(`Success! Response: ${text.substring(0, 200)}...`);
                    success = true;
                } else if (freepikKeys.isLimitError(statusCode, text)) {
                    console.warn(`Key ${freepikKeys.currentKeyIndex()} hit limit, rotating...`);
                    freepikKeys.rotate(`Limit on ${model}`);
                    triedKeys++;
                } else {
                    console.error(`Error ${statusCode}: ${text.substring(0, 200)}`);
                    break; // Non-limit error, move to next model
                }
            } catch (e) {
                console.error(`Request error: ${e.message}`);
                freepikKeys.rotate(e.message);
                triedKeys++;
            }
        }
        console.log('---');
    }
}

probeFreepik();
