import { useState } from 'react';
import './SurviveTab.css';

type SceneState = {
  imgUrl?: string;
  imgLoading?: boolean;
  vidUrl?: string;
  vidLoading?: boolean;
  audioUrl?: string;
  audioLoading?: boolean;
  statusText?: string;
};

type Idea = {
  id: number;
  category: string;
  scenario: string;
  hook: string;
  description: string;
  stepsCount: number;
  difficulty: string;
  translation_ru: string;
};

type Step = {
  id: number;
  stepNumber: string;
  line: string;
  imagePrompt: string;
  videoPrompt: string;
};

type Script = {
  title: string;
  category: string;
  hook: string;
  steps: Step[];
};

type VideoModel = 'veo_31_lite' | 'veo_31_fast' | 'omni_flash';

const VIDEO_MODELS: { value: VideoModel; label: string; desc: string }[] = [
  { value: 'veo_31_lite', label: 'Veo 3.1 Lite', desc: 'Balanced generation' },
  { value: 'veo_31_fast', label: 'Veo 3.1 Fast', desc: 'Fast generation' },
  { value: 'omni_flash', label: 'Omni Flash', desc: 'Omni Flash generation' },
];

const STEP_ICONS: Record<number, string> = {
  0: '🚨',
  1: '1️⃣',
  2: '2️⃣',
  3: '3️⃣',
  4: '4️⃣',
  5: '5️⃣',
};

const STEP_LABELS: Record<number, string> = {
  0: 'INTRO — Hook',
  1: 'Step 1',
  2: 'Step 2',
  3: 'Step 3',
  4: 'Step 4',
  5: 'Step 5',
};

