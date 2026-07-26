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
  line_ru?: string;
  imagePrompt: string;
  videoPrompt: string;
  videoPrompt2?: string;
};

type Script = {
  title: string;
  category: string;
  hook: string;
  characterPrompt?: string;
  steps: Step[];
};

type VideoModel = 'veo_31_lite' | 'veo_31_fast' | 'omni_flash' | 'meta' | 'grok';
type TtsService = 'voiceapi' | 'elevenlabs';
type AiTextModel = 'custom' | 'pollinations';

const VIDEO_MODELS: { value: VideoModel; label: string; desc: string }[] = [
  { value: 'veo_31_lite', label: 'Veo 3.1 Lite', desc: 'Balanced generation' },
  { value: 'veo_31_fast', label: 'Veo 3.1 Fast', desc: 'Fast generation' },
  { value: 'omni_flash', label: 'Omni Flash', desc: 'Omni Flash generation' },
  { value: 'meta', label: 'Meta AI (i2v)', desc: 'Meta image-to-video' },
  { value: 'grok', label: 'Grok Generation', desc: '10s 720p Video' },
];

const TTS_SERVICES: { value: TtsService; label: string; desc: string }[] = [
  { value: 'voiceapi', label: 'Lumean API', desc: 'Default — Lumean' },
  { value: 'elevenlabs', label: 'ElevenLabs', desc: 'Direct ElevenLabs API' },
];

