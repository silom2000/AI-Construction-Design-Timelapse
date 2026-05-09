// ============ QUEUE MANAGER — SQLite-backed persistent task queue ============
// П.1: Очередь задач с персистентностью через SQLite.
// При перезапуске приложения незавершённые задачи восстанавливаются автоматически.

const path = require('path');
const fs = require('fs');

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.warn('[QueueManager] better-sqlite3 not available, falling back to JSON store:', e.message);
    Database = null;
}

const DB_PATH = path.join(__dirname, 'queue.db');
const JSON_FALLBACK_PATH = path.join(__dirname, 'queue_fallback.json');

// ── Статусы задач ─────────────────────────────────────────────────────────────
const STATUS = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
};

// ── Типы задач ────────────────────────────────────────────────────────────────
const TASK_TYPE = {
    GENERATE_IMAGE: 'generate_image',
    GENERATE_IMAGE_STAGE: 'generate_image_stage',
    GENERATE_VIDEOS: 'generate_videos',
    ASSEMBLE_VIDEO: 'assemble_video',
};

// ── SQLite backend ────────────────────────────────────────────────────────────
class SQLiteStore {
    constructor() {
        this.db = new Database(DB_PATH);
        this._init();
        console.log('[QueueManager] SQLite store initialized at:', DB_PATH);
    }

    _init() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id          TEXT PRIMARY KEY,
                type        TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'pending',
                payload     TEXT NOT NULL DEFAULT '{}',
                result      TEXT,
                error       TEXT,
                progress    INTEGER DEFAULT 0,
                total       INTEGER DEFAULT 0,
                created_at  INTEGER NOT NULL,
                updated_at  INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);
        `);
    }

    addTask(id, type, payload = {}) {
        const now = Date.now();
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO tasks (id, type, status, payload, created_at, updated_at)
            VALUES (?, ?, 'pending', ?, ?, ?)
        `);
        stmt.run(id, type, JSON.stringify(payload), now, now);
        console.log(`[QueueManager] Task added: [${type}] ${id}`);
        return id;
    }

    updateStatus(id, status, { result = null, error = null, progress = null, total = null } = {}) {
        const now = Date.now();
        const fields = ['status = ?', 'updated_at = ?'];
        const values = [status, now];
        if (result !== null) { fields.push('result = ?'); values.push(JSON.stringify(result)); }
        if (error !== null) { fields.push('error = ?'); values.push(error); }
        if (progress !== null) { fields.push('progress = ?'); values.push(progress); }
        if (total !== null) { fields.push('total = ?'); values.push(total); }
        values.push(id);
        this.db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    getTask(id) {
        const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
        return row ? this._deserialize(row) : null;
    }

    getPendingTasks() {
        return this.db.prepare(
            "SELECT * FROM tasks WHERE status IN ('pending', 'in_progress') ORDER BY created_at ASC"
        ).all().map(r => this._deserialize(r));
    }

    getAllTasks(limit = 50) {
        return this.db.prepare(
            'SELECT * FROM tasks ORDER BY created_at DESC LIMIT ?'
        ).all(limit).map(r => this._deserialize(r));
    }

    cancelTask(id) {
        this.updateStatus(id, STATUS.CANCELLED);
    }

    clearCompleted() {
        const info = this.db.prepare(
            "DELETE FROM tasks WHERE status IN ('completed', 'cancelled', 'failed') AND updated_at < ?"
        ).run(Date.now() - 24 * 60 * 60 * 1000); // старше 24ч
        console.log(`[QueueManager] Cleared ${info.changes} old completed tasks`);
        return info.changes;
    }

    _deserialize(row) {
        return {
            ...row,
            payload: this._safeJSON(row.payload, {}),
            result: row.result ? this._safeJSON(row.result, null) : null,
        };
    }

    _safeJSON(str, fallback) {
        try { return JSON.parse(str); } catch { return fallback; }
    }

    close() {
        this.db.close();
    }
}

// ── JSON fallback backend (если better-sqlite3 не скомпилирован) ──────────────
class JSONStore {
    constructor() {
        this.data = { tasks: {} };
        this._load();
        console.log('[QueueManager] JSON fallback store initialized at:', JSON_FALLBACK_PATH);
    }