export function SurviveTab() {
  const [language, setLanguage] = useState('Russian');
  const [imageModel, setImageModel] = useState<'nano_banana_2' | 'nano_banana_pro'>('nano_banana_2');
  const [videoModel, setVideoModel] = useState<VideoModel>('veo_31_lite');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneState>>({});
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [characterRefUrl, setCharacterRefUrl] = useState<string | null>(null);

  const handleGenerateIdeas = async () => {
    setIsLoadingIdeas(true);
    setIdeas([]);
    setSelectedIdea(null);
    setScript(null);
    setSceneStates({});
    setProjectFolder('');
    setCharacterRefUrl(null);
    try {
      const result = await window.electronAPI.surviveGenerateIdeas({ language });
      setIdeas(result || []);
    } catch (err: any) {
      alert('Failed to generate ideas: ' + err.message);
    } finally {
      setIsLoadingIdeas(false);
    }
  };

  const handleSelectIdea = async (idea: Idea) => {
    setSelectedIdea(idea);
    setScript(null);
    setSceneStates({});
    setCharacterRefUrl(null);
    setIsLoadingScript(true);

    const timestamp = Date.now();
    const folderName = `Survive_${timestamp}`;
    setProjectFolder(folderName);

    try {
      const scriptData = await window.electronAPI.surviveGenerateScript({
        idea,
        language,
        projectFolder: folderName
      });
      setScript(scriptData);
    } catch (err: any) {
      alert('Failed to generate script: ' + err.message);
    } finally {
      setIsLoadingScript(false);
    }
  };

  const handleGenerateImage = async (sceneIndex: number, overrideRefUrl?: string | null): Promise<string | undefined> => {
    if (!script) return;
    const step = script.steps[sceneIndex];
    if (!step) return;

    setSceneStates(prev => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], imgLoading: true, statusText: 'Generating image...' }
    }));

    // Use explicitly passed refUrl (from handleGenerateAll loop) or fall back to state
    const refUrl = overrideRefUrl !== undefined ? overrideRefUrl : characterRefUrl;

    try {
      const imgUrl = await window.electronAPI.surviveGenerateImage({
        sceneIndex,
        imagePrompt: step.imagePrompt,
        imageModel,
        projectFolder,
        referenceImageUrl: sceneIndex > 0 ? refUrl : undefined
      });
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], imgUrl, imgLoading: false, statusText: 'Image ready' }
      }));
      // Store scene 0 image as character reference for subsequent scenes
      if (sceneIndex === 0 && imgUrl) {
        setCharacterRefUrl(imgUrl);
      }
      return imgUrl;
    } catch (err: any) {
      alert(`Image generation failed for step ${sceneIndex}: ${err.message}`);
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], imgLoading: false, statusText: 'Image failed' }
      }));
    }
  };

  const handleGenerateAudio = async (sceneIndex: number) => {
    if (!script) return;
    const step = script.steps[sceneIndex];
    if (!step) return;

    setSceneStates(prev => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], audioLoading: true, statusText: 'Generating audio...' }
    }));

    try {
      const audioUrl = await window.electronAPI.surviveGenerateAudio({
        sceneIndex,
        narrationLine: step.line,
        language,
        projectFolder
      });
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], audioUrl, audioLoading: false, statusText: 'Audio ready' }
      }));
    } catch (err: any) {
      alert(`Audio generation failed for step ${sceneIndex}: ${err.message}`);
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], audioLoading: false, statusText: 'Audio failed' }
      }));
    }
  };

  const handleGenerateVideo = async (sceneIndex: number, overrideImgUrl?: string) => {
    if (!script) return;
    const step = script.steps[sceneIndex];
    if (!step) return;

    const imgUrl = overrideImgUrl ?? sceneStates[sceneIndex]?.imgUrl;
    if (!imgUrl) {
      alert('Generate image first!');
      return;
    }

    setSceneStates(prev => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], vidLoading: true, statusText: 'Generating video (VEO3)...' }
    }));

    try {
      const vidUrl = await window.electronAPI.surviveGenerateVideo({
        sceneIndex,
        videoPrompt: step.videoPrompt,
        sourceImageUrl: imgUrl,
        narrationLine: step.line,
        videoModel,
        projectFolder
      });
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], vidUrl, vidLoading: false, statusText: 'Video ready' }
      }));
    } catch (err: any) {
      alert(`Video generation failed for step ${sceneIndex}: ${err.message}`);
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], vidLoading: false, statusText: 'Video failed' }
      }));
    }
  };

  const handleGenerateAll = async () => {
    if (!script) return;
    // Track ref URL locally to avoid stale closure across async loop iterations
    let localRefUrl: string | null = characterRefUrl;
    for (let i = 0; i < script.steps.length; i++) {
      let imgUrl = sceneStates[i]?.imgUrl;
      if (!imgUrl) {
        imgUrl = await handleGenerateImage(i, localRefUrl);
      }
      // Once scene 0 image is ready, store as character ref for all subsequent scenes
      if (i === 0 && imgUrl) {
        localRefUrl = imgUrl;
        setCharacterRefUrl(imgUrl);
      }
      if (!sceneStates[i]?.audioUrl) await handleGenerateAudio(i);
      await handleGenerateVideo(i, imgUrl);
    }
  };

  const handleCopyPrompt = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="survive-container">
      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      <aside className="survive-sidebar">
        <h2 className="survive-title">🆘 Survive — Extreme Survival Scenarios</h2>
        <p className="survive-subtitle">
          Learn life-saving survival techniques through cinematic AI-generated scenarios
        </p>

        <div className="survive-form-group">
          <label className="survive-label">Narration Language</label>
          <select
            className="survive-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="Russian">Russian (Русский)</option>
            <option value="English">English</option>
            <option value="German">German (Deutsch)</option>
            <option value="French">French (Français)</option>
          </select>
        </div>

        <div className="survive-form-group">
          <label className="survive-label">Image Model</label>
          <div className="survive-model-group">
            <label className={`survive-model-option ${imageModel === 'nano_banana_2' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="imageModel"
                value="nano_banana_2"
                checked={imageModel === 'nano_banana_2'}
                onChange={(e) => setImageModel(e.target.value as any)}
              />
              <div className="survive-model-label">
                <span className="survive-model-name">Nano Banana 2</span>
                <span className="survive-model-desc">Fast generation</span>
              </div>
            </label>

            <label className={`survive-model-option ${imageModel === 'nano_banana_pro' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="imageModel"
                value="nano_banana_pro"
                checked={imageModel === 'nano_banana_pro'}
                onChange={(e) => setImageModel(e.target.value as any)}
              />
              <div className="survive-model-label">
                <span className="survive-model-name">Nano Banana Pro</span>
                <span className="survive-model-desc">4K, Thinking model</span>
              </div>
            </label>
          </div>
        </div>

        <div className="survive-form-group">
          <label className="survive-label">Video Model</label>
          <div className="survive-model-group">
            {VIDEO_MODELS.map(model => (
              <label key={model.value} className={`survive-model-option ${videoModel === model.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="videoModel"
                  value={model.value}
                  checked={videoModel === model.value}
                  onChange={() => setVideoModel(model.value)}
                />
                <div className="survive-model-label">
                  <span className="survive-model-name">{model.label}</span>
                  <span className="survive-model-desc">{model.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <button
          className="survive-btn"
          onClick={handleGenerateIdeas}
          disabled={isLoadingIdeas}
        >
          {isLoadingIdeas ? '⏳ Generating...' : '🎲 Generate 5 Survival Scenarios'}
        </button>

        {/* ── Idea Cards ──────────────────────────────────────────────────── */}
        {ideas.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <label className="survive-label">Select Scenario</label>
            {ideas.map((idea) => (
              <button
                key={idea.id}
                className={`survive-idea-btn ${selectedIdea?.id === idea.id ? 'selected' : ''}`}
                onClick={() => handleSelectIdea(idea)}
              >
                <div className="survive-idea-category">{idea.category}</div>
                <div className="survive-idea-title">{idea.scenario}</div>
                <div className="survive-idea-hook">{idea.hook}</div>
                <div className="survive-idea-meta">
                  <span>📝 {idea.stepsCount} Steps</span>
                  <span className={`survive-idea-difficulty difficulty-${idea.difficulty}`}>
                    {idea.difficulty === 'низкая' ? '🟢 Easy' : idea.difficulty === 'средняя' ? '🟡 Medium' : '🔴 Hard'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────────── */}
      <main className="survive-main">
        {!script && !isLoadingScript && (
          <div className="survive-empty-state">
            <div className="survive-empty-icon">🆘</div>
            <p>Generate Survival Scenarios to start crafting life-saving content</p>
          </div>
        )}

        {isLoadingScript && (
          <div className="survive-loading">
            <div className="survive-spinner"></div>
            <p>Generating survival script with 6 steps...</p>
          </div>
        )}

        {script && (
          <>
            <div className="survive-script-header">
              <h3 className="survive-script-title">{script.title}</h3>
              <p className="survive-script-category">Category: {script.category}</p>
              <p className="survive-script-hook">{script.hook}</p>
              <button className="survive-generate-all-btn" onClick={handleGenerateAll}>
                ⚡ Generate All (Images + Audio + Videos)
              </button>
            </div>

            <div className="survive-scenes-grid">
              {script.steps.map((step, idx) => {
                const state = sceneStates[idx] || {};
                return (
                  <div key={step.id} className="survive-scene-card">
                    <div className="survive-scene-header">
                      <span className="survive-scene-icon">{STEP_ICONS[idx]}</span>
                      <h4 className="survive-scene-title">{STEP_LABELS[idx]}</h4>
                      <span className="survive-scene-number">{step.stepNumber}</span>
                    </div>

                    <div className="survive-scene-narration">
                      <strong>Narration:</strong>
                      <p>{step.line}</p>
                    </div>

                    <div className="survive-scene-actions">
                      <button
                        className="survive-scene-btn"
                        onClick={() => handleGenerateImage(idx)}
                        disabled={state.imgLoading}
                      >
                        {state.imgLoading ? '⏳ Image...' : state.imgUrl ? '✅ Image' : '🖼️ Generate Image'}
                      </button>
                      <button
                        className="survive-scene-btn"
                        onClick={() => handleGenerateAudio(idx)}
                        disabled={state.audioLoading}
                      >
                        {state.audioLoading ? '⏳ Audio...' : state.audioUrl ? '✅ Audio' : '🎤 Generate Audio'}
                      </button>
                      <button
                        className="survive-scene-btn"
                        onClick={() => handleGenerateVideo(idx)}
                        disabled={state.vidLoading || !state.imgUrl}
                      >
                        {state.vidLoading ? '⏳ Video...' : state.vidUrl ? '✅ Video' : '🎬 Generate Video'}
                      </button>
                    </div>

                    {state.statusText && (
                      <div className="survive-scene-status">{state.statusText}</div>
                    )}

                    {state.imgUrl && (
                      <div className="survive-scene-preview">
                        <img src={state.imgUrl} alt={`Step ${idx}`} />
                      </div>
                    )}

                    {state.audioUrl && (
                      <div className="survive-scene-audio">
                        <audio controls src={state.audioUrl} />
                      </div>
                    )}

                    {state.vidUrl && (
                      <div className="survive-scene-video">
                        <video controls src={state.vidUrl} />
                      </div>
                    )}

                    <details className="survive-scene-prompts">
                      <summary>📝 View Prompts</summary>
                      <div className="survive-prompt-block">
                        <strong>Image Prompt:</strong>
                        <button
                          className="survive-copy-btn"
                          onClick={() => handleCopyPrompt(step.imagePrompt, idx * 2)}
                        >
                          {copiedIdx === idx * 2 ? '✅ Copied' : '📋 Copy'}
                        </button>
                        <pre>{step.imagePrompt}</pre>
                      </div>
                      <div className="survive-prompt-block">
                        <strong>Video Prompt:</strong>
                        <button
                          className="survive-copy-btn"
                          onClick={() => handleCopyPrompt(step.videoPrompt, idx * 2 + 1)}
                        >
                          {copiedIdx === idx * 2 + 1 ? '✅ Copied' : '📋 Copy'}
                        </button>
                        <pre>{step.videoPrompt}</pre>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
