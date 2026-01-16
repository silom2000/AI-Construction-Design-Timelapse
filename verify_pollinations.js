import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.POLLINATIONS_API_KEY || 'dummy';
console.log(`Using API Key: ${apiKey.substring(0, 5)}...`);

// Correct Base URL found during debugging
const openai = new OpenAI({
    apiKey: apiKey,
    baseURL: 'https://text.pollinations.ai/',
});

async function testConnection() {
    try {
        console.log("Testing connection to Pollinations AI with model 'openai-fast'...");
        const completion = await openai.chat.completions.create({
            model: 'openai-fast',
            messages: [{ role: 'user', content: 'Hello! Are you working?' }],
        });
        console.log("Response:", completion.choices[0].message.content);
        console.log("SUCCESS: Connection verified.");
    } catch (error) {
        console.error("ERROR: Failed to connect.", error);
    }
}

testConnection();
