const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'completed_topics.json');

/**
 * Manages the history of completed video topics to avoid duplicates.
 * Topics are stored per language.
 */
class HistoryManager {
    constructor() {
        this.history = this.load();
    }

    load() {
        if (!fs.existsSync(HISTORY_FILE)) {
            return {};
        }
        try {
            return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
        } catch (e) {
            console.error('[History] Failed to load history:', e.message);
            return {};
        }
    }

    save() {
        try {
            fs.writeFileSync(HISTORY_FILE, JSON.stringify(this.history, null, 2));
        } catch (e) {
            console.error('[History] Failed to save history:', e.message);
        }
    }

    /**
     * Adds a topic to the history for a specific language.
     * @param {string} language - The language code (e.g., 'GB', 'FR').
     * @param {string} topic - The title of the completed topic.
     */
    addTopic(language, topic) {
        if (!this.history[language]) {
            this.history[language] = [];
        }
        if (!this.history[language].includes(topic)) {
            this.history[language].push(topic);
            this.save();
            console.log(`[History] Topic added for ${language}: "${topic}"`);
        }
    }

    /**
     * Gets the list of completed topics for a specific language.
     * @param {string} language - The language code.
     * @returns {string[]}
     */
    getTopics(language) {
        return this.history[language] || [];
    }
}

const historyManager = new HistoryManager();
module.exports = historyManager;
