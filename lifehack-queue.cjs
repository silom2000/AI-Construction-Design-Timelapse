'use strict';

/**
 * Lifehack Queue — persistent queue for lifehack ideas extracted from long videos.
 *
 * Stores ideas in a flat JSON file (same pattern as history-manager.cjs).
 * Each item: { id, title, description, topicForLlm, category, source, status, createdAt }
 * Status: 'pending' | 'used' | 'skipped'
 */

const fs = require('fs');
const path = require('path');
const ai = require('./ai-client.cjs');

const QUEUE_FILE = path.join(__dirname, 'lifehack_queue.json');

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadQueue() {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch (e) {
        console.error('[LifehackQueue] Failed to load queue:', e.message);
        return [];
    }
}

function saveQueue(items) {
    try {
        fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
        console.error('[LifehackQueue] Failed to save queue:', e.message);
    }
}

function nextId(items) {
    if (items.length === 0) return 1;
    return Math.max(...items.map(i => i.id)) + 1;
}

// ─── Core operations ──────────────────────────────────────────────────────────

function getStats() {
    const items = loadQueue();
    const pending = items.filter(i => i.status === 'pending').length;
    const used    = items.filter(i => i.status === 'used').length;
    const skipped = items.filter(i => i.status === 'skipped').length;
    return { total: items.length, pending, used, skipped };
}

function getAll() {
    return loadQueue();
}

function getNext() {
    const items = loadQueue();
    return items.find(i => i.status === 'pending') || null;
}

function markUsed(id) {
    const items = loadQueue();
    const item = items.find(i => i.id === id);
    if (item) {
        item.status = 'used';
        item.usedAt = new Date().toISOString();
        saveQueue(items);
    }
    return item || null;
}

function skipItem(id) {
    const items = loadQueue();
    const item = items.find(i => i.id === id);
    if (item) {
        item.status = 'skipped';
        saveQueue(items);
    }
    return item || null;
}

function deleteItem(id) {
    const items = loadQueue().filter(i => i.id !== id);
    saveQueue(items);
    return { success: true };
}

function clearCompleted() {
    const items = loadQueue().filter(i => i.status === 'pending');
    saveQueue(items);
    return { success: true };
}

function clearPending() {
    const items = loadQueue().filter(i => i.status !== 'pending');
    saveQueue(items);
    return { removed: loadQueue().length !== items.length };
}

function clearAll() {
    saveQueue([]);
}

