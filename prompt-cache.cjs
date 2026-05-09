// ============ PROMPT CACHE — кеширование промптов для экономии API-вызовов ============
// П.5: Переиспользование успешно сгенерированных промптов.
// Кеш хранится в prompt_cache.json рядом с проектом.
// Ключ кеша = хеш (themeName + stageCount + aspectRatio).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_FILE = path.join(__dirname, 'prompt_cache.json');
// Срок жизни кеша — 7 дней (промпты актуальны для одной и той же темы)
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

class PromptCache {
    constructor() {
        this._data = {}; // { [cacheKey]: { prompts, createdAt, themeName, stageCount } }
        this._load();
        this._evictExpired();
    }

    _load() {
        if (fs.existsSync(CACHE_FILE)) {
            try {
                this._data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
                console.log(`[PromptCache] Loaded ${Object.keys(this._data).length} cached prompt set(s)`);
            } catch (e) {
                console.warn('[PromptCache] Failed to load cache, starting fresh:', e.message);
                this._data = {};
            }
        }
    }

    _save() {
        try {
            fs.writeFileSync(CACHE_FILE, JSON.stringify(this._data, null, 2));
        } catch (e) {
            console.error('[PromptCache] Failed to save cache:', e.message);
        }
    }

    /**
     * Генерирует уникальный ключ кеша на основе параметров генерации.
     */
    _makeKey(themeName, stageCount, aspectRatio) {
        const raw = `${themeName.trim().toLowerCase()}|${stageCount}|${aspectRatio}`;
        return crypto.createHash('md5').update(raw).digest('hex');
    }

    /**
     * Удалить устаревшие записи.
     */
    _evictExpired() {
        const cutoff = Date.now() - CACHE_TTL_MS;
        let count = 0;
        for (const [key, entry] of Object.entries(this._data)) {
            if (entry.createdAt < cutoff) {
                delete this._data[key];
                count++;
            }
        }
        if (count > 0) {
            console.log(`[PromptCache] Evicted ${count} expired entry(s)`);
            this._save();
        }
    }

    /**
     * Получить кешированные промпты, если они есть и не устарели.
     * @returns {Object|null} объект вида { image1: "...", image2: "...", ... } или null
     */
    get(themeName, stageCount, aspectRatio) {
        const key = this._makeKey(themeName, stageCount, aspectRatio);
        const entry = this._data[key];
        if (!entry) return null;

        const age = Date.now() - entry.createdAt;
        if (age > CACHE_TTL_MS) {
            delete this._data[key];
            this._save();
            return null;
        }

        const ageHours = Math.round(age / 3600000);
        console.log(`[PromptCache] HIT for "${themeName}" (${stageCount} stages, ${aspectRatio}) — age: ${ageHours}h`);
        return entry.prompts;
    }

    /**
     * Сохранить промпты в кеш.
     * @param {string} themeName
     * @param {number} stageCount
     * @param {string} aspectRatio
     * @param {Object} prompts - объект { image1: "...", image2: "..." }
     */
    set(themeName, stageCount, aspectRatio, prompts) {
        const key = this._makeKey(themeName, stageCount, aspectRatio);
        this._data[key] = {
            themeName,
            stageCount,
            aspectRatio,
            prompts,
            createdAt: Date.now(),
        };
        this._save();
        console.log(`[PromptCache] Cached prompts for "${themeName}" (${stageCount} stages, ${aspectRatio})`);
    }

    /**
     * Принудительно сбросить кеш для конкретной темы.
     */
    invalidate(themeName, stageCount, aspectRatio) {
        const key = this._makeKey(themeName, stageCount, aspectRatio);
        if (this._data[key]) {
            delete this._data[key];
            this._save();
            console.log(`[PromptCache] Invalidated cache for "${themeName}"`);
        }
    }

    /**
     * Полная очистка всего кеша.
     */
    clear() {
        this._data = {};
        this._save();
        console.log('[PromptCache] Cache cleared');
    }

    /**
     * Статистика кеша для отображения в UI.
     */
    getStats() {
        const entries = Object.values(this._data);
        return {
            total: entries.length,
            themes: entries.map(e => e.themeName),
        };
    }
}

// Singleton
const promptCache = new PromptCache();
module.exports = promptCache;
