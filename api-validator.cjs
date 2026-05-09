// Не блокирует запуск — только предупреждает. Исходные функции не затронуты.
// ПРИОРИТЕТ: Теперь проверяет подключение к G-Labs Webhook API Server и локальному AI серверу.

const { request } = require('undici');
const fs = require('fs');
const path = require('path');

/**
 * Проверить G-Labs Webhook API Server.
 */
async function validateGLabs() {
    const webhookUrl = process.env.GLABS_WEBHOOK_URL?.trim() || 'http://127.0.0.1:8765';
    const apiKey = process.env.GLABS_API_KEY?.trim();
    
    const result = { 
        name: 'G-Labs Webhook Server', 
        key: apiKey ? '***' + apiKey.slice(-4) : '(no key)', 
        valid: false, 
        message: '' 
    };

    try {
        const { statusCode, body } = await request(`${webhookUrl}/api/health`, {
            method: 'GET',
            headers: apiKey ? { 'X-API-Key': apiKey } : {},
            bodyTimeout: 5000,
            headersTimeout: 5000,
        });
        
        await body.text();
        if (statusCode === 200) {
            result.valid = true;
            result.message = 'Server reachable & OK';
        } else {
            result.valid = false;
            result.message = `Server returned status ${statusCode}`;
        }
    } catch (e) {
        result.valid = false;
        result.message = `G-Labs unreachable: ${e.message}`;
    }
    return result;
}

/**
 * Проверить кастомный сервер (Gemini/Custom AI).
 */
async function validateCustomAI(apiUrl, apiKey) {
    const result = { name: 'Gemini/Custom AI Server', key: apiKey ? '***' + apiKey.slice(-4) : '(no key)', valid: false, message: '' };
    if (!apiUrl) {
        result.message = 'Not configured';
        return result;
    }
    try {
        const { statusCode, body } = await request(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body: JSON.stringify({
                model: 'gemini-3.1-pro-high',
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 5,
            }),
            bodyTimeout: 5000,
            headersTimeout: 5000,
        });
        await body.text();
        if (statusCode === 200) {
            result.valid = true;
            result.message = 'Connected';
        } else {
            result.valid = false;
            result.message = `Status ${statusCode}`;
        }
    } catch (e) {
        result.valid = false;
        result.message = `Error: ${e.message}`;
    }
    return result;
}

/**
 * Главная функция валидации — запускает все проверки параллельно.
 */
async function validateAllKeys() {
    console.log(`[APIValidator] Validating connection to G-Labs & Custom AI...`);

    const checks = [
        validateGLabs(),
        validateCustomAI(process.env.CUSTOM_AI_URL, process.env.CUSTOM_AI_API_KEY),
    ];

    const results = await Promise.allSettled(checks);
    return results.map(r => r.status === 'fulfilled' ? r.value : { valid: false, message: r.reason?.message || 'Unknown error' });
}

module.exports = { validateAllKeys };
