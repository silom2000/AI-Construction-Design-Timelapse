import React, { useState } from 'react';
import { Play, Image as ImageIcon, Video, CheckCircle, RotateCw, RefreshCw, Download, Zap, Copy, Check } from 'lucide-react';
import './TimelapseTab.css';

export interface CinematicPromptData {
    contextConfirmation: string;
    images: {
        id: number;
        title: string;
        prompt: string;
        platform: string;
    }[];
    videos: {
        id: number;
        title: string;
        prompt: string;
        platform: string;
    }[];
    engineerNotes?: string;
}

const TimelapseTab: React.FC = () => {
    // Pipeline States
    const [pipelineState, setPipelineState] = useState<'IDLE' | 'SELECTION' | 'EXECUTION'>('IDLE');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // SELECTION State
    const [environments, setEnvironments] = useState<{id: number; en: string; ru: string}[]>([]);

    // EXECUTION State
    const [promptData, setPromptData] = useState<CinematicPromptData | null>(null);

    // Assets State
    const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([null, null, null, null]);
    const [generatedVideos, setGeneratedVideos] = useState<(string | null)[]>([null, null, null, null]);
    const [generatingImages, setGeneratingImages] = useState<boolean[]>([false, false, false, false]);
    const [generatingVideos, setGeneratingVideos] = useState<boolean[]>([false, false, false, false]);

    // Assembly State
    const [assembling, setAssembling] = useState(false);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

    const [selectedImageModel, setSelectedImageModel] = useState('imagen4');
    const [timelapseID, setTimelapseID] = useState('');
    const [customIdea, setCustomIdea] = useState('');
    const [referenceImages, setReferenceImages] = useState<(string | null)[]>([null, null, null, null]); // [stage1, stage2, stage3, stage4]
    const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
    const [useReferencesAsFinal, setUseReferencesAsFinal] = useState(false);

    const IMAGE_MODELS = [
        { value: 'imagen4', label: 'Imagen 4', desc: 'Google High Quality' },
        { value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Versatile' },
        { value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'Pro Output' },
    ];

    const handleStart = async () => {
        setError(null);
        setIsGenerating(true);
        try {
            const envs = await window.electronAPI.timelapseGetEnvironments();
            setEnvironments(envs as any);
            setPipelineState('SELECTION');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCustomStart = async () => {
        if (!customIdea.trim() && !referenceImages.some(img => !!img) && !referenceVideo) return;
        setError(null);
        setIsGenerating(true);
        try {
            const now = new Date();
            const data = await window.electronAPI.timelapseGenerateCustomPrompts(
                customIdea, 
                referenceImages.filter(img => !!img),
                referenceVideo
            );
            
            if (data.subFolder) {
                setTimelapseID(data.subFolder);
            }

            setPromptData(data);
            setPipelineState('EXECUTION');
            
            if (useReferencesAsFinal) {
                let mapped: (string|null)[] = [null, null, null, null];
                if (data.referenceFrames && data.referenceFrames.length === 4) {
                    mapped = data.referenceFrames;
                } else {
                    mapped = [...referenceImages];
                }
                setGeneratedImages(mapped);
            } else {
                setGeneratedImages([null, null, null, null]);
            }
            setGeneratedVideos([null, null, null, null]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleVideoUpload = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                setReferenceVideo(base64);
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const handleImageUpload = (index: number) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                setReferenceImages(prev => {
                    const next = [...prev];
                    next[index] = base64;
                    return next;
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    };

    const handleSelectEnvironment = async (index: number) => {
        if (index < 0 || index > 3) return;

        setError(null);
        setIsGenerating(true);
        try {
            const now = new Date();
            const tid = `Timelapse_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getFullYear()}`;
            setTimelapseID(tid);

            const data = await window.electronAPI.timelapseGeneratePrompts(index + 1, environments[index] as any);
            setPromptData(data);
            setPipelineState('EXECUTION');
            // reset assets
            setGeneratedImages([null, null, null, null]);
            setGeneratedVideos([null, null, null, null]);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const generateImage = async (imgIndex: number) => {
        if (!promptData) return;
        setGeneratingImages(prev => { const n = [...prev]; n[imgIndex] = true; return n; });
        try {
            // Pass the corresponding reference image if it exists
            // Stage 1 (index 0) uses referenceImages[0], Stage 4 (index 3) uses referenceImages[2]
            let refImg = null;
            if (imgIndex === 0) refImg = referenceImages[0];
            if (imgIndex === 3) refImg = referenceImages[2];

            const url = await window.electronAPI.timelapseGenerateImage(
                imgIndex, 
                promptData.images[imgIndex].prompt, 
                selectedImageModel, 
                timelapseID,
                refImg
            );
            setGeneratedImages(prev => { const n = [...prev]; n[imgIndex] = url; return n; });
        } catch (e: any) {
            setError(`Image ${imgIndex + 1} Error: ${e.message}`);
        } finally {
            setGeneratingImages(prev => { const n = [...prev]; n[imgIndex] = false; return n; });
        }
    };

    const generateVideo = async (videoIndex: number) => {
        if (!promptData) return;
        const requiredImageIdx = videoIndex === 3 ? 3 : videoIndex;
        if (!generatedImages[requiredImageIdx]) {
            const label = videoIndex === 3
                ? 'Please generate Image 4 (FULLY FURNISHED) first — it is the starting frame for the Cinematic Tour.'
                : `Please generate Image ${videoIndex + 1} first, it acts as the starting frame for Video ${videoIndex + 1}.`;
            setError(label);
            return;
        }
        
        setGeneratingVideos(prev => { const n = [...prev]; n[videoIndex] = true; return n; });
        try {
            const refImgs = referenceImages.filter(img => !!img);
            const url = await window.electronAPI.timelapseGenerateVideo(
                videoIndex, 
                promptData.videos[videoIndex].prompt, 
                timelapseID,
                refImgs
            );
            setGeneratedVideos(prev => { const n = [...prev]; n[videoIndex] = url; return n; });
        } catch (e: any) {
            setError(`Video ${videoIndex + 1} Error: ${e.message}`);
        } finally {
            setGeneratingVideos(prev => { const n = [...prev]; n[videoIndex] = false; return n; });
        }
    };

    const assembleFinal = async () => {
        if (generatedVideos.includes(null)) {
            setError('Please generate all 4 videos before assembling.');
            return;
        }
        setAssembling(true);
        setError(null);
        try {
            const url = await window.electronAPI.timelapseAssemble(timelapseID);
            setFinalVideoUrl(url);
        } catch (e: any) {
            setError(`Assembly Error: ${e.message}`);
        } finally {
            setAssembling(false);
        }
    };

    const [copiedIndex, setCopiedIndex] = useState<{type: 'img' | 'vid', idx: number} | null>(null);

    const copyToClipboard = (text: string, type: 'img' | 'vid', idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex({ type, idx });
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const resetWorkflow = () => {
        setPipelineState('IDLE');
        setEnvironments([]);
        setPromptData(null);
        setGeneratedImages([null, null, null, null]);
        setGeneratedVideos([null, null, null, null]);
        setFinalVideoUrl(null);
        setError(null);
    };

    return (
        <div className="timelapse-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', background: '#0a0a0a', color: '#f8fafc', padding: '2rem' }}>
            
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#3b82f6', letterSpacing: '1px' }}>AI TIMELAPSE CREATOR</h1>
                    <p style={{ margin: '0.5rem 0 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>Cinematic Workflow Generator</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', background: '#1e293b', padding: '0.25rem', borderRadius: '0.5rem', border: '1px solid #334155' }}>
                        {IMAGE_MODELS.map(m => (
                            <button
                                key={m.value}
                                onClick={() => setSelectedImageModel(m.value)}
                                title={m.desc}
                                style={{
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    background: selectedImageModel === m.value ? '#3b82f6' : 'transparent',
                                    color: selectedImageModel === m.value ? 'white' : '#94a3b8',
                                    border: 'none',
                                    borderRadius: '0.375rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    {pipelineState !== 'IDLE' && (
                        <button onClick={resetWorkflow} style={{ background: '#333', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '12px' }}>
                            <RotateCw size={14} /> RESET
                        </button>
                    )}
                </div>
            </header>

            {error && (
                <div style={{ background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', padding: '1rem', marginBottom: '2rem', color: '#fca5a5' }}>
                    {error}
                </div>
            )}

            {/* LOADING OVERLAY */}
            {isGenerating && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'relative', width: '80px', height: '80px', marginBottom: '1.5rem' }}>
                        <div className="spin" style={{ width: '100%', height: '100%', border: '4px solid rgba(59,130,246,0.1)', borderTop: '4px solid #3b82f6', borderRadius: '50%' }} />
                    </div>
                    <h2 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Генерация пайплайна...</h2>
                    <p style={{ color: '#64748b', marginTop: '0.5rem' }}>ИИ проектирует архитектурное решение и промпты</p>
                </div>
            )}

            {/* STATE 1: IDLE */}
            {pipelineState === 'IDLE' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)', border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2rem', boxShadow: '0 0 40px rgba(59,130,246,0.25)' }}>
                        <Video size={36} color="#3b82f6" />
                    </div>
                    <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.5px', textAlign: 'center', color: '#f1f5f9' }}>Cinematic Timelapse</h2>
                    <p style={{ margin: '0 0 0.5rem 0', color: '#64748b', fontSize: '0.9rem', letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center' }}>AI · CONSTRUCTION · 4-STAGE PIPELINE</p>
                    <div style={{ width: '48px', height: '2px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '2px', margin: '1.5rem 0 2rem 0' }} />
                    <div style={{ width: '100%', maxWidth: '700px', background: 'rgba(15, 23, 42, 0.5)', padding: '2rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
                            {['STAGE 1', 'STAGE 2', 'STAGE 3', 'STAGE 4'].map((label, idx) => (
                                <div key={idx} onClick={() => handleImageUpload(idx)} style={{ aspectRatio: '1', background: 'rgba(0,0,0,0.3)', border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'all 0.2s' }}>
                                    {referenceImages[idx] ? (
                                        <img src={referenceImages[idx]!} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <>
                                            <ImageIcon size={14} color="#475569" />
                                            <span style={{ fontSize: '0.45rem', color: '#475569', fontWeight: 800, marginTop: '0.2rem', textAlign: 'center' }}>{label}</span>
                                        </>
                                    )}
                                </div>
                            ))}
                            <div onClick={handleVideoUpload} style={{ aspectRatio: '1', background: 'rgba(30, 58, 95, 0.3)', border: '2px dashed #3b82f6', borderRadius: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                                {referenceVideo ? (
                                    <video src={referenceVideo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                                ) : (
                                    <>
                                        <Video size={14} color="#3b82f6" />
                                        <span style={{ fontSize: '0.45rem', color: '#3b82f6', fontWeight: 800, marginTop: '0.2rem', textAlign: 'center' }}>VIDEO REF</span>
                                    </>
                                )}
                            </div>
                        </div>

                        <textarea 
                            value={customIdea}
                            onChange={(e) => setCustomIdea(e.target.value)}
                            placeholder="Опишите вашу идею или загрузите референсы выше..."
                            style={{ minHeight: '80px', marginBottom: '1rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '1rem', borderRadius: '0.75rem', fontSize: '0.95rem', width: '100%', resize: 'none', outline: 'none' }}
                        />
                        <button onClick={handleCustomStart} disabled={isGenerating || (!customIdea.trim() && !referenceImages.some(img => !!img) && !referenceVideo)} className="btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1rem', background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)', marginBottom: '1rem' }}>
                            {isGenerating ? <RefreshCw className="spin" size={20} /> : <Zap size={20} />}
                            {isGenerating ? 'АНАЛИЗ МЕДИА И ГЕНЕРАЦИЯ...' : 'СОЗДАТЬ ПО МОИМ ДАННЫМ'}
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.75rem', border: '1px solid rgba(59, 130, 246, 0.2)', cursor: 'pointer' }} onClick={() => setUseReferencesAsFinal(!useReferencesAsFinal)}>
                            <div style={{ width: '40px', height: '20px', background: useReferencesAsFinal ? '#3b82f6' : '#1e293b', borderRadius: '20px', position: 'relative', transition: 'all 0.3s' }}>
                                <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: useReferencesAsFinal ? '22px' : '2px', transition: 'all 0.3s' }} />
                            </div>
                            <span style={{ fontSize: '0.85rem', color: useReferencesAsFinal ? '#fff' : '#64748b', fontWeight: 600 }}>ИСПОЛЬЗОВАТЬ МОИ МЕДИА КАК ФИНАЛЬНЫЕ КАДРЫ</span>
                        </div>
                        
                        <div style={{ margin: '1.5rem 0', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                            <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap' }}>ИЛИ ВЫБРАТЬ ИЗ ПРЕДЛОЖЕННЫХ</span>
                            <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.05)' }} />
                        </div>

                        <button onClick={handleStart} disabled={isGenerating} className="btn-primary" style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                            {isGenerating ? <RefreshCw className="spin" size={18} /> : <RotateCw size={18} />} 
                            {isGenerating ? 'ГЕНЕРАЦИЯ ВАРИАНТОВ...' : 'ПРЕДЛОЖИТЬ 4 ИДЕИ ОТ ИИ'}
                        </button>
                    </div>
                </div>
            )}

            {/* STATE 2: SELECTION */}
            {pipelineState === 'SELECTION' && (
                <div style={{ width: '100%', maxWidth: '960px', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.5rem', fontWeight: 700, color: '#f1f5f9' }}>Идеи для трансформации</h2>
                        <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Нажмите на карточку, чтобы запустить генерацию промптов</p>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {environments.map((env, idx) => (
                            <button key={idx} onClick={() => handleSelectEnvironment(idx)} className="model-chip" style={{ padding: '2rem', textAlign: 'left', display: 'block', background: '#111827', border: '1px solid #1e2937', borderRadius: '1rem' }}>
                                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f1f5f9', marginBottom: '0.5rem' }}>{env.ru}</div>
                                <div style={{ fontSize: '0.8rem', color: '#475569', fontStyle: 'italic' }}>{env.en}</div>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* STATE 3: EXECUTION */}
            {pipelineState === 'EXECUTION' && promptData && (
                <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', paddingBottom: '4rem' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem 1.5rem', borderRadius: '0.5rem', marginBottom: '1rem' }}>
                        <span style={{ color: '#3b82f6', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '1px' }}>CONTEXT CONFIRMATION</span>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#e2e8f0' }}>{promptData.contextConfirmation}</p>
                    </div>

                    {promptData.engineerNotes && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.05)', borderLeft: '3px solid #10b981', padding: '0.75rem 1.25rem', borderRadius: '0 0.5rem 0.5rem 0', marginBottom: '2rem' }}>
                            <div style={{ color: '#10b981', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <CheckCircle size={12} /> ENGINEER'S LOG (Tech Specs)
                            </div>
                            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.85rem', lineHeight: '1.5' }}>{promptData.engineerNotes}</p>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        {/* IMAGES COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #333', color: '#94a3b8', fontSize: '1rem', fontWeight: 800 }}>STEP 2 — 4 PHOTOREALISTIC IMAGE PROMPTS</h3>
                            {promptData.images.map((img, idx) => (
                                <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {img.title}
                                            <button 
                                                onClick={() => copyToClipboard(img.prompt, 'img', idx)}
                                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                                                title="Copy Prompt"
                                            >
                                                {copiedIndex?.type === 'img' && copiedIndex?.idx === idx ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                        <button 
                                            onClick={() => generateImage(idx)} 
                                            disabled={generatingImages[idx] || (idx > 0 && !generatedImages[idx - 1])} 
                                            className="btn-primary" 
                                            style={{ 
                                                padding: '0.4rem 0.8rem', 
                                                fontSize: '0.75rem',
                                                background: generatedImages[idx] && useReferencesAsFinal ? '#059669' : undefined 
                                            }}
                                        >
                                            {generatingImages[idx] ? <RefreshCw className="spin" size={14} /> : <ImageIcon size={14} />} 
                                            {generatedImages[idx] && useReferencesAsFinal ? 'REFERENCE LOADED' : (hasImage(idx) ? 'REGENERATE' : 'GENERATE')}
                                        </button>
                                    </div>
                                    <div className="clamped-prompt" style={{ padding: '1rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5', background: '#0f172a' }}>{img.prompt}</div>
                                    {generatedImages[idx] && (
                                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: '#000', position: 'relative' }}>
                                            <img src={generatedImages[idx]!} alt={img.title} style={{ maxHeight: '400px', width: 'auto', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px' }} />
                                            {useReferencesAsFinal && (
                                                <div style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: '#059669', color: '#fff', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>ORIGINAL FRAME</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* VIDEOS COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #333', color: '#94a3b8', fontSize: '1rem', fontWeight: 800 }}>STEP 3 — 4 VIDEO PROMPTS (TRANSITIONS)</h3>
                            {promptData.videos.map((vid, idx) => (
                                <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {vid.title}
                                            <button 
                                                onClick={() => copyToClipboard(vid.prompt, 'vid', idx)}
                                                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0.25rem' }}
                                                title="Copy Prompt"
                                            >
                                                {copiedIndex?.type === 'vid' && copiedIndex?.idx === idx ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                                            </button>
                                        </div>
                                        <button onClick={() => generateVideo(idx)} disabled={generatingVideos[idx] || !generatedImages[idx === 3 ? 3 : idx]} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: '#8b5cf6' }}>
                                            {generatingVideos[idx] ? <RefreshCw className="spin" size={14} /> : <Video size={14} />} {generatedVideos[idx] ? 'RE-ANIMATE' : 'ANIMATE'}
                                        </button>
                                    </div>
                                    <div className="clamped-prompt" style={{ padding: '1rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5', background: '#0f172a' }}>{vid.prompt}</div>
                                    {generatedVideos[idx] && (
                                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: '#000' }}>
                                            <video src={generatedVideos[idx]!} controls autoPlay loop style={{ maxHeight: '400px', width: 'auto', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px' }} />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* ASSEMBLY SECTION */}
                            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)', border: '1px solid #312e81', borderRadius: '1rem', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <Zap size={20} color={generatedVideos.every(v => !!v) ? '#fbbf24' : '#475569'} fill={generatedVideos.every(v => !!v) ? '#fbbf24' : 'transparent'} />
                                    <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>FINAL ASSEMBLY</h3>
                                </div>
                                
                                <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                                    {generatedVideos.every(v => !!v) 
                                        ? 'Все части готовы! Нажмите кнопку для склейки финального ролика.' 
                                        : 'Сгенерируйте все 4 видео-перехода, чтобы активировать финальную сборку.'}
                                </p>

                                <button 
                                    onClick={assembleFinal} 
                                    disabled={assembling || generatedVideos.includes(null)} 
                                    className="btn-primary" 
                                    style={{ 
                                        width: '100%', 
                                        padding: '1rem', 
                                        background: generatedVideos.includes(null) ? '#1e293b' : 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
                                        color: generatedVideos.includes(null) ? '#475569' : '#fff',
                                        cursor: (assembling || generatedVideos.includes(null)) ? 'not-allowed' : 'pointer',
                                        opacity: generatedVideos.includes(null) ? 0.6 : 1,
                                        boxShadow: generatedVideos.includes(null) ? 'none' : '0 8px 24px rgba(79, 70, 229, 0.3)'
                                    }}
                                >
                                    {assembling ? <RefreshCw className="spin" size={24} /> : <Zap size={24} fill={generatedVideos.includes(null) ? 'none' : 'white'} />} 
                                    {assembling ? 'ASSEMBLING...' : 'ASSEMBLE FINAL'}
                                </button>

                                {finalVideoUrl && (
                                    <div style={{ marginTop: '2rem', background: '#000', padding: '1rem', borderRadius: '0.75rem', border: '1px solid #312e81' }}>
                                        <video src={finalVideoUrl} controls autoPlay loop style={{ width: '100%', borderRadius: '0.5rem' }} />
                                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
                                            <a href={finalVideoUrl} download style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', textDecoration: 'none', borderRadius: '0.5rem', fontWeight: 800, fontSize: '0.9rem' }}>
                                                <Download size={18} /> DOWNLOAD FINAL
                                            </a>
                                            <div style={{ fontSize: '0.65rem', color: '#475569', wordBreak: 'break-all', fontFamily: 'monospace', background: 'rgba(255,255,255,0.03)', padding: '0.5rem', borderRadius: '4px', width: '100%' }}>
                                                {decodeURIComponent(finalVideoUrl.replace('media:///', '').split('?')[0]).replace(/\//g, '\\')}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    function hasImage(idx: number) {
        return !!generatedImages[idx];
    }
};

export default TimelapseTab;
