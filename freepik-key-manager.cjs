// ============ FREEPIK KEY MANAGER — Auto-rotation on limit/error ============
// Keys in .env: FREEPIK_API_KEY_1, FREEPIK_API_KEY_2, ... or FREEPIK_API_KEY (single)

class FreepikKeyManager {
    constructor() {
        this.keys = [];
        this.currentIndex = 0;
        this._loaded = false;
    }

    // Lazy load — called on first use, AFTER dotenv has run in electron.cjs
    _ensureLoaded() {
        if (this._loaded) return;
        this._loaded = true;

        const keys = [];

        // Support FREEPIK_API_KEY (single or comma-separated) and FREEPIK_API_KEY_1, _2...
        // Also add KIE_KEY as fallback per common config pattern
        const addKey = (k) => {
            if (!k) return;
            const parts = k.split(',').map(v => v.trim()).filter(v => v.length > 0);
            for (const p of parts) {
                if (!keys.includes(p)) keys.push(p);
            }
        };

        addKey(process.env.FREEPIK_API_KEY);
        addKey(process.env.FREEPIK_API_KEY_1); // Check explicitly just in case loop starts from 1
        addKey(process.env.KIE_KEY);

        let i = 1;
        while (process.env[`FREEPIK_API_KEY_${i}`]?.trim()) {
            addKey(process.env[`FREEPIK_API_KEY_${i}`]);
            i++;
        }

        this.keys = keys;

        if (this.keys.length > 0) {
            console.log(`[FreepikKeyManager] Successfully loaded ${this.keys.length} key(s).`);
        } else {
            console.warn('[FreepikKeyManager] WARNING: No FREEPIK_API_KEY or KIE_KEY found in .env!');
            console.warn('[FreepikKeyManager] Generation functions will fail until keys are added.');
        }
    }

    /** Current active key */
    current() {
        this._ensureLoaded();
        if (this.keys.length === 0) throw new Error('No FREEPIK_API_KEY configured in .env');
        return this.keys[this.currentIndex];
    }

    /** Rotate to next key. Returns true if rotated, false if only 1 key */
    rotate(reason = '') {
        this._ensureLoaded();
        if (this.keys.length <= 1) {
            console.warn(`[FreepikKeyManager] Only ${this.keys.length} key(s) available, cannot rotate. Reason: ${reason}`);
            return false;
        }
        const prev = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % this.keys.length;
        console.warn(`[FreepikKeyManager] Rotating key ${prev + 1} → ${this.currentIndex + 1}/${this.keys.length}. Reason: ${reason}`);
        return true;
    }

    /** Check if HTTP status/body indicates a limit or auth error */
    isLimitError(statusCode, responseText = '') {
        if ([429, 402, 403].includes(statusCode)) return true;
        const body = responseText.toLowerCase();
        return (
            body.includes('limit') ||
            body.includes('quota') ||
            body.includes('exceeded') ||
            body.includes('insufficient') ||
            body.includes('unauthorized') ||
            body.includes('invalid api key') ||
            body.includes('rate limit') ||
            body.includes('too many requests')
        );
    }

    totalKeys() { this._ensureLoaded(); return this.keys.length; }
    currentKeyIndex() { this._ensureLoaded(); return this.currentIndex + 1; }
}

// Singleton — shared across electron.cjs and skeleton-handlers.cjs
const manager = new FreepikKeyManager();
module.exports = manager;
