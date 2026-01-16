import { request } from 'undici';

async function debugResponse() {
    try {
        const apiKey = 'dummy'; // or process.env.POLLINATIONS_API_KEY
        console.log(`Testing text.pollinations.ai with model 'openai-fast'...`);

        // System prompt from electron.cjs
        const systemPrompt = `You are a Professional AI Prompt Builder. Generate a simplified list of 3 distinct Luxury Interior Design Concepts. 1. Style A... 2. Style B... 3. Style C...`;

        const { statusCode, body } = await request('https://text.pollinations.ai/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'openai-fast',
                messages: [{ role: 'system', content: systemPrompt }],
            }),
        });

        console.log("Status Code:", statusCode);
        const responseText = await body.text();
        console.log("Raw Response Body:");
        console.log(responseText);

    } catch (error) {
        console.error("Error:", error);
    }
}

debugResponse();
