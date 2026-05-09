
import React, { useState, useEffect, useCallback, Component, ErrorInfo, ReactNode, useMemo } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Stethoscope, 
  Sparkles, 
  Image as ImageIcon, 
  Video, 
  RefreshCw,
  CheckCircle2,
  Clock,
  Box,
  Zap,
  Lightbulb,
  Trash2,
  LayoutGrid,
  History,
  X,
  AlertTriangle,
  RotateCcw,
  UserCheck,
  Download,
  DownloadCloud,
  FileImage,
  Copy,
  Check,
  HardDrive,
  Edit3
} from 'lucide-react';
import { Language, Script, Scene, AppMode, Project } from './types';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

// Fix: Explicitly use React.Component to ensure props and state types are correctly inherited and recognized by the TypeScript compiler
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Crash caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-10 text-center">
          <AlertTriangle size={64} className="text-red-500 mb-6" />
          <h1 className="text-3xl font-black text-white mb-4">CRITICAL ERROR</h1>
          <p className="text-slate-400 mb-8 max-w-md">
            {this.state.error?.message.includes('quota') 
              ? "Browser storage is completely full. Please reload and delete some old projects."
              : "Something went wrong in the studio rendering engine."}
          </p>
          <button onClick={() => window.location.reload()} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest flex items-center gap-3 hover:bg-emerald-500 transition-all">
            <RotateCcw size={20} /> RELOAD STUDIO
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const LANGUAGES: { label: string; value: Language }[] = [
  { label: 'Русский', value: 'Russian' },
  { label: 'English', value: 'English' },
  { label: 'Polski', value: 'Polish' },
  { label: 'Deutsch', value: 'German' },
  { label: 'Français', value: 'French' },
  { label: 'Español', value: 'Spanish' },
];

const STORAGE_KEY = 'talking_ai_projects_v3';

