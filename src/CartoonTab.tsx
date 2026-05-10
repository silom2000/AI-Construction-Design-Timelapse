import { useState } from 'react';
import './CartoonTab.css';

// ── Scene stage icons/labels ────────────────────────────────────────────────
const STAGE_ICONS: Record<number, string> = {
  1: '🎣', 2: '🌅', 3: '🔧', 4: '😓',
  5: '😂', 6: '🤝', 7: '🌙', 8: '🏆',
};

// ── Types ────────────────────────────────────────────────────────────────────
interface Idea {
  title: string;
  profession: string;
  era: string;
  character: string;
  hook: string;
  profession_fact: string;
}

interface Scene {
  id: number;
  stage: string;
  line: string;
  imagePrompt: string;
  videoPrompt: string;
}

interface CharacterProfile {
  faceShape: string;
  nose: string;
  lips: string;
  ears: string;
  eyes: string;
  hair: string;
  skinTone: string;
  distinguishingFeature: string;
  cartoonStyle?: string;
}

interface CartoonScript {
  title: string;
  profession: string;
  era: string;
  characterProfile?: CharacterProfile;
  scenes: Scene[];
}

interface SceneState {
  imgLoading?: boolean;
  imgUrl?: string;
  audioLoading?: boolean;
  audioUrl?: string;
  vidLoading?: boolean;
  vidUrl?: string;
  statusText?: string;
}