    _load() {
        if (fs.existsSync(JSON_FALLBACK_PATH)) {
            try { this.data = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8')); } catch {}
        }
    }

    _save() {
        try { fs.writeFileSync(JSON_FALLBACK_PATH, JSON.stringify(this.data, null, 2)); } catch (e) {
            console.error('[QueueManager JSON] Save error:', e.message);
        }
    }

    addTask(id, type, payload = {}) {
        const now = Date.now();
        this.data.tasks[id] = { id, type, status: STATUS.PENDING, payload, result: null, error: null, progress: 0, total: 0, created_at: now, updated_at: now };
        this._save();
        return id;
    }

    updateStatus(id, status, { result = null, error = null, progress = null, total = null } = {}) {
        if (!this.data.tasks[id]) return;
        const t = this.data.tasks[id];
        t.status = status;
        t.updated_at = Date.now();
        if (result !== null) t.result = result;
        if (error !== null) t.error = error;
        if (progress !== null) t.progress = progress;
        if (total !== null) t.total = total;
        this._save();
    }

    getTask(id) { return this.data.tasks[id] || null; }

    getPendingTasks() {
        return Object.values(this.data.tasks)
            .filter(t => t.status === STATUS.PENDING || t.status === STATUS.IN_PROGRESS)
            .sort((a, b) => a.created_at - b.created_at);
    }

    getAllTasks(limit = 50) {
        return Object.values(this.data.tasks)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, limit);
    }

    cancelTask(id) { this.updateStatus(id, STATUS.CANCELLED); }

    clearCompleted() {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        let count = 0;
        for (const [id, t] of Object.entries(this.data.tasks)) {
            if (['completed', 'cancelled', 'failed'].includes(t.status) && t.updated_at < cutoff) {
                delete this.data.tasks[id];
                count++;
            }
        }
        if (count > 0) this._save();
        return count;
    }

    close() {}
}

// ── QueueManager — публичный API ──────────────────────────────────────────────
class QueueManager {
    constructor() {
        this.store = Database ? new SQLiteStore() : new JSONStore();
        // При старте переводим зависшие in_progress обратно в pending
        this._recoverStuckTasks();
    }

    _recoverStuckTasks() {
        const pending = this.store.getPendingTasks();
        const stuck = pending.filter(t => t.status === STATUS.IN_PROGRESS);
        for (const task of stuck) {
            console.warn(`[QueueManager] Recovering stuck task: ${task.id} (${task.type})`);
            this.store.updateStatus(task.id, STATUS.PENDING, { error: 'Recovered after restart' });
        }
        if (stuck.length > 0) {
            console.log(`[QueueManager] Recovered ${stuck.length} stuck task(s) from previous session`);
        }
    }

    /**
     * Генерирует уникальный ID для задачи.
     */
    generateId(type, themeName = '') {
        const safe = (themeName || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
        return `${type}_${safe}_${Date.now()}`;
    }

    /**
     * Добавить задачу в очередь. Возвращает ID задачи.
     */
    enqueue(type, payload = {}) {
        const id = this.generateId(type, payload.themeName);
        return this.store.addTask(id, type, payload);
    }

    /**
     * Пометить задачу как запущенную.
     */
    markInProgress(id, total = 0) {
        this.store.updateStatus(id, STATUS.IN_PROGRESS, { total });
    }

    /**
     * Обновить прогресс задачи.
     */
    updateProgress(id, progress, total) {
        this.store.updateStatus(id, STATUS.IN_PROGRESS, { progress, total });
    }

    /**
     * Пометить задачу как завершённую успешно.
     */
    markCompleted(id, result = null) {
        this.store.updateStatus(id, STATUS.COMPLETED, { result, progress: 100 });
        console.log(`[QueueManager] Task completed: ${id}`);
    }

    /**
     * Пометить задачу как упавшую с ошибкой.
     */
    markFailed(id, error = '') {
        this.store.updateStatus(id, STATUS.FAILED, { error: String(error) });
        console.error(`[QueueManager] Task failed: ${id} — ${error}`);
    }

    /**
     * Получить задачу по ID.
     */
    getTask(id) { return this.store.getTask(id); }

    /**
     * Получить все незавершённые задачи (для отображения в UI).
     */
    getPendingTasks() { return this.store.getPendingTasks(); }

    /**
     * Получить историю задач.
     */
    getAllTasks(limit = 50) { return this.store.getAllTasks(limit); }

    /**
     * Отменить задачу.
     */
    cancelTask(id) { this.store.cancelTask(id); }

    /**
     * Очистить старые завершённые задачи (вызывается при старте).
     */
    clearOldTasks() { return this.store.clearCompleted(); }

    close() { this.store.close(); }
}

// Singleton
const queueManager = new QueueManager();
queueManager.clearOldTasks();

module.exports = { queueManager, STATUS, TASK_TYPE };