function addFromAmazonProduct(product) {
    if (!product || !product.code) return null;
    const items = loadQueue();
    const existing = items.find(i => i.productCode === product.code);
    if (existing) {
        return existing;
    }
    const topicForLlm = `PRODUIT TESTÉ AMAZON #${product.code}: ${product.title}. Problème: ${product.quote}. Solution/Science: ${product.verdict}. Points forts: ${(product.features || []).join('; ')}. Code outro: #${product.code}`;
    const newItem = {
        id: nextId(items),
        title: `[#${product.code}] ${product.title}`,
        description: product.quote,
        topicForLlm,
        category: product.category || 'home',
        source: product.amazonUrl || `https://silom2000.github.io/mes-trouvailles/#${product.code}`,
        productCode: product.code,
        amazonUrl: product.amazonUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    items.push(newItem);
    saveQueue(items);
    return newItem;
}

// ─── LLM extraction ──────────────────────────────────────────────────────────

/**
 * Analyzes a source (video transcript, screenshot text, or plain topic text)
 * and extracts all distinct lifehack ideas from it.
 * Returns an array of idea objects and stores them in the queue.
 */
async function extractLifehacks({ videoTranscript, screenshotText, rawText, sourceLabel, language, provider }) {
    const sourceSummary = videoTranscript || screenshotText || rawText || '';
    if (!sourceSummary.trim()) {
        throw new Error('No source content provided for lifehack extraction.');
    }

    const systemPrompt = `You are an expert at analyzing educational and tutorial content and extracting distinct, actionable lifehack ideas from it.

Your task: Read the provided content and extract EVERY distinct lifehack, tip, trick, or practical idea present.
Each idea must be self-contained — enough to create a 60-second TikTok video about it.

Output ONLY valid JSON — no markdown, no explanation, just the JSON object.`;

    const userPrompt = `Analyze this content and extract ALL distinct lifehack ideas from it:

"""
${sourceSummary.slice(0, 6000)}
"""

Return a JSON object in this exact format:
{
  "ideas": [
    {
      "title": "Short catchy title of the lifehack (in ${language || 'English'})",
      "description": "1-2 sentence summary of the trick (in ${language || 'English'})",
      "topicForLlm": "A clear English prompt for the AI scriptwriter, e.g. 'How to remove stubborn grease stains from pots using baking soda and vinegar'",
      "category": "kitchen | garden | cleaning | DIY | organizing | productivity | food | other"
    }
  ]
}

Rules:
- Extract EVERY distinct trick, even small ones
- Do NOT merge multiple tricks into one idea
- If the content has 10 tricks, return 10 ideas
- topicForLlm MUST always be in English
- title and description should be in ${language || 'English'}`;

    const raw = await ai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], true, provider);

    let parsed;
    try {
        // Strip potential markdown code fences
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
        parsed = JSON.parse(cleaned);
    } catch (e) {
        // Fallback: try to find JSON object in raw response
        const match = raw.match(/\{[\s\S]*"ideas"[\s\S]*\}/);
        if (!match) throw new Error('Failed to parse lifehack extraction response: ' + e.message);
        parsed = JSON.parse(match[0]);
    }

    const ideas = parsed.ideas || [];
    if (!Array.isArray(ideas) || ideas.length === 0) {
        throw new Error('No lifehack ideas were extracted from the content.');
    }

    const existing = loadQueue();
    const startId = existing.length === 0 ? 1 : Math.max(...existing.map(i => i.id)) + 1;
    const timestamp = new Date().toISOString();

    const newItems = ideas.map((idea, idx) => ({
        id: startId + idx,
        title: idea.title || `Lifehack ${startId + idx}`,
        description: idea.description || '',
        topicForLlm: idea.topicForLlm || idea.title || '',
        category: idea.category || 'other',
        source: sourceLabel || 'Manual',
        status: 'pending',
        createdAt: timestamp
    }));

    saveQueue([...existing, ...newItems]);
    console.log(`[LifehackQueue] Extracted and stored ${newItems.length} lifehacks.`);

    return { added: newItems.length, items: newItems };
}

// ─── IPC Registration ─────────────────────────────────────────────────────────

function registerLifehackQueueHandlers(ipcMain) {
    // Get queue statistics
    ipcMain.handle('lifehack-queue-stats', async () => {
        return getStats();
    });

    // Get all items
    ipcMain.handle('lifehack-queue-list', async () => {
        return getAll();
    });

    // Get next pending item
    ipcMain.handle('lifehack-queue-get-next', async () => {
        return getNext();
    });

    // Extract lifehacks from source content via LLM
    ipcMain.handle('lifehack-queue-extract', async (event, data) => {
        return await extractLifehacks(data);
    });

    // Mark item as used
    ipcMain.handle('lifehack-queue-mark-used', async (event, { id }) => {
        return markUsed(id);
    });

    // Skip an item
    ipcMain.handle('lifehack-queue-skip', async (event, { id }) => {
        return skipItem(id);
    });

    // Delete an item by ID
    ipcMain.handle('lifehack-queue-delete-item', async (event, { id }) => {
        return deleteItem(id);
    });

    // Clear completed / used / skipped items
    ipcMain.handle('lifehack-queue-clear-completed', async () => {
        return clearCompleted();
    });

    // Clear pending items
    ipcMain.handle('lifehack-queue-clear-pending', async () => {
        return clearPending();
    });

    // Clear everything
    ipcMain.handle('lifehack-queue-clear-all', async () => {
        clearAll();
        return { success: true };
    });

    // Add Amazon product to queue
    ipcMain.handle('lifehack-queue-add-amazon', async (event, { product }) => {
        return addFromAmazonProduct(product);
    });

    console.log('[LifehackQueue] IPC handlers registered.');
}

module.exports = { registerLifehackQueueHandlers, getStats, getAll, getNext, markUsed, skipItem, deleteItem, clearCompleted, clearPending, clearAll, extractLifehacks, addFromAmazonProduct };
