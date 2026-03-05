import React, { useState } from 'react';
import './App.css';
import SkeletonTab from './SkeletonTab';
import StudioTab from './StudioTab';
import GLabsTab from './GLabsTab';
import './TimelapseTab.css';
import { RefreshCw, Zap, Image as ImageIcon, Video, Download } from 'lucide-react';

interface Theme {
  id: number;
  name: string;
}

type AppTab = 'timelapse' | 'skeleton' | 'health' | 'objects' | 'glabs';

// ── П.3: Результат валидации API-ключа ───────────────────────────────────────
interface ApiValidationResult {
  name: string;
  key: string;
  valid: boolean;
  message: string;
  credits?: number | null;
}

// ── П.2: Прогресс генерации изображения ──────────────────────────────────────
interface ImageProgressData {
  stage: number;
  total: number;
  message: string;
  status: 'prompts' | 'generating' | 'preparing' | 'done' | 'error';
  taskId?: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('timelapse');
  const [themes, setThemes] = useState<Theme[]>(() => {
    const saved = localStorage.getItem('themes');
    return saved ? JSON.parse(saved) : Array.from({ length: 15 }, (_, i) => ({
      id: i,
      name: `Тема ${i + 1}`,
    }));
  });

  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [stageCount, setStageCount] = useState(6);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [generatedImageUrls, setGeneratedImageUrls] = useState<(string | null)[]>(new Array(6).fill(null));
  const [regeneratingStages, setRegeneratingStages] = useState<boolean[]>(new Array(6).fill(false));