const AI_TEXT_MODELS: { value: AiTextModel; label: string; desc: string }[] = [
  { value: 'custom', label: 'Custom Proxy', desc: 'Local Gemini proxy (CUSTOM_AI_URL)' },
  { value: 'pollinations', label: 'Pollinations', desc: 'Free fallback (openai-large)' },
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
  const [imageModel, setImageModel] = useState<'nano_banana_2' | 'nano_banana_pro' | 'grok'>('nano_banana_2');
  const [videoModel, setVideoModel] = useState<VideoModel>('veo_31_lite');
  const [ttsService, setTtsService] = useState<TtsService>('voiceapi');
  const [aiModel, setAiModel] = useState<AiTextModel>('custom');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneState>>({});
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [characterRefUrl, setCharacterRefUrl] = useState<string | null>(null);
  const [isGeneratingCharacter, setIsGeneratingCharacter] = useState(false);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

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

  const handleReset = () => {
    setIdeas([]);
    setSelectedIdea(null);
    setScript(null);
    setSceneStates({});
    setProjectFolder('');
    setCharacterRefUrl(null);
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
      
      // Automatically generate the main character reference once the script is ready
      if (scriptData.characterPrompt) {
        handleGenerateCharacter(scriptData.characterPrompt, folderName);
      }
    } catch (err: any) {
      alert('Failed to generate script: ' + err.message);
    } finally {
      setIsLoadingScript(false);
    }
  };

  const handleGenerateCharacter = async (prompt: string, folder: string) => {
    setIsGeneratingCharacter(true);
    setCharacterRefUrl(null);
    try {
      const imgUrl = await window.electronAPI.surviveGenerateImage({
        sceneIndex: -1, // -1 becomes scene_0.jpg
        imagePrompt: prompt,
        imageModel,
        projectFolder: folder,
        referenceImageUrl: undefined
      });
      setCharacterRefUrl(imgUrl);
    } catch (err: any) {
      alert('Failed to generate main character: ' + err.message);
    } finally {
      setIsGeneratingCharacter(false);
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
        referenceImageUrl: refUrl, // Use the main character ref for ALL scenes
        oldFileUrl: sceneStates[sceneIndex]?.imgUrl
      });
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], imgUrl, imgLoading: false, statusText: 'Image ready' }
      }));
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
        projectFolder,
        ttsService
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
        videoPrompt2: step.videoPrompt2,
        sourceImageUrl: imgUrl,
        narrationLine: step.line,
        videoModel,
        projectFolder,
        oldFileUrl: sceneStates[sceneIndex]?.vidUrl
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
    
    // Ensure character reference exists
    let localRefUrl: string | null = characterRefUrl;
    if (!localRefUrl && script.characterPrompt) {
      // If missing, generate it first before proceeding
      await handleGenerateCharacter(script.characterPrompt, projectFolder);
      // characterRefUrl state won't update in time for this function block, so we grab it indirectly
      // But ideally it was generated automatically. If it failed, we can't easily proceed.
      // We will assume the user has a characterRefUrl by now.
      if (!characterRefUrl) {
         alert("Main character is still generating or failed. Please wait.");
         return;
      }
      localRefUrl = characterRefUrl;
    }

    for (let i = 0; i < script.steps.length; i++) {
      let imgUrl = sceneStates[i]?.imgUrl;
      if (!imgUrl) {
        imgUrl = await handleGenerateImage(i, localRefUrl);
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
            {([
              { value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Fast Gen' },
              { value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: 'HQ 4K' },
              { value: 'grok', label: 'Grok Generation', desc: 'Grok Image Model' }
            ] as const).map(m => (
              <label key={m.value} className={`survive-model-option ${imageModel === m.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="imageModel"
                  value={m.value}
                  checked={imageModel === m.value}
                  onChange={(e) => setImageModel(e.target.value as any)}
                />
                <div className="survive-model-label">
                  <span className="survive-model-name">{m.label}</span>
                  <span className="survive-model-desc">{m.desc}</span>
                </div>
              </label>
            ))}
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

        <div className="survive-form-group">
          <label className="survive-label">Voice Service</label>
          <div className="survive-model-group">
            {TTS_SERVICES.map(svc => (
              <label key={svc.value} className={`survive-model-option ${ttsService === svc.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="ttsService"
                  value={svc.value}
                  checked={ttsService === svc.value}
                  onChange={() => setTtsService(svc.value)}
                />
                <div className="survive-model-label">
                  <span className="survive-model-name">{svc.label}</span>
                  <span className="survive-model-desc">{svc.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="survive-form-group">
          <label className="survive-label">AI Text Model</label>
          <div className="survive-model-group">
            {AI_TEXT_MODELS.map(m => (
              <label key={m.value} className={`survive-model-option ${aiModel === m.value ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="aiModel"
                  value={m.value}
                  checked={aiModel === m.value}
                  onChange={() => setAiModel(m.value)}
                />
                <div className="survive-model-label">
                  <span className="survive-model-name">{m.label}</span>
                  <span className="survive-model-desc">{m.desc}</span>
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
          {isLoadingIdeas ? '⏳ Generating...' : '🎲 Generate 3 Survival Scenarios'}
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
                {language !== 'Russian' && idea.translation_ru && (
                  <div className="survive-idea-translation" style={{ marginTop: '8px', padding: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', fontSize: '0.8rem', color: '#999', fontStyle: 'italic', borderLeft: '2px solid #555', textAlign: 'left' }}>
                    {idea.translation_ru}
                  </div>
                )}
                <div className="survive-idea-meta" style={{ marginTop: '10px' }}>
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
              
              {script.characterPrompt && (
                <div className="survive-character-ref-block">
                  <div className="survive-character-ref-content">
                    <h4>👤 Main Character Reference</h4>
                    <p className="survive-character-prompt">{script.characterPrompt}</p>
                    <button 
                      className="survive-generate-character-btn"
                      disabled={isGeneratingCharacter}
                      onClick={() => handleGenerateCharacter(script.characterPrompt!, projectFolder)}
                    >
                      {isGeneratingCharacter ? 'Generating Character...' : '🔄 Regenerate Character'}
                    </button>
                  </div>
                  <div className="survive-character-ref-image">
                    {isGeneratingCharacter ? (
                      <div className="survive-spinner"></div>
                    ) : characterRefUrl ? (
                      <img 
                        src={characterRefUrl} 
                        alt="Character Reference" 
                        onClick={() => setEnlargedImage(characterRefUrl)}
                        style={{ cursor: 'pointer' }}
                      />
                    ) : (
                      <div className="survive-character-placeholder">No character generated</div>
                    )}
                  </div>
                </div>
              )}

              <div className="survive-script-actions">
                <button className="survive-generate-all-btn" onClick={handleGenerateAll}>
                  ⚡ Generate All (Images + Audio + Videos)
                </button>
                <button className="survive-reset-btn" onClick={handleReset}>
                  🔄 Reset
                </button>
              </div>
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
                      {language !== 'Russian' && step.line_ru && (
                        <p style={{ marginTop: '6px', fontSize: '0.85rem', color: '#999', fontStyle: 'italic', borderLeft: '2px solid #555', paddingLeft: '8px' }}>
                          {step.line_ru}
                        </p>
                      )}
                    </div>

                    <div className="survive-scene-actions">
                      <button
                        className="survive-scene-btn"
                        onClick={() => handleGenerateImage(idx)}
                        disabled={state.imgLoading}
                      >
                        {state.imgLoading ? '⏳ Image...' : state.imgUrl ? '🔄 Regen Image' : '🖼️ Generate Image'}
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
                        {state.vidLoading ? '⏳ Video...' : state.vidUrl ? '🔄 Regen Video' : '🎬 Generate Video'}
                      </button>
                    </div>

                    {state.statusText && (
                      <div className="survive-scene-status">{state.statusText}</div>
                    )}

                    {state.imgUrl && (
                      <div className="survive-scene-preview">
                        <img 
                          src={state.imgUrl} 
                          alt={`Step ${idx}`} 
                          onClick={() => setEnlargedImage(state.imgUrl!)}
                          style={{ cursor: 'pointer' }}
                        />
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
                          onClick={() => handleCopyPrompt(step.videoPrompt + (step.videoPrompt2 ? `\n\nPart 2: ${step.videoPrompt2}` : ''), idx * 2 + 1)}
                        >
                          {copiedIdx === idx * 2 + 1 ? 'Copied!' : 'Copy Video Prompt'}
                        </button>
                        <div className="survive-prompts-content">
                          <p><strong>Video Prompt:</strong></p>
                          <pre>{step.videoPrompt}</pre>
                          {step.videoPrompt2 && (
                            <>
                              <p><strong>Video Prompt (Part 2):</strong></p>
                              <pre>{step.videoPrompt2}</pre>
                            </>
                          )}
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* ── IMAGE MODAL ────────────────────────────────────────────────────── */}
      {enlargedImage && (
        <div className="survive-image-modal" onClick={() => setEnlargedImage(null)}>
          <div className="survive-image-modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={enlargedImage} alt="Enlarged view" />
            <button className="survive-image-modal-close" onClick={() => setEnlargedImage(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