const AppContent: React.FC = () => {
  const [view, setView] = useState<'editor' | 'dashboard'>('editor');
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  const [mode, setMode] = useState<AppMode>('health');
  const [topic, setTopic] = useState('');
  const [lang, setLang] = useState<Language>('Russian');
  const [script, setScript] = useState<Script | null>(null);
  const [characterRefs, setCharacterRefs] = useState<Record<string, string>>({});
  
  const [isLoading, setIsLoading] = useState(false);
  const [isIdeasLoading, setIsIdeasLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viralIdeas, setViralIdeas] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const storageUsage = useMemo(() => {
    try {
      const str = localStorage.getItem(STORAGE_KEY) || "";
      return Math.round((str.length * 2) / 1024 / 1024 * 10) / 10;
    } catch { return 0; }
  }, [projects]);

  useEffect(() => {
    const init = async () => {
      try {
        if (!(await window.aistudio.hasSelectedApiKey())) {
          await window.aistudio.openSelectKey();
        }
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) setProjects(JSON.parse(saved));
      } catch (err) {
        setProjects([]);
      }
    };
    init();
  }, []);

  const safeSaveToStorage = (data: Project[]) => {
    try {
      const cleanedData = data.map(p => ({
        ...p,
        script: p.script ? {
          ...p.script,
          scenes: p.script.scenes.map(s => ({
            ...s,
            generatedImages: undefined,
            generatedVideoUrl: undefined
          }))
        } : null
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanedData));
      return true;
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        setError("Browser storage is FULL! Please delete old projects.");
      } else {
        setError("Failed to save project.");
      }
      return false;
    }
  };

  useEffect(() => {
    if (currentProjectId && script) {
      const timeout = setTimeout(() => {
        setProjects(prev => {
          const updated = prev.map(p => {
            if (p.id === currentProjectId) {
              return { 
                ...p, 
                script: script, 
                lastModified: Date.now(), 
                mode, 
                lang, 
                name: topic || p.name,
                characterRefs
              };
            }
            return p;
          });
          safeSaveToStorage(updated);
          return updated;
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [script, mode, lang, topic, currentProjectId, characterRefs]);

  const handleApiError = async (err: any) => {
    let msg = err.message || 'Error occurred.';
    if (msg.includes("503")) msg = "AI is busy. Please try in a few seconds.";
    setError(msg);
    setIsLoading(false);
    setIsIdeasLoading(false);
  };

  const createNewProject = (targetMode?: AppMode) => {
    setScript(null); setTopic(''); setError(null); setViralIdeas([]); setCharacterRefs({}); setCurrentProjectId(null);
    if (targetMode) setMode(targetMode);
    setView('editor');
  };

  const loadProject = (project: Project) => {
    setCurrentProjectId(project.id); setMode(project.mode); setLang(project.lang);
    setTopic(project.name); setScript(project.script); 
    setCharacterRefs(project.characterRefs || {});
    setError(null); setView('editor');
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects(prev => {
      const updated = prev.filter(p => p.id !== id);
      safeSaveToStorage(updated);
      return updated;
    });
    if (currentProjectId === id) createNewProject();
  };

  const fetchViralIdeas = async (): Promise<void> => {
    setIsIdeasLoading(true); setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = mode === 'health' 
        ? `Provide 5 viral educational health video ideas about specific fruits/veg inside organs. Language: ${lang}. Output ONLY a JSON array of 5 strings.`
        : `Provide 5 viral funny talking object ideas for TikTok/Shorts. Language: ${lang}. Output ONLY a JSON array of 5 strings.`;
      const result = await ai.models.generateContent({
        model: 'gemini-3.1-pro-high',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const text = result.text || '[]';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      setViralIdeas(JSON.parse(jsonMatch ? jsonMatch[0] : text));
    } catch (err: any) {
      handleApiError(err);
    } finally { setIsIdeasLoading(false); }
  };

  const generateFullScript = async (): Promise<void> => {
    if (!topic) return;
    setIsLoading(true); setError(null); setViralIdeas([]);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let systemInstruction = "";
      let userPrompt = "";

      if (mode === 'health') {
        systemInstruction = `You are a world-class AI medical animator.
        CRITICAL: 
        1. EVERYTHING MUST BE 9:16 VERTICAL.
        2. 'videoPrompt' MUST contain the EXACT FULL DIALOGUE word-for-word. NO TRUNCATION. NO '...'.
        3. Style: Pixar cute anthropomorphic fruits/veg inside 3D organs.
        4. Teamwork: Main character + small clones working together in background.`;

        userPrompt = `Generate a 5-6 scene medical explainer about "${topic}". Language: ${lang}.
        Output ONLY JSON:
        {
          "intro": "Headline",
          "scenes": [
            {
              "id": 1,
              "character": "Fruit/Veg Name",
              "line": "Dialogue text",
              "organ": "Organ name",
              "action": "Helper task",
              "imagePrompt": "[character] inside 3D [organ] performing [action]. Pixar style, clones in background.",
              "videoPrompt": "Lip-sync for: '[line]'. Team of clones working. Slow cinematic camera."
            }
          ]
        }`;
      } else {
        systemInstruction = `You are a viral TikTok scriptwriter for talking objects.
        CRITICAL:
        1. EVERYTHING MUST BE 9:16 VERTICAL.
        2. 'videoPrompt' MUST include the EXACT FULL DIALOGUE.
        3. Structure: Must return JSON with "intro" and "scenes" array.`;

        userPrompt = `Create a 5-6 scene viral dramatic comedy about "${topic}". Language: ${lang}.
        Output ONLY JSON:
        {
          "intro": "Dramatic Story Title",
          "scenes": [
            {
              "id": 1,
              "character": "Object Name",
              "line": "Exaggerated dramatic dialogue",
              "imagePrompt": "Exaggerated Pixar-style anthropomorphic [character]. High drama lighting, cinematic close-up.",
              "videoPrompt": "Lip-sync animation for: '[line]'. High emotion, dynamic camera."
            }
          ]
        }`;
      }

      const result = await ai.models.generateContent({
        model: 'gemini-3.1-pro-high',
        contents: userPrompt,
        config: { 
          systemInstruction,
          responseMimeType: 'application/json' 
        }
      });

      const text = result.text || '{}';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      const sceneData = Array.isArray(parsed.scenes) ? parsed.scenes : [];
      
      if (sceneData.length === 0) throw new Error("AI failed to generate scenes.");

      const newScript = { 
        intro: parsed.intro || topic, 
        scenes: sceneData.map((s: any) => ({ ...s, status: 'idle', id: s.id || Math.random() })) 
      };
      
      setScript(newScript);
      
      if (!currentProjectId) {
        const newId = Date.now().toString();
        const newProj: Project = { 
          id: newId, 
          name: topic, 
          mode, 
          lang, 
          script: newScript, 
          characterRefs: {}, 
          lastModified: Date.now() 
        };
        const updated = [newProj, ...projects];
        setProjects(updated);
        setCurrentProjectId(newId);
        safeSaveToStorage(updated);
      }
    } catch (err: any) { 
      handleApiError(err); 
    } finally { setIsLoading(false); }
  };

  const generateImagesForScene = async (sceneId: number) => {
    if (!script) return;
    const scene = script.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    updateSceneStatus(sceneId, 'generating_images');
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const refImage = characterRefs[scene.character];
      
      const genOne = async (seedSuffix: string) => {
        const prompt = `STRICT VERTICAL 9:16 PORTRAIT. ${scene.imagePrompt} Variant ${seedSuffix}. 3D Disney Pixar style.`;
        const parts: any[] = [{ text: prompt }];
        if (refImage) {
          parts.unshift({ inlineData: { data: refImage, mimeType: 'image/png' } });
          parts.push({ text: "Character consistency: match this face exactly." });
        }
        return ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts },
          config: { imageConfig: { aspectRatio: "9:16", imageSize: "1K" } }
        });
      };

      const [res1, res2] = await Promise.all([genOne("A"), genOne("B")]);
      const images: string[] = [];
      [res1, res2].forEach(res => {
        res.candidates?.[0]?.content?.parts?.forEach(p => { if (p.inlineData) images.push(p.inlineData.data); });
      });

      if (images.length === 0) throw new Error("Image generation failed.");
      updateSceneStatus(sceneId, 'idle', { generatedImages: images.slice(0, 2) });
    } catch (err) { handleApiError(err); updateSceneStatus(sceneId, 'idle'); }
  };

  const animateScene = async (sceneId: number, imageBase64: string) => {
    if (!script) return;
    const scene = script.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setCharacterRefs(prev => ({ ...prev, [scene.character]: imageBase64 }));
    updateSceneStatus(sceneId, 'generating_video', { selectedImage: imageBase64 });
    setError(null);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let op = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: `9:16 VERTICAL. ${scene.videoPrompt}. Character speaks FULL line: "${scene.line}". Pixar animation quality.`,
        image: { imageBytes: imageBase64, mimeType: 'image/png' },
        config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '9:16' }
      });
      while (!op.done) {
        await new Promise(r => setTimeout(r, 10000));
        op = await ai.operations.getVideosOperation({ operation: op });
      }
      const uri = op.response?.generatedVideos?.[0]?.video?.uri;
      const response = await fetch(`${uri}&key=${process.env.API_KEY}`);
      const vid = await response.blob();
      updateSceneStatus(sceneId, 'ready', { generatedVideoUrl: URL.createObjectURL(vid) });
    } catch (err) { handleApiError(err); updateSceneStatus(sceneId, 'idle'); }
  };

  const updateSceneStatus = (id: number, status: Scene['status'], extra: Partial<Scene> = {}) => {
    setScript(prev => prev ? { ...prev, scenes: prev.scenes.map(s => s.id === id ? { ...s, status, ...extra } : s) } : null);
  };

  const updateScenePrompt = (id: number, field: 'imagePrompt' | 'videoPrompt', value: string) => {
    setScript(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s => s.id === id ? { ...s, [field]: value } : s)
    } : null);
  };

  const downloadBase64Image = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyToClipboard = (text: string, id: number) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className={`min-h-screen transition-all ${mode === 'health' ? 'bg-[#0f172a]' : 'bg-[#1e1b4b]'} text-slate-200 pb-20`}>
      <header className={`backdrop-blur-md border-b px-6 py-4 sticky top-0 z-50 ${mode === 'health' ? 'bg-[#1e293b]/80 border-slate-700/50' : 'bg-[#312e81]/80 border-indigo-700/50'}`}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setView('editor')}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg ${mode === 'health' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
              {mode === 'health' ? <Stethoscope size={22} /> : <Box size={22} />}
            </div>
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">
                AI <span className={mode === 'health' ? 'text-emerald-400' : 'text-indigo-400'}>{mode === 'health' ? 'HealthTalk' : 'ObjectWars'}</span>
              </h1>
            </div>
          </div>
          <nav className="flex p-1 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <button onClick={() => { setMode('health'); setView('editor'); createNewProject('health'); }} className={`px-6 py-2 rounded-lg text-xs font-black tracking-widest transition-all ${mode === 'health' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-slate-500 hover:text-white'}`}>HEALTH</button>
            <button onClick={() => { setMode('objects'); setView('editor'); createNewProject('objects'); }} className={`px-6 py-2 rounded-lg text-xs font-black tracking-widest transition-all ${mode === 'objects' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-white'}`}>OBJECTS</button>
          </nav>
          <div className="flex items-center gap-3">
             <button onClick={() => setView('dashboard')} className="p-3 rounded-xl text-slate-400 hover:bg-slate-700/50 transition-all flex items-center gap-2">
               <History size={18} />
               {projects.length > 0 && <span className="bg-emerald-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">{projects.length}</span>}
             </button>
             <button onClick={() => createNewProject()} className="bg-emerald-600 hover:bg-emerald-500 text-white p-3 sm:px-6 rounded-xl font-black text-xs tracking-widest transition-all active:scale-95 shadow-lg shadow-emerald-500/20">+ NEW</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 pt-10">
        {error && (
          <div className="mb-8 p-6 bg-red-500/10 border-2 border-red-500/50 rounded-3xl flex items-center justify-between gap-4 animate-in fade-in">
            <div className="flex items-center gap-4 text-red-400 font-bold text-sm">
               <AlertTriangle size={20} /> <p>{error}</p>
            </div>
            <button onClick={() => setError(null)} className="p-2 text-red-400 hover:text-white transition-colors"><X size={20} /></button>
          </div>
        )}

        {view === 'dashboard' ? (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between bg-slate-900/50 p-6 rounded-[2rem] border border-slate-800">
               <div>
                 <h2 className="text-2xl font-black text-white">Project Library</h2>
                 <p className="text-slate-500 text-sm mt-1 font-bold">Manage your generated talking head videos</p>
               </div>
               <div className="flex items-center gap-3 bg-slate-950 px-5 py-3 rounded-2xl border border-slate-800">
                  <HardDrive size={18} className={storageUsage > 4 ? "text-red-500" : "text-emerald-500"} />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-slate-500">Browser Memory</span>
                    <span className={`text-sm font-black ${storageUsage > 4 ? "text-red-400" : "text-white"}`}>{storageUsage} MB / 5.0 MB</span>
                  </div>
               </div>
            </div>

            {projects.length === 0 ? (
              <div className="py-32 text-center border-4 border-dashed border-slate-800 rounded-[4rem]">
                 <History size={64} className="mx-auto text-slate-800 mb-6" />
                 <h3 className="text-xl font-black text-slate-600">No projects yet</h3>
                 <button onClick={() => setView('editor')} className="mt-6 text-emerald-500 font-black uppercase tracking-widest text-xs hover:text-emerald-400">Start creating now →</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map(p => (
                  <div key={p.id} onClick={() => loadProject(p)} className="bg-[#1e293b] border border-slate-700/50 rounded-[2.5rem] p-8 hover:border-emerald-500/50 cursor-pointer transition-all group shadow-xl hover:shadow-emerald-500/5">
                    <div className="flex justify-between items-start mb-6">
                       <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${p.mode === 'health' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>{p.mode}</span>
                       <button onClick={(e) => deleteProject(p.id, e)} className="p-2 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={18} /></button>
                    </div>
                    <h3 className="text-xl font-black text-white mb-2 truncate group-hover:text-emerald-400 transition-colors">{p.name}</h3>
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500"><Clock size={14}/> {new Date(p.lastModified).toLocaleDateString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10 animate-in fade-in zoom-in-95">
            <section className={`p-8 rounded-[2.5rem] border transition-all ${mode === 'health' ? 'bg-[#1e293b] border-slate-700/50' : 'bg-[#312e81] border-indigo-700/50 shadow-2xl'}`}>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                <div className="md:col-span-4 space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">LANGUAGE</label>
                  <select value={lang} onChange={(e) => setLang(e.target.value as Language)} className="w-full bg-slate-950/50 text-white px-5 py-4 rounded-2xl border border-slate-700 outline-none font-bold focus:border-emerald-500/50 shadow-inner">
                    {LANGUAGES.map(l => <option key={l.value} value={l.value} className="bg-slate-900">{l.label}</option>)}
                  </select>
                </div>
                <div className="md:col-span-8 space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TOPIC / IDEA</label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 relative">
                       <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={mode === 'health' ? "E.g., Benefits of Avocado for Gut Health" : "Dramatic story of a forgotten potato..."} className="w-full pl-6 pr-14 py-4 bg-slate-950/50 border border-slate-700 rounded-2xl outline-none text-white font-medium focus:border-emerald-500/50 transition-colors shadow-inner" />
                       <button onClick={fetchViralIdeas} disabled={isIdeasLoading} className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 text-amber-400 hover:scale-110 transition-transform">
                         {isIdeasLoading ? <RefreshCw className="animate-spin" size={20} /> : <Lightbulb size={20} />}
                       </button>
                    </div>
                    <button onClick={generateFullScript} disabled={isLoading || !topic} className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-lg active:scale-95 transition-all">
                      {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />} GENERATE SCRIPT
                    </button>
                  </div>
                  {viralIdeas.length > 0 && (
                    <div className="pt-4 flex flex-wrap gap-2 animate-in slide-in-from-top-2">
                      {viralIdeas.map((idea, idx) => (
                        <button key={idx} onClick={() => { setTopic(idea); setViralIdeas([]); }} className="bg-slate-900/80 border border-slate-700 hover:border-emerald-500 px-4 py-2 rounded-xl text-[10px] font-bold text-slate-300 transition-all hover:bg-emerald-500/10 active:scale-95 shadow-lg">
                          {idea}
                        </button>
                      ))}
                      <button onClick={() => setViralIdeas([])} className="p-2 text-slate-500 hover:text-white transition-colors"><X size={16} /></button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {script && (
              <div className="space-y-16 pb-20 animate-in fade-in slide-in-from-bottom-10">
                <div className={`p-10 rounded-[3rem] border ${mode === 'health' ? 'bg-gradient-to-br from-emerald-900/40 to-slate-900 border-emerald-500/20 shadow-2xl' : 'bg-gradient-to-br from-indigo-900/40 to-slate-900 border-indigo-500/20 shadow-2xl'}`}>
                   <h3 className="text-[10px] font-black uppercase tracking-[0.5em] mb-4 text-emerald-400/60">PROJECT OVERVIEW</h3>
                   <p className="text-3xl font-black leading-tight text-white">{script.intro}</p>
                </div>

                <div className="grid grid-cols-1 gap-12">
                  {script.scenes && script.scenes.length > 0 ? script.scenes.map((scene, idx) => (
                    <div key={scene.id} className="rounded-[4rem] bg-[#1e293b] border border-slate-700/50 overflow-hidden grid grid-cols-1 lg:grid-cols-2 shadow-2xl ring-1 ring-slate-800 hover:border-slate-600/50 transition-colors">
                      <div className="p-10 flex flex-col justify-between bg-slate-950/10">
                        <div className="space-y-8">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <span className="w-12 h-12 rounded-2xl flex items-center justify-center font-black bg-slate-900 text-emerald-400 border border-slate-800 shadow-lg">{idx + 1}</span>
                                <h4 className="text-2xl font-black text-white">{scene.character}</h4>
                              </div>
                              {characterRefs[scene.character] && (
                                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 shadow-sm animate-in fade-in">
                                  <UserCheck size={14}/> Actor Synced
                                </div>
                              )}
                           </div>
                           <div className="p-8 rounded-[2.5rem] bg-slate-950/50 border border-slate-800 shadow-inner ring-1 ring-slate-800/50">
                              <p className="text-xl text-white font-bold italic leading-relaxed">"{scene.line}"</p>
                              {mode === 'health' && (
                                <div className="mt-6 pt-6 border-t border-slate-800/50 flex flex-wrap gap-6">
                                  <div className="text-emerald-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800"><Box size={14}/> ORGAN: {scene.organ}</div>
                                  <div className="text-amber-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800"><Zap size={14}/> ACTION: {scene.action}</div>
                                </div>
                              )}
                           </div>
                           
                           {/* NEW: Editable Image Prompt */}
                           <div className="space-y-3">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <ImageIcon size={14} className="text-emerald-400" /> Image Generation Prompt
                                </label>
                                <button onClick={() => copyToClipboard(scene.imagePrompt, scene.id + 1000)} className="text-emerald-500 hover:text-white transition-colors">
                                  {copiedId === scene.id + 1000 ? <Check size={14}/> : <Copy size={14}/>}
                                </button>
                              </div>
                              <textarea 
                                value={scene.imagePrompt} 
                                onChange={(e) => updateScenePrompt(scene.id, 'imagePrompt', e.target.value)}
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-[11px] text-slate-300 font-medium italic leading-relaxed focus:border-emerald-500/50 outline-none h-24 custom-scrollbar resize-none transition-colors shadow-inner"
                                placeholder="Edit actor style/description..."
                              />
                           </div>
                        </div>
                        <button onClick={() => generateImagesForScene(scene.id)} disabled={scene.status !== 'idle'} className="w-full py-5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.8rem] font-black uppercase text-xs tracking-[0.25em] mt-10 flex items-center justify-center gap-3 shadow-lg active:scale-95 transition-all">
                          {scene.status === 'generating_images' ? <RefreshCw className="animate-spin" /> : <ImageIcon />} 
                          {scene.generatedImages ? 'REGENERATE 9:16 ACTOR' : 'GENERATE 9:16 ACTOR'}
                        </button>
                      </div>

                      <div className="bg-slate-950/95 p-10 flex flex-col items-center justify-center border-l border-slate-800/50 min-h-[640px] relative overflow-hidden">
                         <div className="absolute top-8 left-8 right-8 p-6 bg-slate-900/98 backdrop-blur-3xl border border-emerald-500/30 rounded-[2.5rem] z-20 animate-in slide-in-from-top-6 shadow-2xl">
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.4em] text-emerald-400">
                               <Sparkles size={16} className="text-amber-400 animate-pulse"/> Video Prompt Editor
                             </div>
                             <button 
                               onClick={() => copyToClipboard(scene.videoPrompt, scene.id)}
                               className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-2xl transition-all active:scale-90 border border-emerald-500/30 group shadow-lg"
                             >
                               {copiedId === scene.id ? <Check size={14}/> : <Copy size={14} className="group-hover:rotate-12 transition-transform"/>}
                               <span className="text-[10px] font-black uppercase tracking-widest">{copiedId === scene.id ? 'DONE' : 'COPY'}</span>
                             </button>
                           </div>
                           <textarea 
                             value={scene.videoPrompt}
                             onChange={(e) => updateScenePrompt(scene.id, 'videoPrompt', e.target.value)}
                             className="w-full bg-slate-950/80 border border-slate-800/50 rounded-[2rem] p-5 text-[11px] text-slate-300 font-medium italic leading-relaxed focus:border-emerald-500/50 outline-none h-24 custom-scrollbar resize-none transition-colors shadow-inner"
                             placeholder="Edit video movement instructions..."
                           />
                         </div>

                         {scene.status === 'generating_images' || scene.status === 'generating_video' ? (
                           <div className="text-center animate-pulse flex flex-col items-center mt-44">
                             <div className="relative w-24 h-24 mb-8">
                               <RefreshCw size={96} className="animate-spin text-emerald-500 opacity-20 absolute inset-0"/>
                               <Video size={48} className="text-emerald-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
                             </div>
                             <p className="text-[10px] font-black uppercase tracking-[0.5em] text-emerald-400">Rendering Vertical 9:16 Assets...</p>
                           </div>
                         ) : scene.generatedVideoUrl ? (
                           <div className="w-full max-w-[280px] space-y-6 text-center animate-in zoom-in-95 mt-44">
                              <video src={scene.generatedVideoUrl} controls autoPlay loop className="w-full rounded-[3.8rem] border-4 border-slate-800 shadow-2xl mb-4 aspect-[9/16] object-cover bg-slate-900 ring-[12px] ring-emerald-500/5"/>
                              <div className="grid grid-cols-2 gap-4">
                                <a href={scene.generatedVideoUrl} download className="flex items-center justify-center gap-2 py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-xl shadow-emerald-950/40">
                                  <Video size={16}/> DOWNLOAD
                                </a>
                                {scene.selectedImage && (
                                  <button onClick={() => downloadBase64Image(scene.selectedImage!, `${scene.character}_916_final.png`)} className="flex items-center justify-center gap-2 py-4 bg-slate-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-600 transition-all">
                                    <FileImage size={16}/> FRAME
                                  </button>
                                )}
                              </div>
                           </div>
                         ) : scene.generatedImages ? (
                           <div className="flex flex-col w-full h-full justify-center items-center gap-8 animate-in slide-in-from-right-6 mt-44">
                              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.6em] bg-slate-900/90 px-8 py-3 rounded-full border border-slate-800 shadow-2xl ring-1 ring-slate-700/50">Select Actor Frame</div>
                              <div className="grid grid-cols-2 gap-8 w-full max-w-[440px] px-6">
                                {scene.generatedImages.map((img, i) => (
                                  <div key={i} className="flex flex-col gap-4 group">
                                    <div onClick={() => animateScene(scene.id, img)} className="relative aspect-[9/16] overflow-hidden rounded-[3.5rem] border-4 border-slate-800 hover:border-emerald-500 cursor-pointer transition-all shadow-2xl group-hover:shadow-emerald-500/40 bg-slate-900 ring-4 ring-transparent hover:ring-emerald-500/20">
                                      <img src={`data:image/png;base64,${img}`} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-[3s]"/>
                                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white font-black text-[11px] tracking-widest backdrop-blur-md bg-emerald-950/70 transition-all text-center px-8 uppercase gap-4">
                                         <Zap size={36} className="text-amber-400 animate-bounce"/>
                                         ANIMATE 9:16
                                      </div>
                                    </div>
                                    <button onClick={() => downloadBase64Image(img, `${scene.character}_v${i+1}.png`)} className="flex items-center justify-center gap-2 py-3 bg-slate-800/80 hover:bg-slate-700 text-[9px] font-black uppercase tracking-[0.4em] rounded-2xl transition-all border border-slate-700/50 shadow-lg">
                                      <Download size={14}/> SAVE PHOTO
                                    </button>
                                  </div>
                                ))}
                              </div>
                           </div>
                         ) : (
                           <div className="text-center opacity-10 flex flex-col items-center gap-8 select-none mt-12 scale-150 grayscale group-hover:grayscale-0 transition-all">
                             <ImageIcon size={96} />
                             <p className="text-[10px] font-black uppercase tracking-[0.8em]">Awaiting Frame</p>
                           </div>
                         )}
                      </div>
                    </div>
                  )) : (
                    <div className="py-20 text-center text-slate-500 italic border-4 border-dashed border-slate-800 rounded-[4rem]">
                      No scenes generated yet. Please click "GENERATE SCRIPT".
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 backdrop-blur-3xl border-t border-slate-800/50 py-6 px-10 flex justify-center z-50 bg-slate-950/98">
        <div className="flex items-center gap-16 text-[10px] font-black text-slate-500 uppercase tracking-[0.8em]">
           <div className="flex items-center gap-3"><CheckCircle2 size={14} className="text-emerald-500"/> System: Active</div>
           <div className="w-px h-4 bg-slate-800" />
           <div className="flex items-center gap-3 text-emerald-400"><UserCheck size={14} className="animate-pulse"/> Actor Consistency: ON</div>
           <div className="w-px h-4 bg-slate-800" />
           <div className="flex items-center gap-3 text-blue-400"><DownloadCloud size={14}/> 9:16 Studio Ready</div>
        </div>
      </footer>
    </div>
  );
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AppContent />
  </ErrorBoundary>
);

export default App;