  // Video generation state
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoStatusLog, setVideoStatusLog] = useState<string[]>([]);
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);

  // Video generation settings
  const [videoResolution, setVideoResolution] = useState<"720p" | "1080p">("720p");
  const [videoDuration, setVideoDuration] = useState<"5" | "10">("5");

  // Assembly state
  const [isAssemblingVideo, setIsAssemblingVideo] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [userContext, setUserContext] = useState("Luxury Interior Renovation");

  // Image model selection
  const [imageModel, setImageModel] = useState<"zimage" | "imagen-4" | "grok-imagine" | "klein">("zimage");

  // ── П.3: Валидация API-ключей ─────────────────────────────────────────────
  const [apiValidation, setApiValidation] = useState<ApiValidationResult[] | null>(null);
  const [isValidatingKeys, setIsValidatingKeys] = useState(false);

  // ── П.2: Прогресс генерации изображений ──────────────────────────────────
  const [imageProgress, setImageProgress] = useState<ImageProgressData | null>(null);

  React.useEffect(() => {
    // Listen for video progress updates
    window.electronAPI.onVideoProgress((data) => {
      console.log('[Video Progress]', data);
      if (data.message) {
        setVideoStatusLog(prev => [data.message, ...prev].slice(0, 10)); // Keep last 10 log entries
      }
      // UPDATE: Check for 'done' status and update generated URLs with video path
      if (data.status === 'done' && data.videoUrl && data.current > 0) {
        setGeneratedImageUrls(prev => {
          const newArr = [...prev];
          // data.current is returned as i+1 (1-based index)
          // We map Stage 1 (idx 0) -> Image
          // Video 1 (idx 1) -> Video 1
          if (data.current < newArr.length) {
            newArr[data.current] = data.videoUrl;
          }
          return newArr;
        });
      }
    });

    // Listen for assembly progress updates
    window.electronAPI.onAssemblyProgress((data) => {
      console.log('[Assembly Progress]', data);
    });

    // ── П.2: Подписка на прогресс генерации изображений ───────────────────
    window.electronAPI.onImageProgress((data: ImageProgressData) => {
      console.log('[Image Progress]', data);
      setImageProgress(data);
      // Сбрасываем прогресс через 3 сек после завершения
      if (data.status === 'done' || data.status === 'error') {
        setTimeout(() => setImageProgress(null), 3000);
      }
    });

    // ── П.3: Автовалидация API-ключей при старте ──────────────────────────
    const runValidation = async () => {
      setIsValidatingKeys(true);
      try {
        const results = await window.electronAPI.validateApiKeys();
        setApiValidation(results);
      } catch (e) {
        console.error('[App] API validation failed:', e);
      } finally {
        setIsValidatingKeys(false);
      }
    };
    runValidation();
  }, []);

  React.useEffect(() => {
    localStorage.setItem('themes', JSON.stringify(themes));
  }, [themes]);

  const handleResetThemes = () => {
    setThemes([]);
    setSelectedTheme(null);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    localStorage.removeItem('themes');
  };

  const handleThemeSelection = (theme: Theme) => {
    setSelectedTheme(theme);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    setRegeneratingStages(new Array(stageCount).fill(false));
  };

  const handleGenerateThemes = async () => {
    setIsLoadingThemes(true);
    setSelectedTheme(null);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    try {
      const content = await window.electronAPI.generateThemes(userContext);

      console.log("Raw themes response:", content);

      const newThemes = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => /^\d+[\.\)]/.test(line) || line.startsWith('- **')) // Accept "1.", "1)", or "- **Title**"
        .map((line: string, index: number) => {
          // Try to extract bold text first
          const boldMatch = line.match(/\*\*(.*?)\*\*/);
          let name = "";

          if (boldMatch) {
            name = boldMatch[1];
          } else {
            // Remove numbering like "1. ", "1) ", "- "
            name = line.replace(/^(\d+[\.\)]|-)\s*/, '');
            // Remove trailing colons
            name = name.replace(/:\s*$/, '');
          }

          // Clean up common extra text
          name = name.trim();

          return {
            id: index,
            name: name || `Вариант ${index + 1}`,
          };
        });

      if (newThemes.length > 0) {
        setThemes(newThemes);
      } else {
        console.warn("Could not parse themes. Raw content:", content);
        // Fallback: split by double newlines if standard parsing fails
        const fallbackThemes = content.split(/\n\n+/).filter(s => s.length > 10).slice(0, 5).map((s, i) => ({
          id: i,
          name: s.substring(0, 80).replace(/\*\*/g, '').split('\n')[0]
        }));

        if (fallbackThemes.length > 0) {
          setThemes(fallbackThemes);
        } else {
          alert("Не удалось распознать темы. Смотрите консоль (F12) для деталей.");
        }
      }
    } catch (error) {
      console.error("Failed to generate themes:", error);
      alert("Ошибка генерации тем. Проверьте API ключи.");
    } finally {
      setIsLoadingThemes(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!selectedTheme) return;
    setIsGeneratingImage(true);
    setGeneratedImageUrls(new Array(stageCount).fill(null));

    try {
      // 1. Generate prompts and Stage 1
      const imageUrls = await window.electronAPI.generateImage(selectedTheme.name, stageCount, aspectRatio, imageModel);
      const timestamp = Date.now();

      let stage1Url = null;
      if (Array.isArray(imageUrls)) {
        stage1Url = imageUrls[0] ? `${imageUrls[0]}?t=${timestamp}` : null;
      } else if (typeof imageUrls === 'string') {
        stage1Url = `${imageUrls}?t=${timestamp}`;
      }

      setGeneratedImageUrls(() => {
        const newArr = new Array(stageCount).fill(null);
        newArr[0] = stage1Url;
        return newArr;
      });

      if (!stage1Url) throw new Error("Stage 1 failed to generate");

      // NOTE: Stages 2-6 are NO LONGER pre-generated.
      // They will be created automatically during recursive video generation
      // by extracting the last frame of each video.
      console.log("[Recursive Mode] Only Stage 1 generated. Subsequent stages will be created from video frames.");

    } catch (error) {
      console.error("Failed full sequence generation:", error);
      alert("Сбой при автоматической генерации. Попробуйте сгенерировать оставшиеся этапы вручную.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleRegenerateSingle = async (index: number) => {
    if (!selectedTheme) return;
    setRegeneratingStages(prev => {
      const newArr = [...prev];
      if (newArr.length < stageCount) {
        const temp = new Array(stageCount).fill(false);
        prev.forEach((v, i) => temp[i] = v);
        temp[index] = true;
        return temp;
      }
      newArr[index] = true;
      return newArr;
    });

    try {
      const rawUrl = await window.electronAPI.regenerateSingleImage(selectedTheme.name, index, stageCount, aspectRatio, imageModel);
      const newUrl = `${rawUrl}?t=${Date.now()}`;
      setGeneratedImageUrls(prev => {
        const newArr = [...prev];
        if (newArr.length < stageCount) {
          const temp = new Array(stageCount).fill(null);
          prev.forEach((v, i) => temp[i] = v);
          temp[index] = newUrl;
          return temp;
        }
        newArr[index] = newUrl;
        return newArr;
      });
    } catch (err) {
      console.error("Failed to regenerate single image:", err);
      alert("Не удалось перегенерировать изображение.");
    } finally {
      setRegeneratingStages(prev => {
        const newArr = [...prev];
        if (newArr[index] !== undefined) newArr[index] = false;
        return newArr;
      });
    }
  };

  const handleGenerateVideos = async () => {
    if (!selectedTheme) return;

    // NEW RECURSIVE MODE: Only Stage 1 is required
    if (!generatedImageUrls[0]) {
      alert('Сначала сгенерируйте Stage 1 (первое изображение)!');
      return;
    }

    setIsGeneratingVideos(true);
    setVideoStatusLog([]);

    try {
      const videos = await window.electronAPI.generateVideos(
        selectedTheme.name,
        stageCount,
        videoResolution,
        videoDuration
      );
      setGeneratedVideos(videos);
      alert(`Все ${stageCount - 1} видео успешно сгенерированы!`);
    } catch (error) {
      console.error('Failed to generate videos:', error);
      alert(`Ошибка генерации видео: ${error}`);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const handleAssembleVideo = async () => {
    if (generatedVideos.length === 0) {
      // Small fallback: check if we have urls even if state is empty (e.g. on reload)
      const hasVideos = generatedVideos.length > 0;
      if (!hasVideos) {
        alert('Сначала сгенерируйте видео!');
        return;
      }
    }

    setIsAssemblingVideo(true);

    try {
      const resultUrl = await window.electronAPI.assembleFinalVideo();
      setFinalVideoUrl(resultUrl);
      alert('Финальное видео успешно собрано!');
    } catch (error) {
      console.error('Failed to assemble video:', error);
      alert(`Ошибка сборки видео: ${error}`);
    } finally {
      setIsAssemblingVideo(false);
    }
  };

  // Tab styles
  const tabStyle = (tab: AppTab): React.CSSProperties => ({
    padding: '10px 22px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #007acc' : '2px solid transparent',
    backgroundColor: 'transparent',
    color: activeTab === tab ? '#fff' : '#888',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="app" style={{ flexDirection: 'column' }}>

      {/* ── TOP TAB BAR ────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        backgroundColor: '#111', borderBottom: '1px solid #333',
        padding: '0 16px', height: '44px', flexShrink: 0, gap: '4px'
      }}>
        <button style={tabStyle('timelapse')} onClick={() => setActiveTab('timelapse')}>
          🏗️ AI Timelapse
        </button>
        <button style={tabStyle('skeleton')} onClick={() => setActiveTab('skeleton')}>
          💀 Skeleton Shorts
        </button>
        <button style={tabStyle('health')} onClick={() => setActiveTab('health')}>
          🩺 HealthTalk
        </button>
                <button style={tabStyle('objects')} onClick={() => setActiveTab('objects')}>
          📦 ObjectWars
        </button>
        <button style={tabStyle('glabs')} onClick={() => setActiveTab('glabs')}>
          🧪 G-Labs
        </button>
        <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#555' }}>
          Freepik PixVerse V5 + WAN v2.6
        </div>
      </div>

            {/* ── STUDIO TABS ────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'health' ? 'flex' : 'none', flexDirection: 'column' }}>
        <StudioTab mode="health" />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'objects' ? 'flex' : 'none', flexDirection: 'column' }}>
        <StudioTab mode="objects" />
      </div>

            {/* ── SKELETON TAB ───────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'skeleton' ? 'flex' : 'none', flexDirection: 'column' }}>
        <SkeletonTab />
      </div>

      {/* ── G-LABS TAB ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'glabs' ? 'flex' : 'none', flexDirection: 'column' }}>
        <GLabsTab />
      </div>

      {/* ── TIMELAPSE TAB ──────────────────────────────── */}
      <div className="timelapse-container" style={{ display: activeTab === 'timelapse' ? 'flex' : 'none' }}>
          <aside className="timelapse-sidebar">
            <div className="sidebar-section">
              <h3 className="sidebar-label">🏗️ PROJECT CONTEXT</h3>
              <input
                type="text"
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                placeholder="E.g., Luxury Interior Renovation"
                className="timelapse-input"
              />
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-label">📊 STAGES & ASPECT</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  value={stageCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setStageCount(val);
                    setGeneratedImageUrls(new Array(val).fill(null));
                  }}
                  className="timelapse-select"
                >
                  {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n} Stages</option>)}
                </select>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="timelapse-select"
                >
                  <option value="9:16">Portrait 9:16</option>
                  <option value="16:9">Landscape 16:9</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleGenerateThemes}
              disabled={isLoadingThemes}
              className="btn-primary"
              style={{ padding: '1rem' }}
            >
              {isLoadingThemes ? <RefreshCw className="spin" size={18} /> : <Zap size={18} />}
              GENERATE THEMES
            </button>

            <button onClick={handleResetThemes} className="btn-primary btn-reset" style={{ padding: '0.5rem' }}>
              RESET PROJECT
            </button>

            <div className="sidebar-section">
              <h3 className="sidebar-label">🎯 SELECT THEME</h3>
              <div className="selection-list" style={{ maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                {themes.map(t => (
                  <div
                    key={t.id}
                    className={`model-chip ${selectedTheme?.id === t.id ? 'active' : ''}`}
                    onClick={() => handleThemeSelection(t)}
                  >
                    <div className="chip-radio" />
                    <span className="chip-label" style={{ fontSize: '0.7rem' }}>{t.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-label">🖼️ IMAGE MODEL</h3>
              <div className="selection-list">
                {[
                  { value: 'zimage', label: 'ZImage', desc: 'Fast, universal' },
                  { value: 'imagen-4', label: 'Imagen 4', desc: 'Google High Quality' },
                  { value: 'grok-imagine', label: 'Grok Imagine', desc: 'xAI, creative' },
                  { value: 'klein', label: 'Klein', desc: 'Detailed, cinematic' },
                ].map(m => (
                  <div
                    key={m.value}
                    className={`model-chip ${imageModel === m.value ? 'active' : ''}`}
                    onClick={() => setImageModel(m.value as any)}
                  >
                    <div className="chip-radio" />
                    <div className="chip-info">
                      <span className="chip-label">{m.label}</span>
                      <span className="chip-desc">{m.desc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sidebar-section">
              <h3 className="sidebar-label">⚙️ VIDEO SETTINGS</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <select
                  value={videoResolution}
                  onChange={(e) => setVideoResolution(e.target.value as any)}
                  className="timelapse-select"
                >
                  <option value="720p">720p (Fast)</option>
                  <option value="1080p">1080p (HQ)</option>
                </select>
                <select
                  value={videoDuration}
                  onChange={(e) => setVideoDuration(e.target.value as any)}
                  className="timelapse-select"
                >
                  <option value="5">5s</option>
                  <option value="10">10s</option>
                </select>
              </div>
            </div>

            <div className="sidebar-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="sidebar-label">🔑 API STATUS</h3>
                <button
                  onClick={async () => {
                    setIsValidatingKeys(true);
                    try {
                      const results = await window.electronAPI.validateApiKeys();
                      setApiValidation(results);
                    } finally { setIsValidatingKeys(false); }
                  }}
                  disabled={isValidatingKeys}
                  style={{ fontSize: '10px', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  Verify
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {apiValidation?.map((r, i) => (
                  <div key={i} title={`${r.name}: ${r.message}`} style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    backgroundColor: r.valid ? '#10b981' : '#ef4444'
                  }} />
                ))}
              </div>
            </div>
          </aside>

          <main className="timelapse-main">
            <header className="timelapse-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <h1>AI Timelapse Creator</h1>
                {selectedTheme && (
                  <div className="project-headline" style={{ alignItems: 'flex-start' }}>
                    <span className="headline-text" style={{ fontSize: '0.75rem', color: '#64748b' }}>THEME:</span>
                    <span className="headline-text" style={{ color: '#3b82f6' }}>{selectedTheme.name}</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {selectedTheme && (
                  <button onClick={handleGenerateImage} disabled={isGeneratingImage} className="btn-primary" style={{ minWidth: '180px' }}>
                    {isGeneratingImage ? <RefreshCw className="spin" size={16} /> : <ImageIcon size={16} />}
                    {generatedImageUrls[0] ? 'REGENERATE START' : 'GENERATE START'}
                  </button>
                )}
                {generatedImageUrls[0] && (
                  <button onClick={handleGenerateVideos} disabled={isGeneratingVideos} className="btn-primary btn-secondary" style={{ border: '1px solid #3b82f6', color: '#3b82f6' }}>
                    {isGeneratingVideos ? <RefreshCw className="spin" size={16} /> : <Video size={16} />}
                    CREATE CHAIN
                  </button>
                )}
                {generatedImageUrls.slice(0, stageCount).every(url => url !== null) && (
                  <button onClick={handleAssembleVideo} disabled={isAssemblingVideo} className="btn-primary" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)' }}>
                    {isAssemblingVideo ? <RefreshCw className="spin" size={16} /> : <Zap size={16} />}
                    ASSEMBLE TIMELAPSE
                  </button>
                )}
              </div>
            </header>

            <div className="timelapse-content">
              {imageProgress && (
                <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', color: '#60a5fa', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RefreshCw size={14} className="spin" />
                  <span>{imageProgress.message} (Stage {imageProgress.stage}/{imageProgress.total})</span>
                </div>
              )}

              {finalVideoUrl && (
                <div className="stage-card" style={{ padding: '1.5rem', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <h3 style={{ color: '#10b981', margin: 0 }}>✅ FINAL TIMELAPSE READY</h3>
                    <a href={finalVideoUrl} download className="btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem' }}>
                      <Download size={14} /> DOWNLOAD
                    </a>
                  </div>
                  <video src={finalVideoUrl} controls className="preview-9-16" style={{ maxHeight: '400px', width: 'auto', margin: '0 auto', display: 'block' }} />
                </div>
              )}

              <div className="stage-grid">
                <div className="stage-card" style={{ border: '2px solid rgba(59, 130, 246, 0.3)' }}>
                  <div className="preview-box">
                    {generatedImageUrls[0] ? (
                      <img src={generatedImageUrls[0]} alt="Start" />
                    ) : (
                      <span className="wait-label">Stage 1 (Start)</span>
                    )}
                    {isGeneratingImage && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}><RefreshCw className="spin" size={32} /></div>}
                  </div>
                  <p className="stage-label">STARTING IMAGE</p>
                </div>

                {Array.from({ length: stageCount - 1 }).map((_, idx) => {
                  const actualIdx = idx + 1;
                  const url = generatedImageUrls[actualIdx];
                  const isReady = !!url;

                  return (
                    <div key={actualIdx} className="stage-card">
                      <div className="preview-box">
                        {url ? (
                          url.endsWith('.mp4') ? <video src={url} controls muted loop /> : <img src={url} alt={`Stage ${actualIdx}`} />
                        ) : (
                          <span className="wait-label">{isGeneratingVideos ? 'Generating...' : 'Waiting...'}</span>
                        )}
                        {regeneratingStages[actualIdx] && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}><RefreshCw className="spin" size={32} /></div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p className="stage-label">VIDEO {idx + 1}</p>
                        {isReady && (
                          <button
                            onClick={() => handleRegenerateSingle(actualIdx)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isGeneratingVideos && (
                <div className="stage-card" style={{ background: '#000', padding: '1rem', fontFamily: 'monospace' }}>
                  <div style={{ color: '#10b981', borderBottom: '1px solid #10b981', paddingBottom: '0.5rem', marginBottom: '0.5rem', fontSize: '0.75rem' }}>
                    {'>'} GENERATION LOG
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#10b981', maxHeight: '100px', overflowY: 'auto' }}>
                    {videoStatusLog.map((log, i) => <div key={i}>{i === 0 ? '>' : ' '} {log}</div>)}
                  </div>
                </div>
              )}
                        </div>
          </main>
        </div>

    </div>
  );
}

export default App;
