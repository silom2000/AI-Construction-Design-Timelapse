import React, { useState, useEffect } from 'react';
import { SkeletonScene } from './electron.d';

type Language = 'en' | 'fr' | 'de' | 'es' | 'it';

const LANGUAGES: { value: Language; label: string; flag: string }[] = [
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'es', label: 'Español', flag: '🇪🇸' },
  { value: 'it', label: 'Italiano', flag: '🇮🇹' },
];

interface SceneState {
  imageUrl: string | null;
  videoUrl: string | null;
  imageLoading: boolean;
  videoLoading: boolean;
  videoProgress: string;
  error: string | null;
}

export default function SkeletonTab() {
  const [language, setLanguage] = useState<Language>('en');
  const [imageModel, setImageModel] = useState<'zimage' | 'imagen-4' | 'grok-imagine' | 'klein' | 'freepik-mystic' | 'freepik-flux-dev'>('zimage');
  const [videoModel, setVideoModel] = useState<"freepik-wan" | "pollinations-ltx2" | "pixverse-v5" | "grok-video">("freepik-wan");
  const [useKaraoke, setUseKaraoke] = useState(true);

  // Phase 1
  const [ideasText, setIdeasText] = useState('');
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [parsedIdeas, setParsedIdeas] = useState<{ num: number; title: string; desc: string; ru?: string }[]>([]);

  // Phase 2
  const [selectedIdea, setSelectedIdea] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [script, setScript] = useState('');
  const [scenes, setScenes] = useState<SkeletonScene[]>([]);

  // Per-scene state
  const [sceneStates, setSceneStates] = useState<SceneState[]>([]);

  // Audio state
  const [fullAudioUrl, setFullAudioUrl] = useState<string | null>(null);
  const [sceneAudioUrls, setSceneAudioUrls] = useState<(string | null)[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);

  // Assembly
  const [assembling, setAssembling] = useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);

  // Listen for per-scene video progress
  useEffect(() => {
    window.electronAPI.onSkeletonVideoProgress((data: any) => {
      if (data.sceneIndex !== undefined) {
        setSceneStates(prev => {
          const next = [...prev];
          if (next[data.sceneIndex]) {
            next[data.sceneIndex] = {
              ...next[data.sceneIndex],
              videoProgress: `${data.state} (${data.attempt}/${data.maxAttempts})`
            };
          }
          return next;
        });
      }
    });
  }, []);

  // ── helpers ──────────────────────────────────────────────
  const updateScene = (i: number, patch: Partial<SceneState>) =>
    setSceneStates(prev => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });

  // ── Parse raw ideas text into structured list ────────────
  const parseIdeas = (text: string) => {
    const lines = text.split('\n');
    const result: { num: number; title: string; desc: string; ru?: string }[] = [];
    let current: { num: number; title: string; desc: string; ru?: string } | null = null;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      // Match "1. **Title**" or "1. Title" or "1) Title"
      const numMatch = line.match(/^(\d+)[.)\s]+(.+)/);
      if (numMatch) {
        if (current) result.push(current);
        const content = numMatch[2].replace(/\*\*/g, '').trim();
        const parts = content.split('|').map(p => p.trim());

        // Format: Title | Russian Translation | Description
        const title = parts[0] || '';
        const ru = parts[1] || '';
        const desc = parts[2] || '';

        current = { num: parseInt(numMatch[1]), title, ru, desc };
      } else if (current && line.length > 0 && !line.toLowerCase().startsWith('choose')) {
        // Fallback for description line if not in single line pipe format
        current.desc = line.replace(/^[-–•]\s*/, '');
      }
    }
    if (current) result.push(current);
    return result;
  };

  // ── Phase 1: generate ideas ───────────────────────────────
  const handleGenerateIdeas = async () => {
    setIdeasLoading(true);
    setIdeasText('');
    setParsedIdeas([]);
    setSelectedIdea('');
    setScript('');
    setScenes([]);
    setSceneStates([]);
    setFinalVideoUrl(null);
    try {
      const result = await window.electronAPI.skeletonGenerateIdeas(language);
      setIdeasText(result);
      setParsedIdeas(parseIdeas(result));
    } catch (e: any) {
      alert('Ошибка генерации идей: ' + e.message);
    } finally {
      setIdeasLoading(false);
    }
  };

  // ── Click idea card → instantly start script generation ──
  const handleIdeaClick = async (title: string) => {
    setSelectedIdea(title);
    await handleGenerateScriptFor(title);
  };

  // ── Phase 2: generate script + scenes ────────────────────
  const handleGenerateScriptFor = async (ideaTitle: string) => {
    if (!ideaTitle.trim()) return;
    setScriptLoading(true);
    setScript('');
    setScenes([]);
    setSceneStates([]);
    setFinalVideoUrl(null);
    try {
      const { script: s, scenes: sc } = await window.electronAPI.skeletonGenerateScript(ideaTitle.trim(), language, videoModel);
      setScript(s);
      setScenes(sc);
      setSceneStates(sc.map(() => ({
        imageUrl: null, videoUrl: null,
        imageLoading: false, videoLoading: false,
        videoProgress: '', error: null
      })));
    } catch (e: any) {
      alert('Ошибка генерации сценария: ' + e.message);
    } finally {
      setScriptLoading(false);
    }
  };

  // ── Phase 3: generate image for scene ────────────────────
  const handleGenerateImage = async (i: number) => {
    const scene = scenes[i];
    if (!scene) return;
    updateScene(i, { imageLoading: true, error: null });
    try {
      const url = await window.electronAPI.skeletonGenerateImage({
        sceneIndex: i,
        imagePrompt: scene.image_prompt,
        imageModel
      });
      updateScene(i, { imageUrl: `${url}?t=${Date.now()}`, imageLoading: false });
    } catch (e: any) {
      updateScene(i, { imageLoading: false, error: e.message });
    }
  };

  // ── Phase 4: generate video for scene ────────────────────
  const handleGenerateVideo = async (i: number) => {
    const scene = scenes[i];
    if (!scene) return;
    const isLTX2 = videoModel === 'pollinations-ltx2';
    // LTX-2 is text-to-video — no image required
    // grok-video and freepik-wan require a reference image
    if (!isLTX2 && !sceneStates[i]?.imageUrl) {
      alert('Сначала сгенерируйте изображение для этой сцены');
      return;
    }
    updateScene(i, { videoLoading: true, videoProgress: 'Отправка задачи...', error: null });
    try {
      const url = await window.electronAPI.skeletonGenerateVideo({
        sceneIndex: i,
        videoPrompt: scene.video_prompt,
        ltxVideoPrompt: scene.ltx_video_prompt,
        scriptLine: scene.script_line,
        fullScript: script,
        language,
        videoModel,
        audioUrl: scene.audio_url
      });
      updateScene(i, { videoUrl: `${url}?t=${Date.now()}`, videoLoading: false, videoProgress: '' });
    } catch (e: any) {
      updateScene(i, { videoLoading: false, videoProgress: '', error: e.message });
    }
  };

  // ── Phase 3.5: synthesize audio (after images) ───────────
  const handleGenerateAudio = async () => {
    if (!script || scenes.length === 0) return;
    setAudioLoading(true);
    try {
      const { fullAudioUrl: fau, sceneAudioUrls: sau } = await window.electronAPI.skeletonGenerateAudio({
        script,
        scenes,
        language
      });
      setFullAudioUrl(fau);
      setSceneAudioUrls(sau);
      // Also update scenes with audio_url so video generation can pick it up
      setScenes(prev => prev.map((s, i) => ({ ...s, audio_url: sau[i] || undefined })));
    } catch (e: any) {
      alert('Ошибка синтеза аудио: ' + e.message);
    } finally {
      setAudioLoading(false);
    }
  };

  // ── Generate all images sequentially ─────────────────────
  const handleGenerateAllImages = async () => {
    for (let i = 0; i < scenes.length; i++) {
      await handleGenerateImage(i);
    }
    // Auto-synthesize audio after all images are ready
    await handleGenerateAudio();
  };

  // ── Generate all videos sequentially ─────────────────────
  const handleGenerateAllVideos = async () => {
    for (let i = 0; i < scenes.length; i++) {
      await handleGenerateVideo(i);
    }
  };

  const isLTX2Mode = videoModel === 'pollinations-ltx2';

  // ── Phase 5: assemble final short ────────────────────────
  const handleAssemble = async () => {
    setAssembling(true);
    try {
      const url = await window.electronAPI.skeletonAssembleVideo({
        useKaraoke,
        ideaTitle: selectedIdea,
        language
      });
      setFinalVideoUrl(url);
    } catch (e: any) {
      alert('Ошибка сборки: ' + e.message);
    } finally {
      setAssembling(false);
    }
  };

  // In LTX-2 mode images are not needed — skip image step entirely
  const allImagesReady = scenes.length > 0 && (isLTX2Mode || sceneStates.every(s => !!s.imageUrl));
  const allVideosReady = scenes.length > 0 && sceneStates.every(s => !!s.videoUrl);

  // ── styles ───────────────────────────────────────────────
  const card: React.CSSProperties = {
    backgroundColor: '#1e1e1e', border: '1px solid #333',
    borderRadius: '8px', padding: '12px', marginBottom: '10px'
  };
  const btn = (color: string, disabled?: boolean): React.CSSProperties => ({
    padding: '9px 16px', backgroundColor: disabled ? '#444' : color,
    color: disabled ? '#888' : '#fff', border: 'none', borderRadius: '5px',
    cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 'bold',
    fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px'
  });

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#111' }}>

      {/* ── LEFT SIDEBAR ────────────────────────────────── */}
      <div style={{
        width: '320px', flexShrink: 0, backgroundColor: '#1a1a1a',
        padding: '16px', overflowY: 'auto', borderRight: '1px solid #333'
      }}>
        <h3 style={{ margin: '0 0 14px 0', color: '#fff', fontSize: '15px' }}>
          💀 Skeleton Viral Shorts
        </h3>

        {/* Image Model Selection — hidden in LTX-2 mode (no images needed) */}
        {!isLTX2Mode && (
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
              🖼️ Модель изображений:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {([
                { value: 'zimage', label: 'ZImage', desc: 'Быстрая, универсальная' },
                { value: 'freepik-mystic', label: 'Freepik Mystic', desc: 'Ultra-realistic, luxury' },
                { value: 'freepik-flux-dev', label: 'Freepik Flux Dev', desc: 'Detailed, photorealistic' },
                { value: 'imagen-4', label: 'Imagen 4', desc: 'Google, высокое качество' },
                { value: 'grok-imagine', label: 'Grok Imagine', desc: 'xAI, креативная' },
                { value: 'klein', label: 'Klein', desc: 'Pollinations, детальная' },
              ] as const).map(m => (
                <div
                  key={m.value}
                  onClick={() => setImageModel(m.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                    backgroundColor: imageModel === m.value ? '#1a3a5c' : '#222',
                    border: imageModel === m.value ? '1px solid #007acc' : '1px solid #444',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{
                    width: '13px', height: '13px', borderRadius: '50%', flexShrink: 0,
                    border: imageModel === m.value ? '4px solid #007acc' : '2px solid #666',
                    backgroundColor: imageModel === m.value ? '#fff' : 'transparent'
                  }} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: imageModel === m.value ? '#fff' : '#ccc' }}>{m.label}</div>
                    <div style={{ fontSize: '10px', color: '#888' }}>{m.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* LTX-2 mode info banner */}
        {isLTX2Mode && (
          <div style={{
            marginBottom: '16px', padding: '10px 12px',
            backgroundColor: '#0d1f0d', border: '1px solid #2a5c2a',
            borderRadius: '8px', fontSize: '11px', color: '#7dbb7d', lineHeight: '1.6'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px', fontSize: '12px' }}>⚡ LTX-2 Text-to-Video</div>
            Изображения не нужны — LTX-2 генерирует видео напрямую из текстового промпта.
            Промпты оптимизированы специально для этой модели.
          </div>
        )}

        {/* Video model selection */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
            🎬 Модель видео:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {[
              { value: 'freepik-wan', label: 'Freepik WAN v2.6', desc: 'Высочайшее качество (20/день)' },
              { value: 'pixverse-v5', label: 'PixVerse V5', desc: 'Оптимально: 125 генераций/день' },
              { value: 'grok-video', label: 'Grok Video', desc: 'Pollinations, быстро (text-to-video)' },
              { value: 'pollinations-ltx2', label: 'Pollinations LTX-2', desc: 'Мгновенно, только текст (без референса)' },
            ].map(m => (
              <div
                key={m.value}
                onClick={() => setVideoModel(m.value as any)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: videoModel === m.value ? '#1a3a5c' : '#222',
                  border: videoModel === m.value ? '1px solid #007acc' : '1px solid #444',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{
                  width: '13px', height: '13px', borderRadius: '50%', flexShrink: 0,
                  border: videoModel === m.value ? '4px solid #007acc' : '2px solid #666',
                  backgroundColor: videoModel === m.value ? '#fff' : 'transparent'
                }} />
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: videoModel === m.value ? '#fff' : '#ccc' }}>{m.label}</div>
                  <div style={{ fontSize: '10px', color: '#888' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Language selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', color: '#aaa', display: 'block', marginBottom: '6px' }}>
            🌍 Язык озвучки:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {LANGUAGES.map(l => (
              <div
                key={l.value}
                onClick={() => setLanguage(l.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: language === l.value ? '#1a3a5c' : '#222',
                  border: language === l.value ? '1px solid #007acc' : '1px solid #444',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{
                  width: '13px', height: '13px', borderRadius: '50%', flexShrink: 0,
                  border: language === l.value ? '4px solid #007acc' : '2px solid #666',
                  backgroundColor: language === l.value ? '#fff' : 'transparent'
                }} />
                <span style={{ fontSize: '13px', color: language === l.value ? '#fff' : '#bbb' }}>
                  {l.flag} {l.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Karaoke Settings */}
        <div style={{ ...card, padding: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
            <input
              type="checkbox"
              checked={useKaraoke}
              onChange={(e) => setUseKaraoke(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff' }}>🎤 Караоке Субтитры</span>
          </label>
          <p style={{ fontSize: '10px', color: '#888', margin: '4px 0 0 26px' }}>
            Ярко-зелёная подсветка слов через Scribe
          </p>
        </div>

        {/* Step 1 */}
        <div style={{ ...card }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>
            ШАГ 1 — Генерация идей
          </div>
          <button
            onClick={handleGenerateIdeas}
            disabled={ideasLoading}
            style={btn('#6610f2', ideasLoading)}
          >
            {ideasLoading && <span className="spinner" style={{ width: '11px', height: '11px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
            {ideasLoading ? 'Генерация...' : '💡 Сгенерировать идеи'}
          </button>
        </div>

        {/* Step 2 — hint after ideas generated */}
        {parsedIdeas.length > 0 && !scriptLoading && scenes.length === 0 && (
          <div style={{
            ...card,
            border: '1px solid #2a4a2a',
            backgroundColor: '#111',
            fontSize: '12px', color: '#6c6', textAlign: 'center', padding: '10px'
          }}>
            👆 Кликните на идею справа для генерации
          </div>
        )}
        {scriptLoading && (
          <div style={{
            ...card,
            border: '1px solid #1a3a5c',
            backgroundColor: '#0a1a2a',
            fontSize: '12px', color: '#7af', textAlign: 'center', padding: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
          }}>
            <span style={{
              width: '12px', height: '12px',
              border: '2px solid #7af', borderTop: '2px solid transparent',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
              display: 'inline-block', flexShrink: 0
            }} />
            Генерация сценария...
          </div>
        )}

        {scenes.length > 0 && (
          <div style={{ ...card }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>
              {isLTX2Mode ? 'ШАГ 3 — Пакетная генерация' : 'ШАГ 3+4 — Пакетная генерация'}
            </div>
            {/* Image generation — only for WAN mode */}
            {!isLTX2Mode && (
              <button
                onClick={handleGenerateAllImages}
                disabled={sceneStates.some(s => s.imageLoading) || audioLoading}
                style={{ ...btn('#28a745', sceneStates.some(s => s.imageLoading) || audioLoading), width: '100%', justifyContent: 'center', marginBottom: '7px' }}
              >
                🖼️ Все изображения ({scenes.length} сцен)
              </button>
            )}
            {/* Audio status badge */}
            {audioLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', marginBottom: '7px', backgroundColor: '#1a2a1a', border: '1px solid #2a4a2a', borderRadius: '5px', fontSize: '11px', color: '#6c6' }}>
                <span style={{ width: '10px', height: '10px', border: '2px solid #6c6', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                🎤 Синтез аудио...
              </div>
            )}
            {!audioLoading && sceneAudioUrls.filter(Boolean).length > 0 && (
              <div style={{ padding: '4px 10px', marginBottom: '7px', backgroundColor: '#0a1a0a', border: '1px solid #2a4a2a', borderRadius: '5px', fontSize: '11px', color: '#6c6' }}>
                ✅ Аудио готово ({sceneAudioUrls.filter(Boolean).length}/{scenes.length} сцен)
                {fullAudioUrl && (
                  <a href={fullAudioUrl} target="_blank" rel="noreferrer" style={{ marginLeft: '8px', color: '#6af', textDecoration: 'underline', fontSize: '10px' }}>
                    🔊 Слушать полное аудио
                  </a>
                )}
              </div>
            )}
            <button
              onClick={handleGenerateAllVideos}
              disabled={!allImagesReady || sceneStates.some(s => s.videoLoading) || audioLoading}
              style={{ ...btn('#17a2b8', !allImagesReady || sceneStates.some(s => s.videoLoading) || audioLoading), width: '100%', justifyContent: 'center' }}
            >
              🎬 {isLTX2Mode ? 'Генерировать все видео' : 'Все видео'} ({scenes.length} сцен)
            </button>
          </div>
        )}

        {/* Step 5 */}
        {allVideosReady && (
          <div style={{ ...card }}>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>
              ШАГ 5 — Сборка финального шорта
            </div>
            <button
              onClick={handleAssemble}
              disabled={assembling}
              style={{ ...btn('#e83e8c', assembling), width: '100%', justifyContent: 'center' }}
            >
              {assembling && <span className="spinner" style={{ width: '11px', height: '11px', border: '2px solid #fff', borderTop: '2px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />}
              {assembling ? 'Сборка...' : '🎞️ Собрать финальный Shorts'}
            </button>
          </div>
        )}

        {finalVideoUrl && (
          <div style={{ ...card, border: '1px solid #28a745' }}>
            <div style={{ fontSize: '12px', color: '#28a745', marginBottom: '6px', fontWeight: 'bold' }}>✅ Готово!</div>
            <div style={{ display: 'flex', justifyContent: 'center', backgroundColor: '#000', borderRadius: '4px', overflow: 'hidden' }}>
              <video
                src={finalVideoUrl}
                controls
                style={{
                  width: 'auto',
                  maxHeight: '400px',
                  aspectRatio: '9 / 16'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Ideas — clickable cards */}
        {parsedIdeas.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '10px', fontWeight: 'bold' }}>
              💡 Выберите идею — кликните для генерации сценария:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {parsedIdeas.map(idea => (
                <div
                  key={idea.num}
                  onClick={() => !scriptLoading && handleIdeaClick(idea.title)}
                  style={{
                    display: 'flex', gap: '12px', alignItems: 'flex-start',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: selectedIdea === idea.title
                      ? '1px solid #007acc'
                      : '1px solid #2a2a2a',
                    backgroundColor: selectedIdea === idea.title
                      ? '#0d2a40'
                      : '#1a1a1a',
                    cursor: scriptLoading ? 'wait' : 'pointer',
                    transition: 'all 0.15s',
                    opacity: scriptLoading && selectedIdea !== idea.title ? 0.45 : 1,
                  }}
                  onMouseEnter={e => {
                    if (!scriptLoading && selectedIdea !== idea.title)
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = '#222';
                  }}
                  onMouseLeave={e => {
                    if (selectedIdea !== idea.title)
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1a1a1a';
                  }}
                >
                  {/* Number badge */}
                  <div style={{
                    minWidth: '26px', height: '26px', borderRadius: '50%',
                    backgroundColor: selectedIdea === idea.title ? '#007acc' : '#333',
                    color: '#fff', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', flexShrink: 0
                  }}>
                    {idea.num}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 'bold',
                      color: selectedIdea === idea.title ? '#fff' : '#ddd',
                      marginBottom: '3px', lineHeight: '1.4'
                    }}>
                      {idea.title}
                    </div>

                    {/* Russian Translation below the main title */}
                    {idea.ru && (
                      <div style={{
                        fontSize: '11px', color: '#ffc107',
                        fontWeight: '500', marginBottom: '4px',
                        display: 'flex', alignItems: 'center', gap: '5px'
                      }}>
                        <span style={{ fontSize: '10px', opacity: 0.8 }}>🇷🇺</span> {idea.ru}
                      </div>
                    )}

                    {idea.desc && (
                      <div style={{ fontSize: '11px', color: '#888', lineHeight: '1.5' }}>
                        {idea.desc}
                      </div>
                    )}
                  </div>

                  {/* Loading spinner on selected */}
                  {scriptLoading && selectedIdea === idea.title && (
                    <span style={{
                      width: '14px', height: '14px', flexShrink: 0,
                      border: '2px solid #007acc', borderTop: '2px solid transparent',
                      borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                      display: 'inline-block', marginTop: '4px'
                    }} />
                  )}

                  {/* Checkmark on selected + done */}
                  {!scriptLoading && selectedIdea === idea.title && scenes.length > 0 && (
                    <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '2px' }}>✅</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Script */}
        {script && (
          <div style={{ ...card, marginBottom: '16px', border: '1px solid #444' }}>
            <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px', fontWeight: 'bold' }}>
              📝 Сценарий (озвучка):
            </div>
            <pre style={{
              color: '#d4f1ff', fontSize: '12px', lineHeight: '1.8',
              whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'monospace'
            }}>
              {script}
            </pre>
          </div>
        )}

        {/* Scenes grid */}
        {scenes.length > 0 && (
          <>
            <div style={{ fontSize: '14px', color: '#ccc', marginBottom: '12px', fontWeight: 'bold' }}>
              🎬 Сцены ({scenes.length}) — модель: {videoModel === 'pollinations-ltx2' ? 'Pollinations LTX-2' : videoModel === 'pixverse-v5' ? 'PixVerse V5' : 'Freepik WAN v2.6'}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '15px',
              justifyContent: 'start',
              alignItems: 'stretch'
            }}>
              {scenes.map((scene, i) => {
                const ss = sceneStates[i] || { imageUrl: null, videoUrl: null, imageLoading: false, videoLoading: false, videoProgress: '', error: null };
                const videoDisabled = isLTX2Mode
                  ? ss.videoLoading
                  : (!ss.imageUrl || ss.videoLoading || ss.imageLoading);
                return (
                  <div key={i} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>

                    {/* Text content area with min-height to align preview boxes horizontally */}
                    <div style={{ minHeight: '140px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Scene header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <span style={{ fontSize: '12px', color: '#007acc', fontWeight: 'bold', flex: 1, lineHeight: '1.4' }}>
                          Сцена {scene.scene} — {scene.checkpoint}
                        </span>
                        <span style={{
                          fontSize: '9px', color: '#888', backgroundColor: '#222',
                          padding: '2px 6px', border: '1px solid #333', borderRadius: '3px',
                          whiteSpace: 'nowrap'
                        }}>
                          {scene.environment}
                        </span>
                      </div>

                      {/* Script line */}
                      <div style={{
                        fontSize: '11px', color: '#d4f1ff', lineHeight: '1.5', fontStyle: 'italic',
                        borderLeft: '2px solid #007acc', paddingLeft: '8px',
                        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical'
                      }}>
                        "{scene.script_line}"
                      </div>
                    </div>

                    {/* LTX-2 mode: show generated prompt instead of image placeholder */}
                    {isLTX2Mode && !ss.videoUrl && (
                      <div style={{
                        fontSize: '10px', color: '#8bbb8b', backgroundColor: '#0d1a0d',
                        border: '1px solid #1e3c1e', borderRadius: '5px',
                        padding: '7px 9px', lineHeight: '1.55',
                        maxHeight: '120px', overflowY: 'auto'
                      }}>
                        <div style={{ fontWeight: 'bold', color: '#5c9e5c', marginBottom: '4px', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>LTX-2 Промпт:</div>
                        {scene.ltx_video_prompt}
                      </div>
                    )}

                    {/* Image / Video preview — strict 9:16 portrait */}
                    <div style={{
                      width: '100%',
                      paddingBottom: '177.78%',
                      position: 'relative',
                      backgroundColor: '#111',
                      borderRadius: '6px',
                      overflow: 'hidden',
                      flexShrink: 0,
                      // In LTX-2 mode hide the image slot until video is ready
                      display: (isLTX2Mode && !ss.videoUrl && !ss.videoLoading) ? 'none' : 'block'
                    }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {ss.videoUrl ? (
                          <video
                            src={ss.videoUrl} controls muted loop
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : ss.imageUrl ? (
                          <img
                            src={ss.imageUrl} alt={`scene ${i + 1}`}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <span style={{ color: '#444', fontSize: '11px' }}>Нет превью</span>
                        )}
                        {(ss.imageLoading || ss.videoLoading) && (
                          <div style={{
                            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px'
                          }}>
                            <span className="spinner" style={{ width: '24px', height: '24px', border: '3px solid #4caf50', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <span style={{ fontSize: '10px', color: '#ccc', textAlign: 'center', padding: '0 8px' }}>
                              {ss.videoLoading
                                ? (ss.videoProgress || (isLTX2Mode ? '⚡ LTX-2 генерация...' : 'Генерация видео...'))
                                : 'Генерация изображения...'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Video loading placeholder for LTX-2 when no video yet */}
                    {isLTX2Mode && !ss.videoUrl && ss.videoLoading && (
                      <div style={{
                        width: '100%', paddingBottom: '177.78%', position: 'relative',
                        backgroundColor: '#0a1a0a', borderRadius: '6px', overflow: 'hidden'
                      }}>
                        <div style={{
                          position: 'absolute', inset: 0, display: 'flex',
                          flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '10px'
                        }}>
                          <span className="spinner" style={{ width: '30px', height: '30px', border: '3px solid #4caf50', borderTop: '3px solid transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                          <span style={{ fontSize: '11px', color: '#7dbb7d', textAlign: 'center', padding: '0 12px' }}>
                            {ss.videoProgress || '⚡ LTX-2 генерирует видео...'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Error */}
                    {ss.error && (
                      <div style={{ fontSize: '10px', color: '#ff6b6b', background: '#2a0000', padding: '5px 7px', borderRadius: '4px' }}>
                        ❌ {ss.error}
                      </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {/* Image button — hidden in LTX-2 mode */}
                      {!isLTX2Mode && (
                        <button
                          onClick={() => handleGenerateImage(i)}
                          disabled={ss.imageLoading || ss.videoLoading}
                          style={{ ...btn('#28a745', ss.imageLoading || ss.videoLoading), flex: 1, justifyContent: 'center', fontSize: '11px' }}
                        >
                          {ss.imageLoading ? '...' : (ss.imageUrl ? '🔄 Картинка' : '🖼️ Картинка')}
                        </button>
                      )}
                      <button
                        onClick={() => handleGenerateVideo(i)}
                        disabled={videoDisabled}
                        style={{ ...btn(isLTX2Mode ? '#2e7d32' : '#17a2b8', videoDisabled), flex: 1, justifyContent: 'center', fontSize: '11px' }}
                      >
                        {ss.videoLoading
                          ? '...'
                          : ss.videoUrl
                            ? (isLTX2Mode ? '🔄 Видео' : '🔄 Видео')
                            : (isLTX2Mode ? '⚡ Генерировать' : '🎬 Видео')}
                      </button>
                    </div>

                    {/* Video progress */}
                    {ss.videoProgress && !ss.videoLoading && (
                      <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'center' }}>{ss.videoProgress}</div>
                    )}

                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!ideasText && !scriptLoading && !ideasLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: '#555', textAlign: 'center', gap: '12px' }}>
            <div style={{ fontSize: '48px' }}>💀</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#666' }}>Skeleton Viral Shorts</div>
            <div style={{ fontSize: '13px', color: '#444', maxWidth: '400px', lineHeight: '1.6' }}>
              Выберите язык озвучки и нажмите «Сгенерировать 10 идей».<br />
              AI создаст вирусный сценарий, изображения и видео<br />
              с голосовой озвучкой через Freepik WAN v2.6.
            </div>
          </div>
        )}

      </div>
    </div>
  );
}


