import React, { useState } from 'react';
import {
    Stethoscope,
    ImageIcon,
    Video,
    RefreshCw,
    Box,
    Zap,
    Lightbulb,
    X,
    AlertTriangle,
    Download,
    FileAudio
} from 'lucide-react';
import { StudioScript, StudioScene } from './electron.d';
import './StudioTab.css';

interface StudioTabProps {
    mode: 'health' | 'objects';
}

const LANGUAGES = [
    { label: 'Русский', value: 'Russian' },
    { label: 'English', value: 'English' },
    { label: 'Polski', value: 'Polish' },
    { label: 'Deutsch', value: 'German' },
    { label: 'Français', value: 'French' },
    { label: 'Español', value: 'Spanish' },
];

const StudioTab: React.FC<StudioTabProps> = ({ mode }) => {
    const [topic, setTopic] = useState('');
    const [lang, setLang] = useState('Russian');
    const [imageModel, setImageModel] = useState<string>('freepik-mystic');
    const [videoModel, setVideoModel] = useState<string>('freepik-wan');
    const [script, setScript] = useState<StudioScript | null>(null);

    const [isLoading, setIsLoading] = useState(false);
    const [isIdeasLoading, setIsIdeasLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viralIdeas, setViralIdeas] = useState<{ original: string; translation: string }[]>([]);

    // Assembly
    const [useKaraoke, setUseKaraoke] = useState(false);
    const [assembling, setAssembling] = useState(false);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

    const IMAGE_MODELS = [
        { value: 'freepik-mystic', label: 'Freepik Mystic', desc: 'Ultra-realistic, luxury' },
        { value: 'freepik-flux-dev', label: 'Freepik Flux Dev', desc: 'Detailed, photorealistic' },
        { value: 'zimage', label: 'ZImage', desc: 'Fast, universal' },
        { value: 'antigravity-gemini', label: 'Antigravity Gemini', desc: 'Fast, high quality' },
        { value: 'imagen-4', label: 'Imagen 4', desc: 'Google High Quality' },
    ];

    const VIDEO_MODELS = [
        { value: 'freepik-wan', label: 'Freepik WAN v2.6', desc: 'Highest quality (20/day)' },
        { value: 'pixverse-v5', label: 'PixVerse V5', desc: 'Optimal: 125 gen/day' },
    ];

    const fetchViralIdeas = async () => {
        setIsIdeasLoading(true);
        setError(null);
        try {
            const ideas = await window.electronAPI.studioGenerateIdeas(mode, lang) as any;
            setViralIdeas(ideas.map((idea: { original: string; russian: string }) => ({
                original: idea.original,
                translation: lang === 'Russian' ? '' : idea.russian,
            })));
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsIdeasLoading(false);
        }
    };

    const generateScript = async () => {
        if (!topic) return;
        setIsLoading(true);
        setError(null);
        setViralIdeas([] as { original: string; translation: string }[]);
        try {
            const result = await window.electronAPI.studioGenerateScript(mode, topic, lang);
            setScript({
                ...result,
                scenes: result.scenes.map(s => ({ ...s, status: 'idle' }))
            });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const updateScene = (id: number, updates: Partial<StudioScene>) => {
        setScript(prev => prev ? {
            ...prev,
            scenes: prev.scenes.map(s => s.id === id ? { ...s, ...updates } : s)
        } : null);
    };

    const generateImage = async (sceneId: number) => {
        const scene = script?.scenes.find(s => s.id === sceneId);
        if (!scene) return;
        updateScene(sceneId, { status: 'generating_images' });
        try {
            const imageUrl = await window.electronAPI.skeletonGenerateImage({
                sceneIndex: sceneId,
                imagePrompt: `STRICT VERTICAL 9:16 PORTRAIT. ${scene.imagePrompt}. 3D Disney Pixar style.`,
                imageModel: imageModel as any
            });
            updateScene(sceneId, { status: 'idle', selectedImage: imageUrl, generatedImages: [imageUrl] });
        } catch (err: any) {
            setError(err.message);
            updateScene(sceneId, { status: 'idle' });
        }
    };

    const animateScene = async (sceneId: number) => {
        const scene = script?.scenes.find(s => s.id === sceneId);
        if (!scene || !scene.selectedImage) {
            alert('Сначала сгенерируйте изображение!');
            return;
        }

        let audioUrl = scene.audio_url;
        if (!audioUrl) {
            updateScene(sceneId, { status: 'generating_video' });
            try {
                const { sceneAudioUrls } = await window.electronAPI.skeletonGenerateAudio({
                    script: scene.line,
                    scenes: [{ script_line: scene.line } as any],
                    language: lang
                });
                audioUrl = sceneAudioUrls[0];
                updateScene(sceneId, { audio_url: audioUrl });
            } catch (e: any) {
                setError("Ошибка аудио: " + e.message);
                updateScene(sceneId, { status: 'idle' });
                return;
            }
        }

        updateScene(sceneId, { status: 'generating_video' });
        try {
            const videoUrl = await window.electronAPI.skeletonGenerateVideo({
                sceneIndex: sceneId,
                videoPrompt: scene.videoPrompt,
                scriptLine: scene.line,
                language: lang,
                videoModel: videoModel as any,
                audioUrl: audioUrl
            });
            updateScene(sceneId, { status: 'ready', generatedVideoUrl: videoUrl });
        } catch (err: any) {
            setError(err.message);
            updateScene(sceneId, { status: 'idle' });
        }
    };

    const handleAssemble = async () => {
        if (!script) return;
        setAssembling(true);
        setFinalVideoUrl(null);
        try {
            const url = await window.electronAPI.studioAssembleVideo({
                useKaraoke,
                ideaTitle: script.intro,
                language: lang
            });
            setFinalVideoUrl(url);
        } catch (e: any) {
            setError('Ошибка сборки: ' + e.message);
        } finally {
            setAssembling(false);
        }
    };

    return (
        <div className={`studio-container ${mode}-mode`}>
            {/* ── LEFT SIDEBAR ────────────────────────────────── */}
            <aside className="studio-sidebar">
                <div className="sidebar-section">
                    <h3 className="sidebar-title">🖼️ IMAGE MODEL</h3>
                    <div className="selection-list">
                        {IMAGE_MODELS.map(m => (
                            <div
                                key={m.value}
                                className={`selection-chip ${imageModel === m.value ? 'active' : ''}`}
                                onClick={() => setImageModel(m.value)}
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
                    <h3 className="sidebar-title">🎬 VIDEO MODEL</h3>
                    <div className="selection-list">
                        {VIDEO_MODELS.map(m => (
                            <div
                                key={m.value}
                                className={`selection-chip ${videoModel === m.value ? 'active' : ''}`}
                                onClick={() => setVideoModel(m.value)}
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
                    <h3 className="sidebar-title">🌍 LANGUAGE</h3>
                    <div className="selection-list">
                        {LANGUAGES.map(l => (
                            <div
                                key={l.value}
                                className={`selection-chip ${lang === l.value ? 'active' : ''}`}
                                onClick={() => setLang(l.value)}
                            >
                                <div className="chip-radio" />
                                <div className="chip-info">
                                    <span className="chip-label">{l.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="sidebar-section">
                    <h3 className="sidebar-title">🎤 OPTIONS</h3>
                    <label className="selection-chip" style={{ cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={useKaraoke}
                            onChange={(e) => setUseKaraoke(e.target.checked)}
                            style={{ margin: 0 }}
                        />
                        <div className="chip-info">
                            <span className="chip-label">Karaoke Subtitles</span>
                        </div>
                    </label>
                </div>

                {script && script.scenes.every(s => s.status === 'ready' || s.generatedVideoUrl) && (
                    <div className="sidebar-section assembly-section">
                        <button
                            onClick={handleAssemble}
                            disabled={assembling}
                            className={`action-btn primary assemble-btn ${assembling ? 'loading' : ''}`}
                            style={{ width: '100%', height: '50px', fontSize: '1rem' }}
                        >
                            {assembling ? <RefreshCw className="spin" /> : <Zap size={20} />}
                            {assembling ? ' ASSEMBLING...' : ' ASSEMBLE FINAL'}
                        </button>
                    </div>
                )}
            </aside>

            {/* ── MAIN AREA ────────────────────────────────── */}
            <div className="studio-main">
                <header className="studio-header">
                    <div className="studio-header-inner">
                        <div className="studio-logo">
                            <div className="studio-logo-icon">
                                {mode === 'health' ? <Stethoscope color="white" size={24} /> : <Box color="white" size={24} />}
                            </div>
                            <h1>
                                AI <span className="mode-text">{mode === 'health' ? 'HealthTalk' : 'ObjectWars'}</span>
                            </h1>
                        </div>
                        {script && (
                            <div className="project-headline">
                                <span className="input-label">PROJECT:</span>
                                <span className="headline-text">{script.intro}</span>
                            </div>
                        )}
                    </div>
                </header>

                <main className="studio-main-content">
                    <div className="max-width-wrapper">
                        {error && (
                            <div className="error-banner">
                                <div className="error-message">
                                    <AlertTriangle size={20} /> <p>{error}</p>
                                </div>
                                <button onClick={() => setError(null)} className="close-btn"><X size={20} /></button>
                            </div>
                        )}

                        <section className="control-panel">
                            <div className="control-panel-grid">
                                <div className="input-group topic-input-container">
                                    <label className="input-label">TOPIC / IDEA</label>
                                    <div className="topic-inner">
                                        <input
                                            type="text"
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value)}
                                            placeholder={mode === 'health' ? "E.g., Benefits of Avocado for Gut Health" : "Dramatic story of a forgotten potato..."}
                                            className="studio-input"
                                        />
                                        <button onClick={fetchViralIdeas} disabled={isIdeasLoading} className="idea-bulb-btn">
                                            {isIdeasLoading ? <RefreshCw className="spin" size={20} /> : <Lightbulb size={20} />}
                                        </button>
                                    </div>
                                </div>

                                <button onClick={generateScript} disabled={isLoading || !topic} className="generate-btn">
                                    {isLoading ? <RefreshCw className="spin" size={18} /> : <Zap size={18} />} GENERATE SCRIPT
                                </button>
                            </div>

                            {viralIdeas.length > 0 && (
                                <div className="viral-ideas-container">
                                    {viralIdeas.map((idea, idx) => (
                                        <button key={idx} onClick={() => { setTopic(idea.original); setViralIdeas([]); }} className="viral-idea-chip">
                                            <span className="viral-idea-original">{idea.original}</span>
                                            {idea.translation && (
                                                <span className="viral-idea-translation">🇷🇺 {idea.translation}</span>
                                            )}
                                        </button>
                                    ))}
                                    <button onClick={() => setViralIdeas([])} className="close-ideas-btn"><X size={16} /></button>
                                </div>
                            )}
                        </section>

                        {finalVideoUrl && (
                            <section className="final-assembly-preview">
                                <div className="scene-card final-card">
                                    <div className="scene-info">
                                        <div className="scene-header">
                                            <div className="scene-number">★</div>
                                            <div className="status-badge gold">FINAL VIDEO READY</div>
                                        </div>
                                        <div className="line-container">
                                            <p className="line-text" style={{ fontSize: '1.2rem', color: '#fbbf24' }}>{script?.intro}</p>
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '1rem' }}>
                                            Your viral short is ready with background music and cinematic flow.
                                        </p>
                                    </div>
                                    <div className="asset-display">
                                        <div className="preview-container">
                                            <video src={finalVideoUrl} controls autoPlay loop className="preview-9-16" />
                                            <a href={finalVideoUrl} download className="download-floating-btn gold-btn">
                                                <Download size={20} />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {script && (
                            <div className="scenes-grid">
                                {script.scenes.map((scene, idx) => (
                                    <div key={scene.id} className="scene-card">
                                        <div className="scene-info">
                                            <div className="scene-header">
                                                <div className="scene-number">{idx + 1}</div>
                                                {scene.audio_url && (
                                                    <div className="status-badge">
                                                        <FileAudio size={14} /> AUDIO READY
                                                    </div>
                                                )}
                                            </div>

                                            <div className="line-container">
                                                <p className="line-text">"{scene.line}"</p>
                                            </div>

                                            <div className="prompt-grid">
                                                <div className="prompt-item">
                                                    <label><ImageIcon size={14} /> Character & Prompt</label>
                                                    <textarea
                                                        value={scene.imagePrompt}
                                                        onChange={(e) => updateScene(scene.id, { imagePrompt: e.target.value })}
                                                        className="studio-textarea"
                                                    />
                                                </div>

                                                <div className="prompt-item">
                                                    <label><Video size={14} /> Animation & Action</label>
                                                    <textarea
                                                        value={scene.videoPrompt}
                                                        onChange={(e) => updateScene(scene.id, { videoPrompt: e.target.value })}
                                                        className="studio-textarea"
                                                    />
                                                </div>
                                            </div>

                                            <div className="scene-actions">
                                                <button onClick={() => generateImage(scene.id)} disabled={scene.status !== 'idle'} className="action-btn secondary">
                                                    {scene.status === 'generating_images' ? <RefreshCw className="spin" /> : <ImageIcon size={16} />} GENERATE ACTOR
                                                </button>
                                                <button onClick={() => animateScene(scene.id)} disabled={scene.status !== 'idle'} className="action-btn primary">
                                                    {scene.status === 'generating_video' ? <RefreshCw className="spin" /> : <Zap size={16} />} ANIMATE SCENE
                                                </button>
                                            </div>
                                        </div>

                                        <div className="asset-display">
                                            {scene.status !== 'idle' ? (
                                                <div className="loading-overlay">
                                                    <RefreshCw size={48} className="spin text-emerald-500" />
                                                    <p className="loading-text">Rendering...</p>
                                                </div>
                                            ) : scene.generatedVideoUrl ? (
                                                <div className="preview-container">
                                                    <video src={scene.generatedVideoUrl} controls autoPlay loop className="preview-9-16" />
                                                    <a href={scene.generatedVideoUrl} download className="download-floating-btn">
                                                        <Download size={20} />
                                                    </a>
                                                </div>
                                            ) : scene.selectedImage ? (
                                                <div className="preview-container group">
                                                    <img src={scene.selectedImage} className="preview-9-16" alt="Actor preview" />
                                                    <button onClick={() => animateScene(scene.id)} className="overlay-animate-btn">
                                                        ANIMATE NOW
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="preview-placeholder">
                                                    <ImageIcon size={64} />
                                                    <p>AWAITING ASSETS</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            <style>{`
        .max-width-wrapper { max-width: 1200px; margin: 0 auto; width: 100%; }
        .project-headline { display: flex; flex-direction: column; align-items: flex-end; }
        .headline-text { font-weight: 800; font-size: 0.875rem; color: #10b981; }
        .close-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 0.5rem; }
        .topic-inner { position: relative; display: flex; align-items: center; }
        .close-ideas-btn { background: none; border: none; color: #64748b; cursor: pointer; padding: 0.5rem; }
        .status-badge { display: flex; align-items: center; gap: 0.5rem; font-size: 0.65rem; font-weight: 900; background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 0.5rem 1rem; border-radius: 1rem; border: 1px solid rgba(16, 185, 129, 0.2); }
        .preview-container { position: relative; width: 100%; display: flex; justify-content: center; }
        .download-floating-btn { position: absolute; bottom: 1.5rem; right: 1.5rem; background: #10b981; color: white; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: transform 0.2s; }
        .download-floating-btn:hover { transform: scale(1.1); }
        .overlay-animate-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; color: black; padding: 0.75rem 1.5rem; border-radius: 2rem; font-weight: 900; font-size: 0.75rem; border: none; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
        .preview-container:hover .overlay-animate-btn { opacity: 1; }
      `}</style>
        </div>
    );
};

export default StudioTab;
