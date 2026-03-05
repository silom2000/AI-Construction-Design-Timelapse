import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Zap, Image as ImageIcon, Video, CheckCircle, XCircle, Clock, Play } from 'lucide-react';
import { GLabsTask } from './electron.d';

// ── Типы ──────────────────────────────────────────────────────────────────────
type GenerateMode = 'image' | 'video';
type StatusFilter = 'all' | 'pending' | 'running' | 'completed' | 'failed';

const STATUS_COLOR: Record<string, string> = {
  pending:   '#f59e0b',
  running:   '#3b82f6',
  completed: '#10b981',
  failed:    '#ef4444',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending:   <Clock size={13} />,
  running:   <RefreshCw size={13} className="spin" />,
  completed: <CheckCircle size={13} />,
  failed:    <XCircle size={13} />,
};

// ── Вспомогательные компоненты ────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
      backgroundColor: `${STATUS_COLOR[status] ?? '#888'}22`,
      color: STATUS_COLOR[status] ?? '#888',
      border: `1px solid ${STATUS_COLOR[status] ?? '#888'}44`,
    }}>
      {STATUS_ICON[status]}
      {status.toUpperCase()}
    </span>
  );
}

function TaskCard({ task, onRefresh }: { task: GLabsTask; onRefresh: (id: string) => void }) {
  return (
    <div style={{
      background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: '10px',
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {task.type === 'image' ? <ImageIcon size={14} color="#60a5fa" /> : <Video size={14} color="#a78bfa" />}
          <span style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
            {task.task_id.slice(0, 16)}…
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <StatusBadge status={task.status} />
          <button
            onClick={() => onRefresh(task.task_id)}
            title="Обновить статус"
            style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', padding: '2px' }}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: '12px', color: '#ccc', lineHeight: 1.4 }}>
        {task.prompt.length > 120 ? task.prompt.slice(0, 120) + '…' : task.prompt}
      </p>

      {task.error && (
        <p style={{ margin: 0, fontSize: '11px', color: '#ef4444' }}>
          ⚠ {task.error}
        </p>
      )}

      {task.results && task.results.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
          {task.results.map((url, i) =>
            task.type === 'image' ? (
              <img key={i} src={url} alt={`result-${i}`} style={{
                width: '80px', height: '80px', objectFit: 'cover',
                borderRadius: '6px', border: '1px solid #333',
              }} />
            ) : (
              <video key={i} src={url} controls muted style={{
                width: '140px', height: '80px', borderRadius: '6px',
                border: '1px solid #333', objectFit: 'cover',
              }} />
            )
          )}
        </div>
      )}

      <div style={{ fontSize: '10px', color: '#555' }}>
        {new Date(task.created_at * 1000).toLocaleString()}
        {task.completed_at && ` → ${new Date(task.completed_at * 1000).toLocaleString()}`}
      </div>
    </div>
  );
}

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function GLabsTab() {
  // Statuses
  const [serverRunning, setServerRunning] = useState<boolean | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);

  // Tasks
  const [tasks, setTasks] = useState<GLabsTask[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Generate form
  const [mode, setMode] = useState<GenerateMode>('image');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [count, setCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastResults, setLastResults] = useState<string[]>([]);

  // Live progress log
  const [progressLog, setProgressLog] = useState<string[]>([]);

  // ── Health check ──────────────────────────────────────────────────────────
  const checkHealth = useCallback(async () => {
    try {
      const res = await window.electronAPI.glabsHealthCheck();
      setServerRunning(res.running);
    } catch {
      setServerRunning(false);
    }
  }, []);

  // ── Launch server ─────────────────────────────────────────────────────────
  const handleLaunch = async () => {
    setIsLaunching(true);
    try {
      const res = await window.electronAPI.glabsLaunch();
      if (res.success) {
        await checkHealth();
      } else {
        alert(`Ошибка запуска: ${res.error}`);
      }
    } finally {
      setIsLaunching(false);
    }
  };

  // ── Load tasks ────────────────────────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    setIsLoadingTasks(true);
    try {
      const res = await window.electronAPI.glabsListTasks();
      setTasks(res.tasks ?? []);
    } catch (e) {
      console.error('[GLabsTab] listTasks error', e);
    } finally {
      setIsLoadingTasks(false);
    }
  }, []);

  // ── Refresh single task ───────────────────────────────────────────────────
  const refreshTask = async (taskId: string) => {
    try {
      const updated = await window.electronAPI.glabsTaskStatus(taskId);
      setTasks(prev => prev.map(t => t.task_id === taskId ? updated : t));
    } catch (e) {
      console.error('[GLabsTab] taskStatus error', e);
    }
  };

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!prompt.trim()) { alert('Введите промпт!'); return; }
    setIsGenerating(true);
    setLastResults([]);
    setProgressLog([]);

    try {
      if (mode === 'image') {
        const urls = await window.electronAPI.glabsGenerateImage({
          prompt: prompt.trim(),
          model: model || undefined,
          aspectRatio,
          count,
        });
        setLastResults(urls);
      } else {
        const url = await window.electronAPI.glabsGenerateVideo({
          prompt: prompt.trim(),
          model: model || undefined,
          aspectRatio,
        });
        setLastResults([url]);
      }
      await loadTasks();
    } catch (e: any) {
      alert(`Ошибка генерации: ${e?.message ?? e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    checkHealth();
    loadTasks();

    // Subscribe to live task progress
    window.electronAPI.onGLabsTaskProgress((data) => {
      const msg = `[${data.type}] ${data.taskId.slice(0, 8)}… → ${data.status}${data.attempt ? ` (attempt ${data.attempt})` : ''}`;
      setProgressLog(prev => [msg, ...prev].slice(0, 30));
      // Auto-refresh that task in local state
      refreshTask(data.taskId);
    });

    // Health ping every 30s
    const healthTimer = setInterval(checkHealth, 30_000);
    return () => {
      clearInterval(healthTimer);
      window.electronAPI.removeGLabsProgressListener();
    };
  }, [checkHealth, loadTasks]);

  // ── Filtered tasks ────────────────────────────────────────────────────────
  const filteredTasks = statusFilter === 'all'
    ? tasks
    : tasks.filter(t => t.status === statusFilter);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', height: '100%', overflow: 'hidden',
      backgroundColor: '#0d0d0d', color: '#e2e8f0',
    }}>

      {/* ── LEFT PANEL: controls ────────────────────────────────────────── */}
      <aside style={{
        width: '300px', flexShrink: 0,
        borderRight: '1px solid #222',
        display: 'flex', flexDirection: 'column', gap: '0',
        overflowY: 'auto',
        padding: '16px',
      }}>

        {/* Server status */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '9px', height: '9px', borderRadius: '50%',
              backgroundColor: serverRunning === null ? '#888' : serverRunning ? '#10b981' : '#ef4444',
              boxShadow: serverRunning ? '0 0 6px #10b981' : undefined,
            }} />
            <span style={{ fontSize: '12px', color: '#aaa' }}>
              {serverRunning === null ? 'Checking…' : serverRunning ? 'G-Labs Online' : 'G-Labs Offline'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={checkHealth} title="Ping" style={iconBtn}>
              <RefreshCw size={13} />
            </button>
            {!serverRunning && (
              <button onClick={handleLaunch} disabled={isLaunching} style={{ ...iconBtn, color: '#10b981' }}>
                {isLaunching ? <RefreshCw size={13} className="spin" /> : <Play size={13} />}
              </button>
            )}
          </div>
        </div>

        {/* Mode selector */}
        <label style={labelStyle}>Тип генерации</label>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {(['image', 'video'] as GenerateMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...modeBtn,
                borderColor: mode === m ? '#3b82f6' : '#333',
                color: mode === m ? '#3b82f6' : '#666',
                background: mode === m ? 'rgba(59,130,246,0.08)' : 'transparent',
              }}
            >
              {m === 'image' ? <ImageIcon size={13} /> : <Video size={13} />}
              {m === 'image' ? 'Изображение' : 'Видео'}
            </button>
          ))}
        </div>

        {/* Prompt */}
        <label style={labelStyle}>Промпт</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={4}
          placeholder="Describe your scene…"
          style={textareaStyle}
        />

        {/* Model */}
        <label style={labelStyle}>Модель (опционально)</label>
        <input
          value={model}
          onChange={e => setModel(e.target.value)}
          placeholder="e.g. flux-pro, wan-2.6 …"
          style={inputStyle}
        />

        {/* Aspect ratio */}
        <label style={labelStyle}>Соотношение сторон</label>
        <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} style={selectStyle}>
          <option value="9:16">Portrait 9:16</option>
          <option value="16:9">Landscape 16:9</option>
          <option value="1:1">Square 1:1</option>
          <option value="4:3">4:3</option>
        </select>

        {/* Count (image only) */}
        {mode === 'image' && (
          <>
            <label style={labelStyle}>Количество ({count})</label>
            <input
              type="range" min={1} max={4} value={count}
              onChange={e => setCount(Number(e.target.value))}
              style={{ width: '100%', marginBottom: '12px', accentColor: '#3b82f6' }}
            />
          </>
        )}

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !serverRunning}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            padding: '10px', borderRadius: '8px', border: 'none', cursor: isGenerating ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            color: '#fff', fontWeight: 700, fontSize: '13px',
            opacity: isGenerating || !serverRunning ? 0.6 : 1,
            marginBottom: '16px',
          }}
        >
          {isGenerating
            ? <><RefreshCw size={15} className="spin" /> Generating…</>
            : <><Zap size={15} /> GENERATE</>
          }
        </button>

        {/* Last results preview */}
        {lastResults.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Последние результаты</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {lastResults.map((url, i) =>
                mode === 'image' ? (
                  <img key={i} src={url} alt="" style={{
                    width: '80px', height: '80px', objectFit: 'cover',
                    borderRadius: '6px', border: '1px solid #333',
                  }} />
                ) : (
                  <video key={i} src={url} controls muted style={{
                    width: '130px', height: '80px', borderRadius: '6px',
                    border: '1px solid #333',
                  }} />
                )
              )}
            </div>
          </div>
        )}

        {/* Progress log */}
        {progressLog.length > 0 && (
          <div style={{
            background: '#111', borderRadius: '8px', padding: '8px 10px',
            fontFamily: 'monospace', fontSize: '10px', color: '#10b981',
            maxHeight: '140px', overflowY: 'auto',
          }}>
            {progressLog.map((l, i) => <div key={i}>{i === 0 ? '>' : ' '} {l}</div>)}
          </div>
        )}
      </aside>

      {/* ── RIGHT PANEL: task list ──────────────────────────────────────── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#ccc' }}>
            Задачи G-Labs
          </span>
          <span style={{ fontSize: '11px', color: '#555' }}>
            ({filteredTasks.length}{statusFilter !== 'all' ? ` / ${tasks.length}` : ''})
          </span>

          {/* Filter chips */}
          <div style={{ display: 'flex', gap: '6px', marginLeft: '8px' }}>
            {(['all', 'pending', 'running', 'completed', 'failed'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                style={{
                  padding: '3px 10px', borderRadius: '10px', border: '1px solid',
                  fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                  borderColor: statusFilter === f ? (STATUS_COLOR[f] ?? '#3b82f6') : '#333',
                  color: statusFilter === f ? (STATUS_COLOR[f] ?? '#3b82f6') : '#555',
                  background: statusFilter === f ? `${STATUS_COLOR[f] ?? '#3b82f6'}18` : 'transparent',
                }}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
            <button
              onClick={loadTasks}
              disabled={isLoadingTasks}
              style={{ ...iconBtn, padding: '5px 12px', borderRadius: '7px', fontSize: '11px' }}
            >
              {isLoadingTasks ? <RefreshCw size={13} className="spin" /> : <RefreshCw size={13} />}
              Обновить
            </button>
          </div>
        </div>

        {/* Task cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredTasks.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#444', fontSize: '13px', flexDirection: 'column', gap: '10px',
            }}>
              <Zap size={32} color="#333" />
              {tasks.length === 0 ? 'Задач пока нет. Запустите генерацию!' : `Нет задач со статусом "${statusFilter}"`}
            </div>
          ) : (
            filteredTasks.map(task => (
              <TaskCard key={task.task_id} task={task} onRefresh={refreshTask} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

// ── Inline style constants ────────────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: '#555',
  letterSpacing: '0.08em', textTransform: 'uppercase',
  marginBottom: '4px', display: 'block',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: '7px',
  border: '1px solid #2a2a2a', background: '#111', color: '#ddd',
  fontSize: '12px', marginBottom: '12px', boxSizing: 'border-box',
  outline: 'none',
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  background: 'none', border: '1px solid #2a2a2a', borderRadius: '6px',
  color: '#666', cursor: 'pointer', padding: '4px 8px', fontSize: '11px',
};

const modeBtn: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
  padding: '7px 10px', borderRadius: '7px', border: '1px solid',
  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  transition: 'all 0.15s',
};
