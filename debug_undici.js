import dotenv from 'dotenv';
import { request } from 'undici';

dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY || 'dummy';

async function testEndpoint(url, model) {
    try {
        console.log(`Testing URL: ${url} with model: ${model}`);
        const { statusCode, body } = await request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: 'Hello' }],
            }),
        });
        console.log(`Status: ${statusCode}`);
        if (statusCode !== 200) {
            console.log(`Response: ${await body.text()}`);
        } else {
            console.log("SUCCESS!");
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
    console.log('---');
}

async function runTests() {
    await testEndpoint('https://enter.pollinations.ai/openai', 'openai-fast'); // Maybe this?
    await testEndpoint('https://text.pollinations.ai/', 'openai-fast'); // Old endpoint?
    await testEndpoint('https://text.pollinations.ai/openai', 'openai-fast');
    await testEndpoint('https://enter.pollinations.ai/v1/chat/completions', 'openai'); // Try default model
    await testEndpoint('https://enter.pollinations.ai/v1/chat/completions', 'gpt-4o'); // Maybe?
    await testEndpoint('https://text.pollinations.ai/v1/chat/completions', 'openai-fast');
}

runTests();