// ── Component ────────────────────────────────────────────────────────────────
export default function CartoonTab() {
  const [topic, setTopic]                     = useState('');
  const [language, setLanguage]               = useState('Russian');
  const [imageModel, setImageModel]           = useState<'imagen4' | 'nano_banana_2' | 'nano_banana_pro'>('imagen4');
  const [ideas, setIdeas]                     = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea]       = useState<Idea | null>(null);
  const [script, setScript]                   = useState<CartoonScript | null>(null);
  const [projectFolder, setProjectFolder]     = useState<string | null>(null);
  const [isLoadingIdeas, setIsLoadingIdeas]   = useState(false);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [sceneStates, setSceneStates]         = useState<Record<number, SceneState>>({});
  const [copiedIdx, setCopiedIdx]             = useState<number | null>(null);

  // ── Generate ideas ─────────────────────────────────────────────────────────
  const handleGenerateIdeas = async () => {
    setIsLoadingIdeas(true);
    try {
      const result = await (window as any).electronAPI.cartoonGenerateIdeas({ topic, language });
      setIdeas(result);
      setScript(null);
      setSelectedIdea(null);
    } catch (e) {
      console.error(e);
      alert('Failed to generate profession ideas.');
    } finally {
      setIsLoadingIdeas(false);
    }
  };

  // ── Select idea → generate script ─────────────────────────────────────────
  const handleSelectIdea = async (idea: Idea) => {
    setSelectedIdea(idea);
    setIsLoadingScript(true);
    try {
      const folder = await (window as any).electronAPI.cartoonCreateFolder();
      setProjectFolder(folder);
      const result = await (window as any).electronAPI.cartoonGenerateScript({ idea, language, projectFolder: folder });
      setScript(result);
      setSceneStates({});
    } catch (e) {
      console.error(e);
      alert('Failed to generate cartoon script.');
    } finally {
      setIsLoadingScript(false);
    }
  };

  // ── Generate image ─────────────────────────────────────────────────────────
  const handleGenerateImage = async (sceneId: number, prompt: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: true, statusText: 'Generating image...' } }));
    try {
      const url = await (window as any).electronAPI.cartoonGenerateImage({
        sceneIndex: sceneId, imagePrompt: prompt, imageModel, projectFolder
      });
      const imgUrl = Array.isArray(url) ? url[0] : url;
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, imgUrl, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, statusText: 'Image generation failed' } }));
    }
  };

  // ── Regenerate image ───────────────────────────────────────────────────────
  const handleRegenerateImage = async (sceneId: number, prompt: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgUrl: undefined, imgLoading: true, statusText: 'Regenerating image...' } }));
    try {
      const url = await (window as any).electronAPI.cartoonGenerateImage({
        sceneIndex: sceneId, imagePrompt: prompt, imageModel, projectFolder
      });
      const imgUrl = Array.isArray(url) ? url[0] : url;
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, imgUrl, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, statusText: 'Regeneration failed' } }));
    }
  };

  // ── Generate audio ─────────────────────────────────────────────────────────
  const handleGenerateAudio = async (sceneId: number, text: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: true, statusText: 'Synthesizing voice...' } }));
    try {
      const audioPath = await (window as any).electronAPI.cartoonGenerateAudio({
        sceneIndex: sceneId, text, language, projectFolder
      });
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: false, audioUrl: audioPath, statusText: undefined } }));
    } catch (e) {
      console.error('Audio error:', e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: false, statusText: 'Voice generation failed' } }));
    }
  };

  // ── Regenerate video (same reference image, clears previous result) ────────
  const handleRegenerateVideo = async (sceneId: number, prompt: string, narrationLine?: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidUrl: undefined, vidLoading: true, statusText: 'Regenerating video...' } }));
    const state = sceneStates[sceneId];
    try {
      const url = await (window as any).electronAPI.cartoonGenerateVideo({
        sceneIndex: sceneId,
        videoPrompt: prompt,
        sourceImageUrl: state?.imgUrl,
        narrationLine: narrationLine || '',
        projectFolder
      });
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, vidUrl: url, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, statusText: 'Video regeneration failed' } }));
    }
  };

  // ── Generate video ─────────────────────────────────────────────────────────
  const handleGenerateVideo = async (sceneId: number, prompt: string, narrationLine?: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: true, statusText: 'Generating video...' } }));
    const state = sceneStates[sceneId];
    try {
      const url = await (window as any).electronAPI.cartoonGenerateVideo({
        sceneIndex: sceneId,
        videoPrompt: prompt,
        sourceImageUrl: state?.imgUrl,
        narrationLine: narrationLine || '',
        projectFolder
      });
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, vidUrl: url, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, statusText: 'Video generation failed' } }));
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cartoon-container">
      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <div className="cartoon-sidebar">
        <h2 className="cartoon-title">🎨 Cartoon Profession Stories</h2>
        <p className="cartoon-subtitle">
          Discover hidden truths about professions across 3000 years of history —
          educational TikTok shorts in stylized 3D cartoon style
        </p>

        <div className="cartoon-form-group">
          {/* Language */}
          <label className="cartoon-label">Narration Language</label>
          <select
            className="cartoon-input"
            value={language}
            onChange={e => setLanguage(e.target.value)}
          >
            <option value="Russian">Русский</option>
            <option value="English">English</option>
            <option value="French">Français</option>
            <option value="German">Deutsch</option>
            <option value="Spanish">Español</option>
          </select>

          {/* Image model */}
          <label className="cartoon-label" style={{ marginTop: '14px' }}>Image Model</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {([
              { value: 'imagen4',         label: 'Imagen 4',         desc: 'Google, High quality' },
              { value: 'nano_banana_2',   label: 'Nano Banana 2',    desc: 'Fast generation' },
              { value: 'nano_banana_pro', label: 'Nano Banana Pro',  desc: '4K, Thinking model' },
            ] as const).map(m => (
              <div
                key={m.value}
                onClick={() => setImageModel(m.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '7px 10px', borderRadius: '6px', cursor: 'pointer',
                  backgroundColor: imageModel === m.value ? '#1a1500' : '#1a1a1a',
                  border: imageModel === m.value ? '1px solid #f0c040' : '1px solid #333',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0,
                  border: imageModel === m.value ? '4px solid #f0c040' : '2px solid #555',
                  backgroundColor: imageModel === m.value ? '#fff' : 'transparent',
                }} />
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: imageModel === m.value ? '#f0c040' : '#ccc' }}>{m.label}</div>
                  <div style={{ fontSize: '10px', color: '#666' }}>{m.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Topic */}
          <label className="cartoon-label" style={{ marginTop: '14px' }}>Profession Topic (Optional)</label>
          <textarea
            className="cartoon-input"
            placeholder="e.g. Medieval baker, 19th century surgeon, Ancient Roman architect, Japanese sword-smith..."
            value={topic}
            onChange={e => setTopic(e.target.value)}
            style={{ height: '70px', resize: 'none', marginBottom: '2px' }}
          />

          <button
            className="cartoon-btn"
            onClick={handleGenerateIdeas}
            disabled={isLoadingIdeas}
          >
            {isLoadingIdeas ? '⏳ Generating 2 ideas...' : '🎨 Generate 2 Profession Ideas'}
          </button>
        </div>

        {/* ── Idea cards ─────────────────────────────────────────────────── */}
        {ideas.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <label className="cartoon-label" style={{ marginBottom: '10px' }}>Choose Your Story</label>
            {ideas.map((idea, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectIdea(idea)}
                className={`cartoon-idea-btn ${selectedIdea === idea ? 'selected' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <h4 className="cartoon-idea-title" style={{ margin: 0, flex: 1 }}>{idea.title}</h4>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      const text = [idea.title, idea.era && `⏳ ${idea.era}`, idea.hook].filter(Boolean).join('\n');
                      navigator.clipboard.writeText(text).then(() => {
                        setCopiedIdx(idx);
                        setTimeout(() => setCopiedIdx(null), 2000);
                      });
                    }}
                    style={{
                      flexShrink: 0,
                      background: copiedIdx === idx ? '#1a4a1a' : '#222',
                      border: copiedIdx === idx ? '1px solid #4ade80' : '1px solid #444',
                      borderRadius: '4px',
                      color: copiedIdx === idx ? '#4ade80' : '#888',
                      fontSize: '0.65rem',
                      padding: '2px 7px',
                      cursor: 'pointer',
                    }}
                  >
                    {copiedIdx === idx ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
                {idea.profession && (
                  <div className="cartoon-idea-profession">🔨 {idea.profession}</div>
                )}
                {idea.era && (
                  <div style={{ fontSize: '0.68rem', color: '#888', marginTop: '2px' }}>📅 {idea.era}</div>
                )}
                <p className="cartoon-idea-hook">{idea.hook}</p>
                {idea.profession_fact && (
                  <div className="cartoon-idea-fact">💡 {idea.profession_fact}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <div className="cartoon-content">
        {isLoadingScript && (
          <div className="cartoon-loading">⏳ Writing your profession cartoon story...</div>
        )}

        {!isLoadingScript && script && (
          <div className="cartoon-script-container">
            <h3 className="cartoon-script-title">
              {script.title}
              {projectFolder && (
                <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: '12px', fontWeight: 'normal' }}>
                  📁 {projectFolder}
                </span>
              )}
            </h3>

            {script.profession && (
              <div className="cartoon-profession-badge">
                🔨 {script.profession}{script.era ? ` · ${script.era}` : ''}
              </div>
            )}

            {/* Character Profile */}
            {script.characterProfile && (
              <div className="cartoon-char-card">
                <h4>🎭 Cartoon Character Profile</h4>
                <div className="cartoon-char-grid">
                  {([
                    ['Face', script.characterProfile.faceShape],
                    ['Eyes', script.characterProfile.eyes],
                    ['Hair', script.characterProfile.hair],
                    ['Skin', script.characterProfile.skinTone],
                    ['Nose', script.characterProfile.nose],
                    ['Lips', script.characterProfile.lips],
                    ['Mark', script.characterProfile.distinguishingFeature],
                    ['Style', script.characterProfile.cartoonStyle],
                  ] as [string, string | undefined][]).map(([label, val]) => val && (
                    <div key={label}>
                      <span className="lbl">{label}: </span>
                      <span className="val">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scenes */}
            {script.scenes.map(scene => (
              <div key={scene.id} className="cartoon-scene">
                <div className="cartoon-scene-header">
                  <span className="cartoon-scene-badge">
                    {STAGE_ICONS[scene.id] || '🎬'} Scene {scene.id}: {scene.stage}
                  </span>
                </div>

                <p className="cartoon-scene-line">"{scene.line}"</p>

                <div className="cartoon-prompts-grid">
                  {/* Image column */}
                  <div>
                    <span className="cartoon-prompt-label-img">🖼️ Image Prompt:</span>
                    <p className="cartoon-prompt-text">{scene.imagePrompt}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <button
                        className="cartoon-media-btn"
                        onClick={() => handleGenerateImage(scene.id, scene.imagePrompt)}
                        disabled={sceneStates[scene.id]?.imgLoading}
                      >
                        {sceneStates[scene.id]?.imgLoading && !sceneStates[scene.id]?.imgUrl
                          ? '⏳ Generating...' : '🖼️ Generate Image'}
                      </button>
                      {sceneStates[scene.id]?.imgUrl && (
                        <button
                          className="cartoon-media-btn"
                          onClick={() => handleRegenerateImage(scene.id, scene.imagePrompt)}
                          disabled={sceneStates[scene.id]?.imgLoading}
                          style={{ borderColor: '#f0c040', color: '#f0c040' }}
                        >
                          {sceneStates[scene.id]?.imgLoading ? '⏳ Regenerating...' : '🔄 Regenerate'}
                        </button>
                      )}
                    </div>
                    {sceneStates[scene.id]?.imgUrl && (
                      <img
                        src={sceneStates[scene.id]?.imgUrl as string}
                        className="cartoon-media-preview"
                        alt="Scene preview"
                        onError={(e) => console.error('[CartoonTab] Image failed to load:', sceneStates[scene.id]?.imgUrl, e)}
                      />
                    )}
                  </div>

                  {/* Video + Audio column */}
                  <div>
                    <span className="cartoon-prompt-label-vid">🎥 Video Prompt:</span>
                    <p className="cartoon-prompt-text">{scene.videoPrompt}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <button
                        className="cartoon-media-btn"
                        onClick={() => handleGenerateVideo(scene.id, scene.videoPrompt, scene.line)}
                        disabled={sceneStates[scene.id]?.vidLoading || !sceneStates[scene.id]?.imgUrl}
                        title={!sceneStates[scene.id]?.imgUrl ? 'Generate image first' : ''}
                      >
                        {sceneStates[scene.id]?.vidLoading && !sceneStates[scene.id]?.vidUrl
                          ? '⏳ Generating...' : '🎥 Generate Video'}
                      </button>
                      {sceneStates[scene.id]?.vidUrl && (
                        <button
                          className="cartoon-media-btn"
                          onClick={() => handleRegenerateVideo(scene.id, scene.videoPrompt, scene.line)}
                          disabled={sceneStates[scene.id]?.vidLoading}
                          style={{ borderColor: '#60a5fa', color: '#60a5fa' }}
                        >
                          {sceneStates[scene.id]?.vidLoading ? '⏳ Regenerating...' : '🔄 Regenerate Video'}
                        </button>
                      )}
                      <button
                        className="cartoon-media-btn"
                        onClick={() => handleGenerateAudio(scene.id, scene.line)}
                        disabled={sceneStates[scene.id]?.audioLoading}
                        style={{ borderColor: '#4ade80', color: '#4ade80' }}
                      >
                        {sceneStates[scene.id]?.audioLoading ? '⏳ Voicing...' : '🔊 Generate Voice'}
                      </button>
                    </div>
                    {sceneStates[scene.id]?.vidUrl && (
                      <video
                        src={sceneStates[scene.id]?.vidUrl as string}
                        className="cartoon-media-preview"
                        controls
                        style={{ marginBottom: '8px' }}
                      />
                    )}
                    {sceneStates[scene.id]?.audioUrl && (
                      <audio
                        src={sceneStates[scene.id]?.audioUrl as string}
                        controls
                        style={{ width: '100%', outline: 'none', marginTop: '6px' }}
                        onError={(e) => console.error('[CartoonTab] Audio failed to load:', sceneStates[scene.id]?.audioUrl, e)}
                      />
                    )}
                  </div>
                </div>

                {sceneStates[scene.id]?.statusText && (
                  <div className="cartoon-status">Status: {sceneStates[scene.id]?.statusText}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {!isLoadingScript && !script && !isLoadingIdeas && (
          <div className="cartoon-empty">
            🎨 Generate Profession Ideas to start crafting your cartoon story.
          </div>
        )}
      </div>
    </div>
  );
}