import { useState, useEffect } from 'react';
import './StoryTab.css'; // Reuse Story styles

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
  const [imageModel, setImageModel] = useState<'imagen4' | 'nano_banana_2' | 'nano_banana_pro'>('imagen4');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneState>>({});
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const handleGenerateIdeas = async () => {
    setIsLoadingIdeas(true);
    setIdeas([]);
    setSelectedIdea(null);
    setScript(null);
    setSceneStates({});
    setProjectFolder('');
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

  const handleGenerateImage = async (sceneIndex: number) => {
    if (!script) return;
    const step = script.steps[sceneIndex];
    if (!step) return;

    setSceneStates(prev => ({
      ...prev,
      [sceneIndex]: { ...prev[sceneIndex], imgLoading: true, statusText: 'Generating image...' }
    }));

    try {
      const imgUrl = await window.electronAPI.surviveGenerateImage({
        sceneIndex,
        imagePrompt: step.imagePrompt,
        imageModel,
        projectFolder
      });
      setSceneStates(prev => ({
        ...prev,
        [sceneIndex]: { ...prev[sceneIndex], imgUrl, imgLoading: false, statusText: 'Image ready' }
      }));
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

  const handleGenerateVideo = async (sceneIndex: number) => {
    if (!script) return;
    const step = script.steps[sceneIndex];
    if (!step) return;

    const state = sceneStates[sceneIndex];
    if (!state?.imgUrl) {
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
        sourceImageUrl: state.imgUrl,
        narrationLine: step.line,
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
    for (let i = 0; i < script.steps.length; i++) {
      const state = sceneStates[i];
      if (!state?.imgUrl) await handleGenerateImage(i);
      if (!state?.audioUrl) await handleGenerateAudio(i);
      if (!state?.vidUrl) await handleGenerateVideo(i);
    }
  };

  const handleCopyPrompt = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <div className="story-tab">
      <div className="story-header">
        <h2>🆘 Survive — Extreme Survival Scenarios</h2>
        <p className="story-subtitle">
          Learn life-saving survival techniques through cinematic AI-generated scenarios
        </p>
      </div>

      <div className="story-controls">
        <div className="story-control-group">
          <label>Language:</label>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="Russian">Russian (Русский)</option>
            <option value="English">English</option>
            <option value="German">German (Deutsch)</option>
            <option value="French">French (Français)</option>
          </select>
        </div>

        <div className="story-control-group">
          <label>Image Model:</label>
          <select value={imageModel} onChange={(e) => setImageModel(e.target.value as any)}>
            <option value="imagen4">Imagen 4 (Best Quality)</option>
            <option value="nano_banana_2">Nano Banana 2 (Fast)</option>
            <option value="nano_banana_pro">Nano Banana Pro (Balanced)</option>
          </select>
        </div>

        <button
          className="story-btn story-btn-primary"
          onClick={handleGenerateIdeas}
          disabled={isLoadingIdeas}
        >
          {isLoadingIdeas ? '⏳ Generating Ideas...' : '🎲 Generate 5 Survival Scenarios'}
        </button>
      </div>

      {ideas.length > 0 && (
        <div className="story-ideas-section">
          <h3>📋 Select a Survival Scenario:</h3>
          <div className="story-ideas-grid">
            {ideas.map((idea) => (
              <div
                key={idea.id}
                className={`story-idea-card ${selectedIdea?.id === idea.id ? 'selected' : ''}`}
                onClick={() => handleSelectIdea(idea)}
              >
                <div className="story-idea-category">{idea.category}</div>
                <h4>{idea.scenario}</h4>
                <p className="story-idea-hook">{idea.hook}</p>
                <p className="story-idea-description">{idea.description}</p>
                <div className="story-idea-meta">
                  <span className="story-idea-steps">📝 {idea.stepsCount} Steps</span>
                  <span className={`story-idea-difficulty difficulty-${idea.difficulty}`}>
                    {idea.difficulty === 'низкая' ? '🟢 Easy' : idea.difficulty === 'средняя' ? '🟡 Medium' : '🔴 Hard'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoadingScript && (
        <div className="story-loading">
          <div className="story-spinner"></div>
          <p>Generating survival script with 6 steps...</p>
        </div>
      )}

      {script && (
        <div className="story-script-section">
          <div className="story-script-header">
            <h3>📖 {script.title}</h3>
            <p className="story-script-category">Category: {script.category}</p>
            <p className="story-script-hook">{script.hook}</p>
            <button className="story-btn story-btn-success" onClick={handleGenerateAll}>
              ⚡ Generate All (Images + Audio + Videos)
            </button>
          </div>

          <div className="story-scenes-grid">
            {script.steps.map((step, idx) => {
              const state = sceneStates[idx] || {};
              return (
                <div key={step.id} className="story-scene-card">
                  <div className="story-scene-header">
                    <span className="story-scene-icon">{STEP_ICONS[idx]}</span>
                    <h4>{STEP_LABELS[idx]}</h4>
                    <span className="story-scene-number">{step.stepNumber}</span>
                  </div>

                  <div className="story-scene-narration">
                    <strong>Narration:</strong>
                    <p>{step.line}</p>
                  </div>

                  <div className="story-scene-actions">
                    <button
                      className="story-btn story-btn-small"
                      onClick={() => handleGenerateImage(idx)}
                      disabled={state.imgLoading}
                    >
                      {state.imgLoading ? '⏳ Image...' : state.imgUrl ? '✅ Image' : '🖼️ Generate Image'}
                    </button>
                    <button
                      className="story-btn story-btn-small"
                      onClick={() => handleGenerateAudio(idx)}
                      disabled={state.audioLoading}
                    >
                      {state.audioLoading ? '⏳ Audio...' : state.audioUrl ? '✅ Audio' : '🎤 Generate Audio'}
                    </button>
                    <button
                      className="story-btn story-btn-small"
                      onClick={() => handleGenerateVideo(idx)}
                      disabled={state.vidLoading || !state.imgUrl}
                    >
                      {state.vidLoading ? '⏳ Video...' : state.vidUrl ? '✅ Video' : '🎬 Generate Video'}
                    </button>
                  </div>

                  {state.statusText && (
                    <div className="story-scene-status">{state.statusText}</div>
                  )}

                  {state.imgUrl && (
                    <div className="story-scene-preview">
                      <img src={state.imgUrl} alt={`Step ${idx}`} />
                    </div>
                  )}

                  {state.audioUrl && (
                    <div className="story-scene-audio">
                      <audio controls src={state.audioUrl} />
                    </div>
                  )}

                  {state.vidUrl && (
                    <div className="story-scene-video">
                      <video controls src={state.vidUrl} />
                    </div>
                  )}

                  <details className="story-scene-prompts">
                    <summary>📝 View Prompts</summary>
                    <div className="story-prompt-block">
                      <strong>Image Prompt:</strong>
                      <button
                        className="story-copy-btn"
                        onClick={() => handleCopyPrompt(step.imagePrompt, idx * 2)}
                      >
                        {copiedIdx === idx * 2 ? '✅ Copied' : '📋 Copy'}
                      </button>
                      <pre>{step.imagePrompt}</pre>
                    </div>
                    <div className="story-prompt-block">
                      <strong>Video Prompt:</strong>
                      <button
                        className="story-copy-btn"
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
        </div>
      )}
    </div>
  );
}
