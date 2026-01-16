import dotenv from 'dotenv';
import { request } from 'undici';

dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY || 'dummy';

async function testGemini() {
    try {
        console.log(`Testing enter.pollinations.ai with model 'gemini-1.5-flash'...`);
        const { statusCode, body } = await request('https://enter.pollinations.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'gemini-1.5-flash',
                messages: [{ role: 'user', content: 'Hello' }],
            }),
        });
        console.log(`Status: ${statusCode}`);
        console.log(`Response: ${await body.text()}`);

    } catch (e) {
        console.error("Error:", e.message);
    }
}

testGemini();
