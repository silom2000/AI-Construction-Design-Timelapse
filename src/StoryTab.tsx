import { useState, useEffect } from 'react';
import './StoryTab.css';

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
  title: string;
  hook: string;
  era?: string;
  character?: string;
};

type CharacterProfile = {
  faceShape: string;
  nose: string;
  lips: string;
  ears: string;
  eyes: string;
  hair: string;
  skinTone: string;
  distinguishingFeature: string;
};

type Scene = {
  id: number;
  stage?: string;
  line: string;
  imagePrompt: string;
  videoPrompt: string;
};

type Script = {
  title: string;
  characterProfile?: CharacterProfile;
  scenes: Scene[];
};

const LIFE_STAGE_ICONS: Record<number, string> = {
  1: '👶',
  2: '🧒',
  3: '🧑',
  4: '💪',
  5: '⚔️',
  6: '🏛️',
  7: '🧙',
  8: '👑',
};

const LIFE_STAGE_LABELS: Record<number, string> = {
  1: 'The Hook — Birth',
  2: 'Childhood',
  3: 'Youth',
  4: 'Young Adult',
  5: 'Prime',
  6: 'Maturity',
  7: 'Elder',
  8: 'Legacy',
};

export function StoryTab() {
  const [language, setLanguage] = useState('English');
  const [topic, setTopic] = useState('');
  const [imageModel, setImageModel] = useState<'imagen4' | 'nano_banana_2' | 'nano_banana_pro'>('imagen4');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoadingIdeas, setIsLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [sceneStates, setSceneStates] = useState<Record<number, SceneState>>({});
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    window.electronAPI.onStoryImageProgress((data: any) => {
      if (data.sceneIndex !== undefined) {
        setSceneStates(prev => ({
          ...prev,
          [data.sceneIndex]: { ...prev[data.sceneIndex], statusText: data.status }
        }));
      }
    });
    window.electronAPI.onStoryVideoProgress((data: any) => {
      if (data.sceneIndex !== undefined) {
        setSceneStates(prev => ({
          ...prev,
          [data.sceneIndex]: { ...prev[data.sceneIndex], statusText: data.status }
        }));
      }
    });
  }, []);

  const handleGenerateIdeas = async () => {
    setIsLoadingIdeas(true);
    try {
      const result = await window.electronAPI.storyGenerateIdeas(topic, language);
      setIdeas(result);
      setScript(null);
      setSelectedIdea(null);
    } catch (e) {
      console.error(e);
      alert("Failed to generate story ideas.");
    } finally {
      setIsLoadingIdeas(false);
    }
  };

  const handleSelectIdea = async (idea: Idea) => {
    setSelectedIdea(idea);
    setIsLoadingScript(true);
    try {
      // Create a project folder for this story
      const folder = await window.electronAPI.storyCreateFolder();
      setProjectFolder(folder);

      const result = await window.electronAPI.storyGenerateScript({ 
        idea: idea,
        language, 
        projectFolder: folder 
      });
      setScript(result);
      setSceneStates({});
    } catch (e) {
      console.error(e);
      alert("Failed to generate script.");
    } finally {
      setIsLoadingScript(false);
    }
  };

  const handleGenerateImage = async (sceneId: number, prompt: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: true, statusText: 'Starting image generation...' } }));
    try {
      const url = await window.electronAPI.storyGenerateImage({
        sceneIndex: sceneId,
        imagePrompt: prompt,
        imageModel: imageModel,
        projectFolder
      });
      const imgUrl = Array.isArray(url) ? url[0] : url;
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, imgUrl, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, statusText: 'Error generating image' } }));
    }
  };

  const handleRegenerateImage = async (sceneId: number, prompt: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgUrl: undefined, imgLoading: true, statusText: 'Regenerating image...' } }));
    try {
      const url = await window.electronAPI.storyGenerateImage({
        sceneIndex: sceneId,
        imagePrompt: prompt,
        imageModel: imageModel,
        projectFolder
      });
      const imgUrl = Array.isArray(url) ? url[0] : url;
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, imgUrl, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], imgLoading: false, statusText: 'Error regenerating image' } }));
    }
  };

  const handleGenerateAudio = async (sceneId: number, text: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: true, statusText: 'Synthesizing voice...' } }));
    try {
      const url = await window.electronAPI.storyGenerateAudio({
        sceneIndex: sceneId,
        text: text,
        language,
        projectFolder
      });
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: false, audioUrl: url, statusText: undefined } }));
    } catch (e) {
      console.error("Audio generation failed:", e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], audioLoading: false, statusText: 'Error generating audio' } }));
    }
  };

  const handleAssembleStory = async () => {
    // We will call assemble logic soon
    alert("Audio generated properly! Assembly feature coming in next step.");
  };

  const handleGenerateVideo = async (sceneId: number, prompt: string, narrationLine?: string) => {
    setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: true, statusText: 'Starting video generation...' } }));
    const state = sceneStates[sceneId];
    try {
      const url = await window.electronAPI.storyGenerateVideo({
        sceneIndex: sceneId,
        videoPrompt: prompt,
        sourceImageUrl: state?.imgUrl,
        narrationLine: narrationLine || '',
        projectFolder
      });
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, vidUrl: url, statusText: undefined } }));
    } catch (e) {
      console.error(e);
      setSceneStates(prev => ({ ...prev, [sceneId]: { ...prev[sceneId], vidLoading: false, statusText: 'Error generating video' } }));
    }
  };

  return (
    <div className="story-container">
      <div className="story-sidebar">
        <h2 className="story-title">
          🎬 Immersive Life Stories
        </h2>
        <p style={{ color: '#888', fontSize: '0.75rem', marginBottom: '16px', lineHeight: '1.4' }}>
          Live an entire life in 64 seconds — second-person historical storytelling with sensory immersion, cinematic visuals, and consistent voice narration
        </p>

        <div className="story-form-group">
          <label className="story-label">
            Target Language
          </label>
          <select
            className="story-input mb-4"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={{ marginBottom: '16px' }}
          >
            <option value="English">English</option>
            <option value="Russian">Russian</option>
            <option value="French">French</option>
            <option value="German">German</option>
            <option value="Spanish">Spanish</option>
          </select>

          <div style={{ marginBottom: '16px' }}>
            <label className="story-label" style={{ marginBottom: '6px' }}>
              Image Generation Model:
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {([
                { value: 'imagen4', label: 'Imagen 4', desc: 'Google, High quality' },
                { value: 'nano_banana_2', label: 'Nano Banana 2', desc: 'Improved generation' },
                { value: 'nano_banana_pro', label: 'Nano Banana Pro', desc: '4K, Thinking model' },
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

          <label className="story-label">
            Era / Setting (Optional)
          </label>
          <textarea
            className="story-input"
            placeholder="e.g. Ancient Rome, Viking Age, Samurai Japan, Cyberpunk 2089, Wild West, Renaissance Italy..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            style={{ height: '80px', resize: 'none', marginBottom: '16px' }}
          />

          <button
            onClick={handleGenerateIdeas}
            disabled={isLoadingIdeas}
            className="story-btn"
          >
            {isLoadingIdeas ? '⏳ Crafting Immersive Stories...' : '🎬 Generate 5 Life Journey Ideas'}
          </button>
        </div>

        {ideas.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <label className="story-label" style={{ marginBottom: '8px' }}>
              Choose Your Epic
            </label>
            {ideas.map((idea, idx) => (
              <div
                key={idx}
                onClick={() => handleSelectIdea(idea)}
                className={`story-idea-btn ${selectedIdea === idea ? 'selected' : ''}`}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
                  <h4 className="story-idea-title" style={{ margin: 0, flex: 1 }}>{idea.title}</h4>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const text = [
                        idea.title,
                        idea.era ? `⏳ ${idea.era}` : '',
                        idea.character ? `🎭 ${idea.character}` : '',
                        idea.hook,
                      ].filter(Boolean).join('\n');
                      navigator.clipboard.writeText(text).then(() => {
                        setCopiedIdx(idx);
                        setTimeout(() => setCopiedIdx(null), 2000);
                      });
                    }}
                    style={{
                      flexShrink: 0,
                      background: copiedIdx === idx ? '#1a4a1a' : '#2a2a2a',
                      border: copiedIdx === idx ? '1px solid #4ade80' : '1px solid #555',
                      borderRadius: '4px',
                      color: copiedIdx === idx ? '#4ade80' : '#aaa',
                      fontSize: '0.65rem',
                      padding: '2px 7px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.2s',
                    }}
                  >
                    {copiedIdx === idx ? '✓ Copied' : '📋 Copy'}
                  </button>
                </div>
                {idea.era && (
                  <span style={{ fontSize: '0.65rem', color: '#007acc', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    ⏳ {idea.era}
                  </span>
                )}
                {idea.character && (
                  <p style={{ fontSize: '0.7rem', color: '#aaa', margin: '4px 0 0' }}>
                    🎭 {idea.character}
                  </p>
                )}
                <p className="story-idea-hook">
                  {idea.hook}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="story-content">
        {isLoadingScript && (
          <div className="story-loading">
            ⏳ Writing your immersive life story...
          </div>
        )}

        {!isLoadingScript && script && (
          <div className="story-script-container">
             <h3 className="story-script-title">
                {script.title}
                {projectFolder && <span style={{fontSize: '0.7rem', color: '#666', marginLeft: '12px', fontWeight: 'normal'}}>📁 {projectFolder}</span>}
             </h3>

             {/* Character Profile Card */}
             {script.characterProfile && (
               <div style={{
                 background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
                 border: '1px solid #007acc',
                 borderRadius: '10px',
                 padding: '16px',
                 marginBottom: '20px',
               }}>
                 <h4 style={{ color: '#007acc', margin: '0 0 10px', fontSize: '0.85rem', letterSpacing: '1px', textTransform: 'uppercase' }}>
                   🎭 Character Consistency Profile
                 </h4>
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.75rem' }}>
                   <div><span style={{ color: '#888' }}>Face:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.faceShape}</span></div>
                   <div><span style={{ color: '#888' }}>Nose:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.nose}</span></div>
                   <div><span style={{ color: '#888' }}>Lips:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.lips}</span></div>
                   <div><span style={{ color: '#888' }}>Ears:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.ears}</span></div>
                   <div><span style={{ color: '#888' }}>Eyes:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.eyes}</span></div>
                   <div><span style={{ color: '#888' }}>Hair:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.hair}</span></div>
                   <div><span style={{ color: '#888' }}>Skin:</span> <span style={{ color: '#ddd' }}>{script.characterProfile.skinTone}</span></div>
                   <div><span style={{ color: '#888' }}>Mark:</span> <span style={{ color: '#f0c040' }}>{script.characterProfile.distinguishingFeature}</span></div>
                 </div>
               </div>
             )}

             <div>
                {script.scenes.map((scene) => (
                  <div key={scene.id} className="story-scene">
                     <div className="story-scene-header">
                        <span className="story-scene-badge">
                          {LIFE_STAGE_ICONS[scene.id] || '🎬'} Scene {scene.id}: {scene.stage || LIFE_STAGE_LABELS[scene.id] || `Stage ${scene.id}`}
                        </span>
                     </div>
                     
                     <p className="story-scene-line">
                       "{scene.line}"
                     </p>

                     <div className="story-prompts-grid">
                        <div>
                          <span className="story-prompt-title-img">🖼️ Image Prompt:</span>
                          <p className="story-prompt-text">{scene.imagePrompt}</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button 
                              onClick={() => handleGenerateImage(scene.id, scene.imagePrompt)}
                              disabled={sceneStates[scene.id]?.imgLoading}
                              className="story-media-btn"
                            >
                              {sceneStates[scene.id]?.imgLoading && !sceneStates[scene.id]?.imgUrl ? '⏳ Generating...' : '🖼️ Generate Image'}
                            </button>
                            {sceneStates[scene.id]?.imgUrl && (
                              <button 
                                onClick={() => handleRegenerateImage(scene.id, scene.imagePrompt)}
                                disabled={sceneStates[scene.id]?.imgLoading}
                                className="story-media-btn"
                                style={{ backgroundColor: '#4a3500', color: '#f0c040' }}
                              >
                                {sceneStates[scene.id]?.imgLoading ? '⏳ Regenerating...' : '🔄 Regenerate'}
                              </button>
                            )}
                          </div>
                          {sceneStates[scene.id]?.imgUrl && (
                            <img 
                              src={sceneStates[scene.id]?.imgUrl as string} 
                              className="story-media-preview" 
                              alt="Scene preview" 
                            />
                          )}
                        </div>
                        <div>
                          <span className="story-prompt-title-vid">🎥 Video Prompt:</span>
                          <p className="story-prompt-text">{scene.videoPrompt}</p>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                            <button 
                              onClick={() => handleGenerateVideo(scene.id, scene.videoPrompt, scene.line)}
                              disabled={sceneStates[scene.id]?.vidLoading || !sceneStates[scene.id]?.imgUrl}
                              className="story-media-btn"
                              title={!sceneStates[scene.id]?.imgUrl ? "Generate an image first" : ""}
                            >
                              {sceneStates[scene.id]?.vidLoading ? '⏳ Generating...' : '🎥 Generate Video (I2V)'}
                            </button>

                            <button 
                              onClick={() => handleGenerateAudio(scene.id, scene.line)}
                              disabled={sceneStates[scene.id]?.audioLoading}
                              className="story-media-btn"
                              style={{ backgroundColor: '#2b5029', border: '1px solid #4ade80' }}
                            >
                              {sceneStates[scene.id]?.audioLoading ? '⏳ Voicing...' : '🔊 Generate Voice'}
                            </button>
                          </div>
                          
                          {sceneStates[scene.id]?.vidUrl && (
                            <div style={{ marginBottom: '10px' }}>
                              <video src={sceneStates[scene.id]?.vidUrl as string} className="story-media-preview" controls />
                            </div>
                          )}

                          {sceneStates[scene.id]?.audioUrl && (
                            <audio src={sceneStates[scene.id]?.audioUrl as string} controls style={{ width: '100%', outline: 'none' }} />
                          )}
                        </div>
                     </div>
                     {sceneStates[scene.id]?.statusText && (
                       <div style={{color: '#8b8c89', fontSize: '0.8rem', marginTop: '10px'}}>
                         Status: {sceneStates[scene.id]?.statusText}
                       </div>
                     )}
                  </div>
                ))}
             </div>
          </div>
        )}

        {!isLoadingScript && !script && !isLoadingIdeas && (
          <div className="story-empty">
            🎬 Generate Life Journey ideas to begin crafting your epic story.
          </div>
        )}
      </div>
    </div>
  );
}