import React, { useState } from 'react';
import { Play, Image as ImageIcon, Video, CheckCircle, RotateCw, RefreshCw, Download, Zap } from 'lucide-react';
import './TimelapseTab.css'; // Let's reuse or update the existing css

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
}

const TimelapseTab: React.FC = () => {
    // Pipeline States
    const [pipelineState, setPipelineState] = useState<'IDLE' | 'SELECTION' | 'EXECUTION'>('IDLE');
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // IDLE State
    const [startCommand, setStartCommand] = useState('');

    // SELECTION State
    const [environments, setEnvironments] = useState<string[]>([]);

    // EXECUTION State
    const [promptData, setPromptData] = useState<CinematicPromptData | null>(null);

    // Assets State
    const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([null, null, null, null]);
    const [generatedVideos, setGeneratedVideos] = useState<(string | null)[]>([null, null, null]);
    const [generatingImages, setGeneratingImages] = useState<boolean[]>([false, false, false, false]);
    const [generatingVideos, setGeneratingVideos] = useState<boolean[]>([false, false, false]);

    // Assembly State
    const [assembling, setAssembling] = useState(false);
    const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

    const [selectedImageModel, setSelectedImageModel] = useState('imagen4');
    const [timelapseID, setTimelapseID] = useState('');

    const IMAGE_MODELS = [
        { value: 'imagen4', label: 'Imagen 4', desc: 'Google High Quality' },
        { value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Versatile' },
        { value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'Pro Output' },
    ];

    const handleStart = async () => {
        if (startCommand.toLowerCase().trim() !== 'start') {
            setError('Please type exactly "start" to begin the cinematic workflow.');
            return;
        }
        setError(null);
        setIsGenerating(true);
        try {
            const envs = await window.electronAPI.timelapseGetEnvironments();
            setEnvironments(envs);
            setPipelineState('SELECTION');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSelectEnvironment = async (index: number) => {
        if (index < 0 || index > 9) return;

        setError(null);
        setIsGenerating(true);
        try {
            const now = new Date();
            const tid = `Timelapse_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}${now.getFullYear()}`;
            setTimelapseID(tid);

            const data = await window.electronAPI.timelapseGeneratePrompts(index + 1, environments[index]);
            setPromptData(data);
            setPipelineState('EXECUTION');
            // reset assets
            setGeneratedImages([null, null, null, null]);
            setGeneratedVideos([null, null, null]);
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
            const url = await window.electronAPI.timelapseGenerateImage(imgIndex, promptData.images[imgIndex].prompt, selectedImageModel, timelapseID);
            setGeneratedImages(prev => { const n = [...prev]; n[imgIndex] = url; return n; });
        } catch (e: any) {
            setError(`Image ${imgIndex + 1} Error: ${e.message}`);
        } finally {
            setGeneratingImages(prev => { const n = [...prev]; n[imgIndex] = false; return n; });
        }
    };

    const generateVideo = async (videoIndex: number) => {
        if (!promptData) return;
        if (!generatedImages[videoIndex]) {
            setError(`Please generate Image ${videoIndex + 1} first, it acts as the starting frame for Video ${videoIndex + 1}.`);
            return;
        }
        
        setGeneratingVideos(prev => { const n = [...prev]; n[videoIndex] = true; return n; });
        try {
            // Video 1 uses Image 1 as start. Video 2 uses Image 2 (or end of Video 1).
            // Based on the prompt: "Video 1: Image 1 -> Image 2"
            // We pass the index and the prompt. The backend will figure out the source image mapping.
            const url = await window.electronAPI.timelapseGenerateVideo(videoIndex, promptData.videos[videoIndex].prompt, timelapseID);
            setGeneratedVideos(prev => { const n = [...prev]; n[videoIndex] = url; return n; });
            
            // NOTE: If we want strict "Image 1 -> Image 2", the backend script needs to handle the interpolation, 
            // or we use standard img2video from Image 1 using Pixverse.
        } catch (e: any) {
            setError(`Video ${videoIndex + 1} Error: ${e.message}`);
        } finally {
            setGeneratingVideos(prev => { const n = [...prev]; n[videoIndex] = false; return n; });
        }
    };

    const assembleFinal = async () => {
        if (generatedVideos.includes(null)) {
            setError('Please generate all 3 videos before assembling.');
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

    const resetWorkflow = () => {
        setPipelineState('IDLE');
        setStartCommand('');
        setEnvironments([]);
        setPromptData(null);
        setGeneratedImages([null, null, null, null]);
        setGeneratedVideos([null, null, null]);
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

            {/* STATE 1: IDLE */}
            {pipelineState === 'IDLE' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '1.5rem' }}>
                    <div style={{ textAlign: 'center', maxWidth: '500px' }}>
                        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600 }}>STATE 1 — IDLE</h2>
                        <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                            You are interacting with a strict cinematic AI workflow generator. Type "start" to enter Selection Mode.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                            <input 
                                type="text" 
                                value={startCommand} 
                                onChange={(e) => setStartCommand(e.target.value)}
                                placeholder="start"
                                onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                                style={{ padding: '0.75rem 1rem', background: '#1e293b', border: '1px solid #334155', color: 'white', borderRadius: '0.5rem', width: '200px', textAlign: 'center', fontSize: '1.2rem', textTransform: 'lowercase' }}
                            />
                            <button 
                                onClick={handleStart} 
                                disabled={isGenerating}
                                style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0 1.5rem', borderRadius: '0.5rem', fontWeight: 700, cursor: isGenerating ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                                {isGenerating ? <RefreshCw className="spin" size={20} /> : <Play size={20} />} 
                                EXECUTE
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STATE 2: SELECTION */}
            {pipelineState === 'SELECTION' && (
                <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                    <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', fontWeight: 600, borderBottom: '1px solid #333', paddingBottom: '0.5rem' }}>STATE 2 — SELECTION MODE</h2>
                    <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>Select an environment for the cinematic transformation.</p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        {environments.map((env, idx) => (
                            <button 
                                key={idx}
                                onClick={() => handleSelectEnvironment(idx)}
                                disabled={isGenerating}
                                style={{ 
                                    background: '#1e293b', border: '1px solid #334155', padding: '1rem', borderRadius: '0.5rem', 
                                    color: '#e2e8f0', textAlign: 'left', cursor: isGenerating ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    display: 'flex', gap: '1rem', alignItems: 'flex-start'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.borderColor = '#3b82f6'}
                                onMouseOut={(e) => e.currentTarget.style.borderColor = '#334155'}
                            >
                                <div style={{ background: '#3b82f6', color: 'white', width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.8rem', flexShrink: 0 }}>
                                    {idx + 1}
                                </div>
                                <div style={{ lineHeight: '1.4' }}>{env.replace(/^\d+[\.\)]\s*/, '')}</div>
                            </button>
                        ))}
                    </div>
                    {isGenerating && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#3b82f6' }}>
                            <RefreshCw className="spin" size={20} /> Generating Photorealistic Pipeline...
                        </div>
                    )}
                </div>
            )}

            {/* STATE 3: EXECUTION */}
            {pipelineState === 'EXECUTION' && promptData && (
                <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                    <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '1rem 1.5rem', borderRadius: '0.5rem', marginBottom: '2rem' }}>
                        <span style={{ color: '#3b82f6', fontWeight: 800, fontSize: '0.75rem', letterSpacing: '1px' }}>STEP 1 — CONTEXT CONFIRMATION</span>
                        <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.1rem', color: '#e2e8f0' }}>{promptData.contextConfirmation}</p>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
                        {/* IMAGES COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #333', color: '#94a3b8' }}>STEP 2 — 4 PHOTOREALISTIC IMAGE PROMPTS</h3>
                            {promptData.images.map((img, idx) => (
                                <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>{img.title}</div>
                                        <button 
                                            onClick={() => generateImage(idx)}
                                            disabled={generatingImages[idx]}
                                            style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                                        >
                                            {generatingImages[idx] ? <RefreshCw className="spin" size={14} /> : <ImageIcon size={14} />} {generatedImages[idx] ? 'REGENERATE' : 'GENERATE'}
                                        </button>
                                    </div>
                                    <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5', background: '#0f172a' }}>
                                        {img.prompt}
                                        <div style={{ marginTop: '0.5rem', color: '#64748b', fontStyle: 'italic' }}>Platform: {img.platform}</div>
                                    </div>
                                    {generatedImages[idx] && (
                                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: '#000' }}>
                                            <img src={generatedImages[idx]!} alt={img.title} style={{ maxHeight: '400px', width: 'auto', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px' }} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* VIDEOS COLUMN */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <h3 style={{ margin: 0, paddingBottom: '0.5rem', borderBottom: '1px solid #333', color: '#94a3b8' }}>STEP 3 — 3 IMAGE-TO-VIDEO PROMPTS</h3>
                            {promptData.videos.map((vid, idx) => (
                                <div key={idx} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem', borderBottom: '1px solid #1f2937', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 700, color: '#f8fafc' }}>{vid.title}</div>
                                        <button 
                                            onClick={() => generateVideo(idx)}
                                            disabled={generatingVideos[idx] || !generatedImages[idx]}
                                            style={{ background: '#8b5cf6', color: 'white', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: (!generatedImages[idx]) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', opacity: (!generatedImages[idx]) ? 0.5 : 1 }}
                                        >
                                            {generatingVideos[idx] ? <RefreshCw className="spin" size={14} /> : <Video size={14} />} ANIMATE
                                        </button>
                                    </div>
                                    <div style={{ padding: '1rem', fontSize: '0.85rem', color: '#94a3b8', lineHeight: '1.5', background: '#0f172a' }}>
                                        {vid.prompt}
                                        <div style={{ marginTop: '0.5rem', color: '#64748b', fontStyle: 'italic' }}>Platform: {vid.platform}</div>
                                    </div>
                                    {generatedVideos[idx] && (
                                        <div style={{ padding: '1rem', display: 'flex', justifyContent: 'center', background: '#000' }}>
                                            <video src={generatedVideos[idx]!} controls loop autoPlay muted style={{ maxHeight: '400px', width: 'auto', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px' }} />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* ASSEMBLY BLOCK */}
                            <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'linear-gradient(145deg, #1e1b4b, #312e81)', borderRadius: '0.5rem', border: '1px solid #4338ca' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, color: 'white', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Zap size={20} color="#fbbf24" /> FINAL ASSEMBLY</h3>
                                    <button 
                                        onClick={assembleFinal}
                                        disabled={assembling || generatedVideos.includes(null)}
                                        style={{ background: '#fbbf24', color: '#78350f', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '4px', fontSize: '1rem', fontWeight: 800, cursor: (generatedVideos.includes(null)) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: (generatedVideos.includes(null)) ? 0.5 : 1 }}
                                    >
                                        {assembling ? <RefreshCw className="spin" size={18} /> : <CheckCircle size={18} />} ASSEMBLE
                                    </button>
                                </div>
                                <p style={{ color: '#a5b4fc', fontSize: '0.85rem', marginTop: '0.75rem' }}>Stitches the 3 transition videos together and applies the Bouncy Swing-Pop background music.</p>
                                
                                {finalVideoUrl && (
                                    <div style={{ marginTop: '1.5rem', background: '#000', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                                        <video src={finalVideoUrl} controls autoPlay muted loop style={{ maxHeight: '400px', width: 'auto', aspectRatio: '9/16', objectFit: 'cover', borderRadius: '4px' }} />
                                        <div style={{ marginTop: '1rem' }}>
                                            <a href={finalVideoUrl} download className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.5rem', background: '#10b981', color: 'white', textDecoration: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                                                <Download size={18} /> DOWNLOAD FINAL
                                            </a>
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
};

export default TimelapseTab;
