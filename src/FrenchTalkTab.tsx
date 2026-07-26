import React, { useState, useEffect } from 'react';

const LLM_PROVIDERS = [
  { value: 'pollinations', label: 'Pollinations (Free)' },
  { value: 'custom', label: 'Custom Proxy (Local)' },
];

const MARKETS = [
  { id: 'fr', flag: '🇫🇷', label: 'Français (France)', language: 'French', country: 'France' },
  { id: 'en-us', flag: '🇺🇸', label: 'English (USA)', language: 'English', country: 'United States' },
  { id: 'en-gb', flag: '🇬🇧', label: 'English (UK)', language: 'English', country: 'United Kingdom' },
  { id: 'de', flag: '🇩🇪', label: 'Deutsch', language: 'German', country: 'Germany' },
];

const VIDEO_MODELS = [
  { value: 'omni_flash', label: 'Omni Flash' },
  { value: 'veo_31_lite', label: 'Veo 3.1 Lite' },
  { value: 'grok', label: 'Grok 720p' },
];

const IMAGE_MODELS = [
  { value: 'nano_banana_2', label: 'Nano Banana 2' },
  { value: 'nano_banana_pro', label: 'Nano Banana Pro' },
  { value: 'grok', label: 'Grok Generation' },
];

type SegmentRole = 'blogger' | 'stranger' | 'aside' | 'outro';

type SegmentState = {
  index: number;
  role: SegmentRole;
  speakerLabel: string;
  text: string;
  translationRu?: string;
  words: number;
  status: 'idle' | 'generating' | 'done' | 'error';
  videoBase64?: string;
  videoPath?: string;
  errorMsg?: string;
};

const ROLE_COLORS: Record<SegmentRole, string> = {
  blogger: '#007acc',
  stranger: '#5a8f5a',
  aside: '#c0722a',
  outro: '#e91e63',
};

const ROLE_LABELS: Record<SegmentRole, string> = {
  blogger: '🎤 Blogger',
  stranger: '🗣 Stranger',
  aside: '💬 Aside',
  outro: '🎬 Outro',
};

const FrenchTalkTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'blogger' | 'episode'>('blogger');
  const [llmProvider, setLlmProvider] = useState('pollinations');
  const [imageModel, setImageModel] = useState<'nano_banana_2' | 'nano_banana_pro' | 'grok'>('nano_banana_2');
  const [videoModel, setVideoModel] = useState<'omni_flash' | 'veo_31_lite' | 'grok'>('omni_flash');

  // Blogger state
  const [blogger, setBlogger] = useState<any>(null);
  const [bloggerPrompt, setBloggerPrompt] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<any>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ imagePath: string; base64: string } | null>(null);

  // Episode state
  const [bloggerOutfit, setBloggerOutfit] = useState('');
  const [location, setLocation] = useState('Paris street, busy urban area');
  const [strangerType, setStrangerType] = useState('a random adult person on the street');
  const [strangerDescription, setStrangerDescription] = useState('');
  const [strangerVoiceDescription, setStrangerVoiceDescription] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9'>('9:16');
  const [script, setScript] = useState('');
  const [status, setStatus] = useState('');

  // Auto-Topic
  const [selectedMarket, setSelectedMarket] = useState('fr');
  const [isAutoTopic, setIsAutoTopic] = useState(false);
  const [autoTopicResult, setAutoTopicResult] = useState<{ topic: string; topicEn: string; topicRu?: string; hook: string; hookRu?: string; question?: string } | null>(null);
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  const [topicMode, setTopicMode] = useState<'trending' | 'custom_topic' | 'custom_text' | 'video_analysis'>('trending');
  const [customInput, setCustomInput] = useState('');
  const [videoBase64, setVideoBase64] = useState('');
  const [selectedVideoName, setSelectedVideoName] = useState('');
  const [fullVersion, setFullVersion] = useState(false);
  const [seoKeywords, setSeoKeywords] = useState<{ original: string; ru: string }[]>([]);
  const [selectedKeyword, setSelectedKeyword] = useState('');

  // Segments
  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [isGeneratingStranger, setIsGeneratingStranger] = useState(false);
  const [generatedStrangerHint, setGeneratedStrangerHint] = useState('');
  const [generatedStrangerPreview, setGeneratedStrangerPreview] = useState<string | null>(null);
  const [strangerRefBase64, setStrangerRefBase64] = useState<string | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const stopAutoRef = React.useRef(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  // Script stats
  const scriptWords = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedDuration = Math.round(scriptWords / 2.5);
  const isTooShort = estimatedDuration < 30;

  const scriptLineStats = script.split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => {
      const match = l.match(/^([^:]+):\s*(.*)$/);
      if (!match) return null;
      const words = match[2].trim().split(/\s+/).length;
      return { line: l, words, tooLong: words > 20 };
    })
    .filter(Boolean);
  const hasOverlongLines = scriptLineStats.some(s => s && s.tooLong);

  useEffect(() => {
    loadBlogger();
    window.electronAPI.onFrenchTalkProgress((data: { status: string; progress?: number }) => {
      if (data.status) setStatus(data.status);
    });
    return () => { window.electronAPI.removeFrenchTalkProgressListener(); };
  }, []);

  // Parse script → segments
  React.useEffect(() => {
    if (!script || !blogger) { setSegments([]); return; }
    const bloggerName = blogger.name;

    const parsed: SegmentState[] = [];
    script.split('\n').filter(l => l.trim()).forEach(line => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const speaker = match[1].trim();
      const text = match[2].trim();

      let role: SegmentRole = 'stranger';
      let speakerLabel = speaker;

      if (speaker.toLowerCase() === bloggerName.toLowerCase()) {
        role = 'blogger';
        speakerLabel = bloggerName;
      } else if (speaker.toLowerCase() === 'aside') {
        role = 'aside';
        speakerLabel = `${bloggerName} (aside)`;
      } else if (speaker.toLowerCase() === 'outro') {
        role = 'outro';
        speakerLabel = `${bloggerName} (outro)`;
      } else if (speaker.toLowerCase() === 'stranger') {
        role = 'stranger';
        speakerLabel = strangerType || 'Stranger';
      }

      const existing = segments.find(s => s.index === parsed.length && s.text === text);
      parsed.push({
        index: parsed.length,
        role,
        speakerLabel,
        text,
        translationRu: translationsMap[text] || existing?.translationRu,
        words: text.split(/\s+/).length,
        status: existing?.status ?? 'idle',
        videoBase64: existing?.videoBase64,
        videoPath: existing?.videoPath,
      });
    });
    setSegments(parsed);
  }, [script, blogger, strangerType, translationsMap]);

  // Debounced pre-save
  React.useEffect(() => {
    if (!script || !blogger || !episodeTitle || segments.length === 0) return;
    const timer = setTimeout(async () => {
      try {
        await window.electronAPI.frenchtalkSaveAllPrompts({
          bloggerName: blogger.name,
          bloggerOutfit,
          location,
          episodeTitle,
          aspectRatio,
          segments: segments.map(s => ({ index: s.index, role: s.role, speakerLabel: s.speakerLabel, text: s.text }))
        });
      } catch (err) {
        console.error('[FrenchTalk] Error pre-saving prompts:', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [segments, episodeTitle, location, bloggerOutfit, aspectRatio, blogger]);

  // Auto-reset stranger reference when episode title changes — new episode = new character
  const prevEpisodeTitleRef = React.useRef('');
  React.useEffect(() => {
    const prev = prevEpisodeTitleRef.current;
    if (episodeTitle && prev && episodeTitle !== prev) {
      setStrangerDescription('');
      setStrangerVoiceDescription('');
      setGeneratedStrangerHint('');
      setGeneratedStrangerPreview(null);
      setStrangerRefBase64(null);
      window.electronAPI.frenchtalkResetStrangerRef({ episodeTitle: prev }).catch(() => {});
    }
    prevEpisodeTitleRef.current = episodeTitle;
  }, [episodeTitle]);

  const handleGenerateStranger = async () => {
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    setIsGeneratingStranger(true);
    try {
      const result = await window.electronAPI.frenchtalkGenerateStranger({ language: market.language });
      setStrangerDescription(result.description);
      setStrangerVoiceDescription(result.voice);
      setGeneratedStrangerHint(result.nameHint);
      setStrangerType(`A ${result.gender} stranger on the street: ${result.nameHint}`);

      // Generate portrait image from the description
      try {
        const visualPrompt = `A photorealistic portrait of ${result.description}, surprised/thoughtful expression, Paris street background blurred, natural lighting, 9:16 portrait, cinematic 4K.`;
        const img = await window.electronAPI.frenchtalkGenerateBaseImage({ visualPrompt, model: imageModel });
        setGeneratedStrangerPreview(img.base64);
        setStrangerRefBase64(img.base64);
      } catch (imgErr: any) {
        console.warn('[FrenchTalk] Stranger portrait generation failed:', imgErr.message);
      }
    } catch (e: any) {
      alert('Ошибка генерации персонажа: ' + e.message);
    } finally {
      setIsGeneratingStranger(false);
    }
  };

  const loadBlogger = async () => {
    try {
      const b = await window.electronAPI.frenchtalkGetBlogger();
      setBlogger(b);
    } catch (e) { console.error(e); }
  };

  const handleGenerateIdea = async () => {
    if (!bloggerPrompt) return;
    setIsGeneratingIdea(true);
    try {
      const idea = await window.electronAPI.frenchtalkGenerateBloggerIdea({ promptText: bloggerPrompt, provider: llmProvider });
      setGeneratedIdea(idea);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!generatedIdea) return;
    setIsGeneratingImage(true);
    try {
      const img = await window.electronAPI.frenchtalkGenerateBaseImage({ visualPrompt: generatedIdea.visualPrompt, model: imageModel });
      setGeneratedImage(img);
    } catch (e: any) {
      alert('Error generating image: ' + e.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveBlogger = async () => {
    if (!generatedIdea || !generatedImage) return;
    try {
      const saved = await window.electronAPI.frenchtalkSaveBlogger({ ...generatedIdea, imagePath: generatedImage.imagePath });
      setBlogger({ ...saved, base64: generatedImage.base64 });
      setGeneratedIdea(null);
      setGeneratedImage(null);
      setBloggerPrompt('');
      alert('Blogger saved!');
    } catch (e: any) {
      alert('Error saving: ' + e.message);
    }
  };

  const handleDeleteBlogger = async () => {
    if (confirm('Delete the blogger character?')) {
      await window.electronAPI.frenchtalkDeleteBlogger();
      setBlogger(null);
    }
  };

  const handleFetchSeoKeywords = async () => {
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    setIsAutoTopic(true);
    setStatus(`🔎 Ищу вирусные темы для стрит-интервью в ${market.country}...`);
    try {
      const keywords = await window.electronAPI.frenchtalkGetSeoKeywords({ country: market.country, language: market.language });
      setSeoKeywords(keywords);
      if (keywords.length > 0) setSelectedKeyword(keywords[0].original);
    } catch (e: any) {
      alert('Ошибка: ' + e.message);
    } finally {
      setIsAutoTopic(false);
      setStatus('');
    }
  };

  const handleAutoTopic = async () => {
    if (!blogger) { alert('Сначала создайте персонаж блогера!'); return; }
    if (topicMode === 'video_analysis' && !videoBase64) { alert('Выберите файл видео для анализа!'); return; }
    if (topicMode === 'trending' && !selectedKeyword) { alert('Найдите и выберите тему!'); return; }
    if ((topicMode === 'custom_topic' || topicMode === 'custom_text') && !customInput.trim()) { alert('Введите тему или текст!'); return; }

    const market = MARKETS.find(m => m.id === selectedMarket)!;
    setIsAutoTopic(true);
    setAutoTopicResult(null);
    setStatus('⚙️ Генерирую сценарий стрит-интервью...');

    try {
      let result;
      if (topicMode === 'video_analysis') {
        result = await window.electronAPI.frenchtalkAnalyzeVideo({
          videoBase64,
          language: market.language,
          bloggerName: blogger.name,
          strangerType,
          shortVersion: !fullVersion
        });
      } else {
        const effectiveMode = topicMode === 'trending' ? 'custom_topic' : topicMode;
        const effectiveInput = topicMode === 'trending' ? selectedKeyword : customInput;
        result = await window.electronAPI.frenchtalkAutoTopic({
          language: market.language,
          country: market.country,
          bloggerName: blogger.name,
          strangerType,
          mode: effectiveMode,
          customInput: effectiveInput,
          shortVersion: !fullVersion
        });
      }

      setScript(result.script);
      setEpisodeTitle('FT_' + result.topicEn.replace(/[^a-z0-9]/gi, '_').substring(0, 30));
      setAutoTopicResult({ topic: result.topic, topicEn: result.topicEn, topicRu: result.topicRu, hook: result.hook, hookRu: result.hookRu, question: result.question });

      if (result.scriptRu) {
        const origLines = result.script.split('\n').filter((l: string) => l.trim());
        const transLines = result.scriptRu.split('\n').filter((l: string) => l.trim());
        const newMap: Record<string, string> = {};
        origLines.forEach((line: string, idx: number) => {
          const origM = line.match(/^([^:]+):\s*(.*)$/);
          if (!origM) return;
          const transLine = transLines[idx];
          if (transLine) {
            const transM = transLine.match(/^([^:]+):\s*(.*)$/);
            newMap[origM[2].trim()] = transM ? transM[2].trim() : transLine.replace(/^[^:]+:\s*/, '').trim();
          }
        });
        setTranslationsMap(newMap);
      }

      setStatus('');
    } catch (e: any) {
      alert('Ошибка Auto Topic: ' + e.message);
      setStatus('');
    } finally {
      setIsAutoTopic(false);
    }
  };

  const updateSegment = (index: number, updates: Partial<SegmentState>) => {
    setSegments(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s));
  };

  const handleGenerateSegment = async (seg: SegmentState) => {
    if (!blogger || !episodeTitle) { alert('Заполните Episode Title и создайте блогера!'); return; }
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    updateSegment(seg.index, { status: 'generating', errorMsg: undefined });
    try {
      const result = await window.electronAPI.frenchtalkGenerateSegment({
        segmentIndex: seg.index,
        role: seg.role,
        dialogueText: seg.text,
        speakerLabel: seg.speakerLabel,
        bloggerOutfit,
        location,
        episodeTitle,
        aspectRatio,
        language: market.language,
        videoModel,
        strangerDescription,
        strangerVoiceDescription,
        strangerRefBase64: strangerRefBase64 || undefined
      });
      updateSegment(seg.index, { status: 'done', videoBase64: result.videoBase64, videoPath: result.videoPath });
    } catch (e: any) {
      updateSegment(seg.index, { status: 'error', errorMsg: e.message });
    }
  };

  const handleAutoGenerateAll = async () => {
    if (!blogger || !episodeTitle) { alert('Заполните Episode Title и создайте блогера!'); return; }
    stopAutoRef.current = false;
    setIsAutoRunning(true);
    for (const seg of segments) {
      if (stopAutoRef.current) break;
      if (seg.status === 'done') continue;
      await handleGenerateSegment(seg);
      await new Promise(r => setTimeout(r, 300));
    }
    setIsAutoRunning(false);
  };

  const renderBloggerTab = () => (
    <div style={{ display: 'flex', gap: '20px', padding: '20px', height: '100%', overflowY: 'auto' }}>

      {/* Creation Panel */}
      <div style={{ flex: 1, backgroundColor: '#1a1a2e', padding: '20px', borderRadius: '12px', minWidth: '380px', border: '1px solid #2a2a4a' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#e8c4a0', fontSize: '16px' }}>
          🎀 Создать персонаж блогера
        </h3>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>LLM Provider</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {LLM_PROVIDERS.map(p => (
              <button key={p.value} onClick={() => setLlmProvider(p.value)} style={{
                padding: '5px 12px', backgroundColor: llmProvider === p.value ? '#7c4dff' : '#252545',
                color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '6px' }}>Image Model</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {IMAGE_MODELS.map(p => (
              <button key={p.value} onClick={() => setImageModel(p.value as any)} style={{
                padding: '5px 12px', backgroundColor: imageModel === p.value ? '#7c4dff' : '#252545',
                color: '#fff', border: '1px solid #444', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: '10px', padding: '10px', backgroundColor: '#252535', borderRadius: '8px', border: '1px solid #3a3a5a' }}>
          <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>ℹ️ Голос блогера всегда один и тот же</div>
          <div style={{ fontSize: '12px', color: '#e8c4a0', fontStyle: 'italic' }}>
            "young French woman, bright cheerful energetic voice, slightly cheeky and playful tone"
          </div>
        </div>

        <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>
          Опиши блогера (внешность, стиль, характер). AI создаст профиль и визуальный промпт.
        </p>
        <textarea
          value={bloggerPrompt}
          onChange={e => setBloggerPrompt(e.target.value)}
          placeholder="Например: Молодая красивая девушка 23 лет, тёмные волосы, яркие глаза, стиль casual chic, дерзкая улыбка..."
          style={{ width: '100%', height: '80px', marginBottom: '10px', backgroundColor: '#252545', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '6px', resize: 'vertical', fontSize: '13px', boxSizing: 'border-box' }}
        />
        <button onClick={handleGenerateIdea} disabled={isGeneratingIdea || !bloggerPrompt} style={{
          padding: '9px 18px', backgroundColor: isGeneratingIdea ? '#444' : '#7c4dff',
          color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px'
        }}>
          {isGeneratingIdea ? '⏳ Генерирую профиль...' : '1. Создать профиль AI'}
        </button>

        {generatedIdea && (
          <div style={{ marginTop: '16px', padding: '14px', backgroundColor: '#252545', borderRadius: '8px', border: '1px solid #5a4dcc' }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#e8c4a0' }}>{generatedIdea.name}</h4>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '4px' }}>
              <strong style={{ color: '#ccc' }}>Личность:</strong> {generatedIdea.personality}
            </div>
            <div style={{ fontSize: '11px', color: '#777', marginBottom: '10px' }}>{generatedIdea.visualPrompt?.substring(0, 120)}...</div>
            <button onClick={handleGenerateImage} disabled={isGeneratingImage} style={{
              padding: '8px 16px', backgroundColor: isGeneratingImage ? '#444' : '#28a745',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px'
            }}>
              {isGeneratingImage ? '⏳ Генерирую изображение...' : '2. Создать базовое фото (G-Labs)'}
            </button>
          </div>
        )}

        {generatedImage && (
          <div style={{ marginTop: '16px' }}>
            <button onClick={handleSaveBlogger} style={{
              marginBottom: '12px', width: '100%', padding: '10px',
              backgroundColor: '#e67e22', color: '#fff', border: 'none', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
            }}>
              ✅ 3. Одобрить и сохранить блогера
            </button>
            <img src={generatedImage.base64} alt="Base" style={{ width: '100%', borderRadius: '8px', maxHeight: '400px', objectFit: 'cover' }} />
          </div>
        )}
      </div>

      {/* Current Blogger Panel */}
      <div style={{ flex: 1, backgroundColor: '#1a1a2e', padding: '20px', borderRadius: '12px', border: '1px solid #2a2a4a' }}>
        <h3 style={{ margin: '0 0 16px 0', color: '#e8c4a0', fontSize: '16px' }}>
          ⭐ Текущий персонаж блогера
        </h3>
        {blogger ? (
          <div>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              {blogger.base64 && (
                <img src={blogger.base64} alt={blogger.name} style={{ width: '120px', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #7c4dff' }} />
              )}
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '16px' }}>{blogger.name}</h4>
                <div style={{ fontSize: '12px', color: '#c0a0e0', marginBottom: '6px' }}>
                  <strong>Голос (фиксирован):</strong><br />
                  <span style={{ fontStyle: 'italic', color: '#aaa' }}>{blogger.voiceDescription}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginBottom: '10px' }}>{blogger.personality}</div>
                <button onClick={handleDeleteBlogger} style={{
                  backgroundColor: 'transparent', color: '#ff6666', border: '1px solid #ff4444',
                  padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px'
                }}>Удалить</button>
              </div>
            </div>
            <div style={{ padding: '10px', backgroundColor: '#252535', borderRadius: '8px', border: '1px solid #3a3a5a' }}>
              <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Visual Prompt:</div>
              <div style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>{blogger.visualPrompt?.substring(0, 200)}...</div>
            </div>
            <div style={{ marginTop: '16px', padding: '14px', backgroundColor: '#1a2a1a', borderRadius: '8px', border: '1px solid #2a5a2a' }}>
              <div style={{ fontSize: '13px', color: '#8bc34a', fontWeight: 'bold', marginBottom: '8px' }}>🎬 Как работает FrenchTalk:</div>
              <div style={{ fontSize: '12px', color: '#aaa', lineHeight: '1.6' }}>
                <div>🎤 <strong style={{ color: '#e8c4a0' }}>Blogger</strong> — девушка задаёт вопрос прохожему</div>
                <div>🗣 <strong style={{ color: '#8bc34a' }}>Stranger</strong> — прохожий отвечает</div>
                <div>💬 <strong style={{ color: '#c0722a' }}>Aside</strong> — блогер отходит в сторону и комментирует в камеру с ухмылкой</div>
                <div>🎬 <strong style={{ color: '#e91e63' }}>Outro</strong> — призыв к подписке/лайку в дерзком стиле (каждый раз уникальный!)</div>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ color: '#666', textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎀</div>
            <p>Персонаж блогера не создан.</p>
            <p style={{ fontSize: '12px' }}>Создайте его в панели слева.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderEpisodeTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', height: '100%', overflowY: 'auto' }}>

      {/* AUTO TOPIC PANEL */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: '1px solid #2a4a7f', borderRadius: '12px', padding: '18px', marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, color: '#e8c4a0', fontSize: '15px' }}>🤖 Auto Topic — Сценарий стрит-интервью</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Короткая версия</span>
            <div onClick={() => setFullVersion(!fullVersion)} style={{
              width: '38px', height: '20px', borderRadius: '10px', cursor: 'pointer',
              backgroundColor: fullVersion ? '#007acc' : '#444',
              position: 'relative', transition: 'background 0.2s'
            }}>
              <div style={{
                position: 'absolute', top: '2px', left: fullVersion ? '20px' : '2px',
                width: '16px', height: '16px', borderRadius: '50%',
                backgroundColor: '#fff', transition: 'left 0.2s'
              }} />
            </div>
            <span style={{ fontSize: '12px', color: fullVersion ? '#7ac4ff' : '#888' }}>
              {fullVersion ? 'Full (9-12 линий)' : 'Short (5-7 линий)'}
            </span>
          </div>
        </div>

        {/* Market selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {MARKETS.map(m => (
            <button key={m.id} onClick={() => setSelectedMarket(m.id)} style={{
              padding: '5px 12px', fontSize: '12px',
              backgroundColor: selectedMarket === m.id ? '#007acc' : '#1e2a3a',
              color: '#fff', border: `1px solid ${selectedMarket === m.id ? '#007acc' : '#334'}`,
              borderRadius: '20px', cursor: 'pointer'
            }}>
              {m.flag} {m.label}
            </button>
          ))}
        </div>

        {/* Topic Mode */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {[
            { id: 'trending', label: '📈 Trending' },
            { id: 'custom_topic', label: '✏️ Custom Topic' },
            { id: 'custom_text', label: '📋 Custom Text' },
            { id: 'video_analysis', label: '🎬 Video Analysis' }
          ].map(m => (
            <button key={m.id} onClick={() => setTopicMode(m.id as any)} style={{
              padding: '5px 14px', fontSize: '12px',
              backgroundColor: topicMode === m.id ? '#5a4dcc' : '#1e2a3a',
              color: '#fff', border: `1px solid ${topicMode === m.id ? '#5a4dcc' : '#334'}`,
              borderRadius: '16px', cursor: 'pointer'
            }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Stranger type */}
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Тип прохожего (для сценария)</div>
          <input value={strangerType} onChange={e => setStrangerType(e.target.value)}
            placeholder="E.g.: an elderly man, a young couple, a tourist..."
            style={{ width: '100%', padding: '6px 10px', backgroundColor: '#1e2a3a', color: '#fff', border: '1px solid #334', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>

        {/* Mode-specific inputs */}
        {topicMode === 'trending' && (
          <div style={{ marginBottom: '10px' }}>
            <button onClick={handleFetchSeoKeywords} disabled={isAutoTopic} style={{
              padding: '7px 16px', backgroundColor: isAutoTopic ? '#444' : '#1e5a8a',
              color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginBottom: '8px'
            }}>
              {isAutoTopic ? '⏳ Ищу...' : '🔎 Найти вирусные темы'}
            </button>
            {seoKeywords.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '11px', color: '#888', marginBottom: '2px' }}>Выберите тему:</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {seoKeywords.map(k => (
                    <button key={k.original} onClick={() => setSelectedKeyword(k.original)} style={{
                      padding: '7px 12px', fontSize: '11px', textAlign: 'left',
                      backgroundColor: selectedKeyword === k.original ? '#0d3a5c' : '#1e2a3a',
                      color: '#fff', border: `1px solid ${selectedKeyword === k.original ? '#007acc' : '#334'}`,
                      borderRadius: '8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px'
                    }}>
                      <span style={{ color: selectedKeyword === k.original ? '#7ac4ff' : '#ddd' }}>{k.original}</span>
                      {k.ru && <span style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>{k.ru}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {(topicMode === 'custom_topic' || topicMode === 'custom_text') && (
          <textarea value={customInput} onChange={e => setCustomInput(e.target.value)}
            placeholder={topicMode === 'custom_topic' ? 'Введите тему или вопрос для стрит-интервью...' : 'Вставьте готовый текст, статью или набросок сценария...'}
            style={{ width: '100%', height: '70px', padding: '8px', backgroundColor: '#1e2a3a', color: '#fff', border: '1px solid #334', borderRadius: '6px', marginBottom: '8px', resize: 'vertical', fontSize: '12px', boxSizing: 'border-box' }}
          />
        )}

        {topicMode === 'video_analysis' && (
          <div style={{ marginBottom: '10px' }}>
            <label style={{
              display: 'inline-block', padding: '7px 14px', backgroundColor: '#1e2a3a',
              color: '#7ac4ff', border: '1px solid #334', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
            }}>
              📁 Выбрать видео для анализа
              <input type="file" accept="video/*" style={{ display: 'none' }} onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setSelectedVideoName(file.name);
                const reader = new FileReader();
                reader.onload = ev => setVideoBase64(ev.target!.result as string);
                reader.readAsDataURL(file);
              }} />
            </label>
            {selectedVideoName && <span style={{ fontSize: '11px', color: '#8bc34a', marginLeft: '10px' }}>✓ {selectedVideoName}</span>}
          </div>
        )}

        <button onClick={handleAutoTopic} disabled={isAutoTopic || !blogger} style={{
          padding: '9px 20px', backgroundColor: isAutoTopic ? '#444' : '#e67e22',
          color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer',
          fontWeight: 'bold', fontSize: '13px', width: '100%'
        }}>
          {isAutoTopic ? `⏳ ${status || 'Генерирую...'}` : !blogger ? '⚠️ Сначала создайте блогера' : '🎬 Сгенерировать сценарий'}
        </button>

        {autoTopicResult && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#0a1a0a', borderRadius: '8px', border: '1px solid #2a5a2a' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#8bc34a' }}>{autoTopicResult.topic}</div>
            {autoTopicResult.topicRu && <div style={{ fontSize: '11px', color: '#678c34', marginBottom: '4px' }}>{autoTopicResult.topicRu}</div>}
            <div style={{ fontSize: '12px', color: '#ccc', marginTop: '4px' }}>🎯 <em>"{autoTopicResult.hook}"</em></div>
            {autoTopicResult.hookRu && <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>{autoTopicResult.hookRu}</div>}
            {autoTopicResult.question && <div style={{ fontSize: '12px', color: '#c0a0e0', marginTop: '6px' }}>❓ <strong>Вопрос:</strong> {autoTopicResult.question}</div>}
          </div>
        )}
      </div>

      {/* Episode settings */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
        backgroundColor: '#151520', borderRadius: '10px', padding: '16px',
        border: '1px solid #2a2a3a', marginBottom: '16px'
      }}>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Episode Title (папка)</div>
          <input value={episodeTitle} onChange={e => setEpisodeTitle(e.target.value)}
            placeholder="FT_episode_name"
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Location / Scene</div>
          <input value={location} onChange={e => setLocation(e.target.value)}
            placeholder="Paris street near the Eiffel Tower"
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Blogger Outfit (необязательно)</div>
          <input value={bloggerOutfit} onChange={e => setBloggerOutfit(e.target.value)}
            placeholder="Light trench coat, white blouse, sunglasses..."
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ fontSize: '11px', color: '#888' }}>Stranger Description</div>
            <button
              onClick={handleGenerateStranger}
              disabled={isGeneratingStranger}
              style={{
                padding: '3px 10px', fontSize: '11px', cursor: 'pointer',
                backgroundColor: isGeneratingStranger ? '#333' : '#3a1e6e',
                color: isGeneratingStranger ? '#666' : '#c9a0ff',
                border: '1px solid #5a3a9a', borderRadius: '12px'
              }}
            >
              {isGeneratingStranger ? '⏳ Генерирую...' : '✨ Сгенерировать персонажа'}
            </button>
          </div>
          {(generatedStrangerHint || generatedStrangerPreview) && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '4px' }}>
              {generatedStrangerPreview && (
                <img
                  src={generatedStrangerPreview}
                  alt="Stranger preview"
                  style={{ width: '80px', height: '107px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #5a3a9a', flexShrink: 0 }}
                />
              )}
              {generatedStrangerHint && (
                <div style={{ fontSize: '10px', color: '#9b7acc', fontStyle: 'italic', paddingTop: '2px' }}>
                  🎭 {generatedStrangerHint}
                </div>
              )}
            </div>
          )}
          <input value={strangerDescription} onChange={e => setStrangerDescription(e.target.value)}
            placeholder="Elderly French man, 65+ years, glasses, kind face... or click ✨ to generate"
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Stranger Voice</div>
          <input value={strangerVoiceDescription} onChange={e => setStrangerVoiceDescription(e.target.value)}
            placeholder="Elderly French man, deep raspy voice, slow careful speech..."
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Aspect Ratio</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['9:16', '16:9'] as const).map(r => (
              <button key={r} onClick={() => setAspectRatio(r)} style={{
                padding: '6px 14px', backgroundColor: aspectRatio === r ? '#7c4dff' : '#252535',
                color: '#fff', border: '1px solid #444', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}>{r}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Video Model</div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {VIDEO_MODELS.map(m => (
              <button key={m.value} onClick={() => setVideoModel(m.value as any)} style={{
                padding: '5px 10px', backgroundColor: videoModel === m.value ? '#7c4dff' : '#252535',
                color: '#fff', border: '1px solid #444', borderRadius: '5px', cursor: 'pointer', fontSize: '11px'
              }}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Script Editor */}
      <div style={{ backgroundColor: '#151520', borderRadius: '10px', padding: '16px', border: '1px solid #2a2a3a', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 'bold' }}>📝 Сценарий</div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#888' }}>
            <span>Слов: <strong style={{ color: '#ccc' }}>{scriptWords}</strong></span>
            <span>~{estimatedDuration}с</span>
            {isTooShort && <span style={{ color: '#ff8844' }}>⚠️ Очень короткий</span>}
            {hasOverlongLines && <span style={{ color: '#ff4444' }}>⚠️ Есть длинные строки ({'>'}20 слов)</span>}
          </div>
        </div>
        <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
          Формат: <code style={{ color: '#7ac4ff' }}>{blogger?.name || 'BloggerName'}: текст</code> | <code style={{ color: '#7ac4ff' }}>Stranger: текст</code> | <code style={{ color: '#7ac4ff' }}>Aside: текст</code> | <code style={{ color: '#e91e63' }}>Outro: призыв к подписке</code>
        </div>
        <textarea value={script} onChange={e => setScript(e.target.value)}
          placeholder={`${blogger?.name || 'Sophie'}: Arrêtez-vous ! J'ai une question importante...\nStranger: Euh... oui ?\n${blogger?.name || 'Sophie'}: Combien gagnez-vous par mois ?\nStranger: C'est une blague ?!\nAside: Ils pensent toujours que c'est une blague... spoiler, c'est pas une blague.`}
          style={{
            width: '100%', height: '160px', padding: '10px', backgroundColor: '#0d1117',
            color: '#e6edf3', border: '1px solid #30363d', borderRadius: '6px',
            fontFamily: 'monospace', fontSize: '13px', resize: 'vertical', lineHeight: '1.6', boxSizing: 'border-box'
          }}
        />
        {/* Per-line stats */}
        {scriptLineStats.length > 0 && (
          <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {scriptLineStats.map((s, i) => s && (
              <span key={i} style={{
                fontSize: '11px', padding: '2px 6px', borderRadius: '10px',
                backgroundColor: s.tooLong ? '#5a1a1a' : '#1a2a1a',
                color: s.tooLong ? '#ff8888' : '#8bc34a',
                border: `1px solid ${s.tooLong ? '#882222' : '#2a5a2a'}`
              }}>
                #{i + 1} {s.words}w
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Segment Generator */}
      {segments.length > 0 && (
        <div style={{ backgroundColor: '#151520', borderRadius: '10px', padding: '16px', border: '1px solid #2a2a3a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', color: '#ccc', fontWeight: 'bold' }}>
              🎬 Генерация видео клипов — {segments.length} сцен
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#666', alignSelf: 'center' }}>
                {segments.filter(s => s.status === 'done').length}/{segments.length} готово
              </span>
              {!isAutoRunning ? (
                <button onClick={handleAutoGenerateAll} style={{
                  padding: '7px 14px', backgroundColor: '#007acc', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                }}>⚡ Авто-генерация всех</button>
              ) : (
                <button onClick={() => { stopAutoRef.current = true; setIsAutoRunning(false); }} style={{
                  padding: '7px 14px', backgroundColor: '#cc3333', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                }}>⛔ Стоп</button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {segments.map(seg => (
              <div key={seg.index} style={{
                display: 'flex', gap: '12px', alignItems: 'flex-start',
                backgroundColor: '#0d1117', borderRadius: '8px', padding: '10px',
                border: `1px solid ${seg.status === 'done' ? '#2a5a2a' : seg.status === 'error' ? '#5a1a1a' : seg.status === 'generating' ? '#2a4a7f' : '#252535'}`
              }}>
                {/* Role badge */}
                <div style={{ flexShrink: 0, paddingTop: '2px' }}>
                  <span style={{
                    display: 'inline-block', padding: '3px 8px', borderRadius: '10px', fontSize: '11px',
                    backgroundColor: ROLE_COLORS[seg.role] + '33',
                    color: ROLE_COLORS[seg.role], border: `1px solid ${ROLE_COLORS[seg.role]}66`,
                    fontWeight: 'bold', whiteSpace: 'nowrap'
                  }}>
                    {ROLE_LABELS[seg.role]}
                  </span>
                  <div style={{ fontSize: '10px', color: '#555', marginTop: '2px', textAlign: 'center' }}>#{seg.index + 1} · {seg.words}w</div>
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: '#e6edf3', marginBottom: '2px' }}>"{seg.text}"</div>
                  {seg.translationRu && (
                    <div style={{ fontSize: '11px', color: '#888', fontStyle: 'italic' }}>{seg.translationRu}</div>
                  )}
                  {seg.status === 'error' && (
                    <div style={{ fontSize: '11px', color: '#ff6666', marginTop: '4px' }}>⚠️ {seg.errorMsg}</div>
                  )}
                </div>

                {/* Video preview */}
                {seg.videoBase64 && (
                  <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewVideo(seg.videoBase64!)}>
                    <video src={seg.videoBase64} style={{ width: '60px', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #2a5a2a' }} muted />
                    <div style={{ fontSize: '9px', color: '#8bc34a', textAlign: 'center', marginTop: '2px' }}>▶ Play</div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                  <button onClick={() => handleGenerateSegment(seg)} disabled={seg.status === 'generating'} style={{
                    padding: '6px 12px', fontSize: '11px',
                    backgroundColor: seg.status === 'done' ? '#1a3a1a' : seg.status === 'generating' ? '#1a2a4a' : '#252535',
                    color: seg.status === 'generating' ? '#7ac4ff' : seg.status === 'done' ? '#8bc34a' : '#ccc',
                    border: `1px solid ${seg.status === 'done' ? '#2a6a2a' : seg.status === 'generating' ? '#2a4a8a' : '#444'}`,
                    borderRadius: '5px', cursor: seg.status === 'generating' ? 'default' : 'pointer', whiteSpace: 'nowrap'
                  }}>
                    {seg.status === 'generating' ? '⏳ Генерирую...' : seg.status === 'done' ? '🔄 Пересоздать' : '🎬 Создать'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Global status bar */}
      {status && !isAutoTopic && (
        <div style={{ marginTop: '12px', padding: '10px 14px', backgroundColor: '#1a2a3a', borderRadius: '6px', border: '1px solid #2a4a7f', fontSize: '13px', color: '#7ac4ff' }}>
          ⏳ {status}
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d0d1a', color: '#e0e0e0' }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(90deg, #1a0a2e 0%, #2d1b4e 50%, #1a0a2e 100%)',
        borderBottom: '1px solid #3a2a5a', padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '22px' }}>🇫🇷</span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#e8c4a0' }}>FrenchTalk</div>
            <div style={{ fontSize: '11px', color: '#888' }}>Paris Street Interview Generator for TikTok</div>
          </div>
        </div>
        {blogger && (
          <div style={{ fontSize: '12px', color: '#8bc34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎀</span>
            <span>{blogger.name}</span>
            <span style={{ color: '#666' }}>· Fixed voice ✓</span>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <div style={{
        display: 'flex', gap: '4px', padding: '8px 20px', backgroundColor: '#0d0d1a',
        borderBottom: '1px solid #252535', flexShrink: 0
      }}>
        {[
          { id: 'blogger', label: '🎀 Blogger Setup' },
          { id: 'episode', label: '🎬 Episode Generator' }
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id as any)} style={{
            padding: '7px 18px', fontSize: '13px', fontWeight: 'bold',
            backgroundColor: subTab === t.id ? '#7c4dff' : 'transparent',
            color: subTab === t.id ? '#fff' : '#888',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            borderBottom: subTab === t.id ? '2px solid #e8c4a0' : '2px solid transparent'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', overflowY: 'auto' }}>
        {subTab === 'blogger' ? renderBloggerTab() : renderEpisodeTab()}
      </div>

      {/* Video Preview Modal */}
      {previewVideo && (
        <div onClick={() => setPreviewVideo(null)} style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer'
        }}>
          <div onClick={e => e.stopPropagation()}>
            <video src={previewVideo} controls autoPlay style={{
              maxHeight: '85vh', maxWidth: '90vw', borderRadius: '8px', boxShadow: '0 0 40px rgba(124,77,255,0.5)'
            }} />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <button onClick={() => setPreviewVideo(null)} style={{
                padding: '6px 16px', backgroundColor: '#333', color: '#ccc',
                border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}>✕ Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FrenchTalkTab;
