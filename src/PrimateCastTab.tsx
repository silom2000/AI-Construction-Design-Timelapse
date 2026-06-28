import React, { useState, useEffect } from 'react';

const LLM_PROVIDERS = [
    { value: 'pollinations', label: 'Pollinations (Free)' },
    { value: 'custom', label: 'Custom Proxy (Local)' }
];

const MARKETS = [
  { id: 'en-us', flag: '🇺🇸', label: 'English (USA)', language: 'English', country: 'United States' },
  { id: 'en-gb', flag: '🇬🇧', label: 'English (UK)', language: 'English', country: 'United Kingdom' },
  { id: 'fr', flag: '🇫🇷', label: 'Français', language: 'French', country: 'France' },
  { id: 'de', flag: '🇩🇪', label: 'Deutsch', language: 'German', country: 'Germany' },
];

const PrimateCastTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'characters' | 'episode'>('characters');
  const [llmProvider, setLlmProvider] = useState<string>('pollinations');
  
  // Characters State
  const [characters, setCharacters] = useState<any[]>([]);
  const [charPrompt, setCharPrompt] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<any>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ imagePath: string, base64: string } | null>(null);

  // Episode State
  const [host1, setHost1] = useState<string>('');
  const [host2, setHost2] = useState<string>('');
  const [clothes1, setClothes1] = useState('');
  const [clothes2, setClothes2] = useState('');
  const [location, setLocation] = useState('modern podcast studio with neon lights');
  const [script, setScript] = useState('');
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  
  const [status, setStatus] = useState('');

  // Auto-Topic
  const [selectedMarket, setSelectedMarket] = useState('en-us');
  const [isAutoTopic, setIsAutoTopic] = useState(false);
  const [autoTopicResult, setAutoTopicResult] = useState<{ topic: string; topicEn: string; topicRu?: string; hook: string; hookRu?: string } | null>(null);
  const [translationsMap, setTranslationsMap] = useState<Record<string, string>>({});
  const [topicMode, setTopicMode] = useState<'trending' | 'custom_topic' | 'custom_text' | 'video_analysis'>('trending');
  const [customInput, setCustomInput] = useState('');
  const [videoBase64, setVideoBase64] = useState<string>('');
  const [selectedVideoName, setSelectedVideoName] = useState<string>('');
  const [fullVersion, setFullVersion] = useState(false);

  // Computed script stats
  const scriptWords = script.trim().split(/\s+/).filter(w => w.length > 0).length;
  const estimatedDuration = Math.round(scriptWords / 2.5); // ~2.5 words per sec
  const isTooShort = estimatedDuration < 60;

  // Per-line word counts for Omni Flash 8-sec limit
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
    loadCharacters();

    // Subscribe to progress events from the backend
    window.electronAPI.onPrimatecastProgress((data: { status: string; progress?: number }) => {
      if (data.status) {
        setStatus(data.status);
      }
    });

    return () => {
      window.electronAPI.removePrimatecastProgressListener();
    };
  }, []);

  const loadCharacters = async () => {
    try {
      const chars = await window.electronAPI.primatecastGetCharacters();
      setCharacters(chars);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateIdea = async () => {
    if (!charPrompt) return;
    setIsGeneratingIdea(true);
    try {
      const idea = await window.electronAPI.primatecastGenerateCharacterIdea({ promptText: charPrompt, provider: llmProvider });
      setGeneratedIdea(idea);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleGenerateImage = async () => {
    if (!generatedIdea) return;
    setIsGeneratingImage(true);
    try {
      const img = await window.electronAPI.primatecastGenerateBaseImage({ 
        visualPrompt: generatedIdea.visualPrompt, 
        model: 'imagen4' 
      });
      setGeneratedImage(img);
    } catch (e: any) {
      alert("Error generating image: " + e.message);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleSaveCharacter = async () => {
    if (!generatedIdea || !generatedImage) return;
    try {
      await window.electronAPI.primatecastSaveCharacter({
        ...generatedIdea,
        imagePath: generatedImage.imagePath
      });
      setGeneratedIdea(null);
      setGeneratedImage(null);
      setCharPrompt('');
      loadCharacters();
      alert("Character saved!");
    } catch (e: any) {
      alert("Error saving: " + e.message);
    }
  };

  const handleDeleteCharacter = async (id: string) => {
    if (confirm("Delete this character?")) {
      await window.electronAPI.primatecastDeleteCharacter(id);
      loadCharacters();
    }
  };

  const handleAutoTopic = async () => {
    const host1Char = characters.find(c => c.id === host1);
    const host2Char = characters.find(c => c.id === host2);
    if (!host1Char || !host2Char) {
      alert('Выберите обоих ведущих перед генерацией темы!');
      return;
    }
    if (topicMode === 'video_analysis') {
      if (!videoBase64) {
        alert('Пожалуйста, выберите файл видео для анализа!');
        return;
      }
    } else if (topicMode !== 'trending' && !customInput.trim()) {
      alert('Пожалуйста, введите тему или текст!');
      return;
    }
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    setIsAutoTopic(true);
    setAutoTopicResult(null);
    
    let initialStatus = '🌐 Ищу трендовые темы в ' + market.country + '...';
    if (topicMode === 'custom_topic') {
      initialStatus = '🔍 Ищу информацию в сети интернет по теме...';
    } else if (topicMode === 'custom_text') {
      initialStatus = '⚙️ Обрабатываю и адаптирую ваш текст...';
    } else if (topicMode === 'video_analysis') {
      initialStatus = '🎵 Извлекаю аудио и транскрибирую видео...';
    }
    setStatus(initialStatus);
    
    try {
      let result;
      if (topicMode === 'video_analysis') {
        result = await window.electronAPI.primatecastAnalyzeVideo({
          videoBase64: videoBase64,
          language: market.language,
          host1Name: host1Char.name,
          host2Name: host2Char.name,
          shortVersion: !fullVersion
        });
      } else {
        result = await window.electronAPI.primatecastAutoTopic({
          language: market.language,
          country: market.country,
          host1Name: host1Char.name,
          host2Name: host2Char.name,
          mode: topicMode,
          customInput: customInput,
          shortVersion: !fullVersion
        });
      }
      setScript(result.script);
      setEpisodeTitle('Episode_' + result.topicEn.replace(/[^a-z0-9]/gi, '_').substring(0, 30));
      setAutoTopicResult({ 
        topic: result.topic, 
        topicEn: result.topicEn, 
        topicRu: result.topicRu, 
        hook: result.hook, 
        hookRu: result.hookRu 
      });

      if (result.scriptRu) {
        const originalLines = result.script.split('\n').filter((l: string) => l.trim());
        const translatedLines = result.scriptRu.split('\n').filter((l: string) => l.trim());
        const newTranslations: Record<string, string> = {};
        originalLines.forEach((line: string, idx: number) => {
          const origMatch = line.match(/^([^:]+):\s*(.*)$/);
          if (!origMatch) return;
          const origText = origMatch[2].trim();
          const transLine = translatedLines[idx];
          if (transLine) {
            const transMatch = transLine.match(/^([^:]+):\s*(.*)$/);
            if (transMatch) {
              newTranslations[origText] = transMatch[2].trim();
            } else {
              newTranslations[origText] = transLine.replace(/^[^:]+:\s*/, '').trim();
            }
          }
        });
        setTranslationsMap(newTranslations);
      }

      // Warn if LLM generated overlong lines despite instructions
      if (result.overlongLines && result.overlongLines.length > 0) {
        console.warn('[PrimateCast UI] Overlong lines:', result.overlongLines);
      }
      setStatus('');
    } catch (e: any) {
      alert('Ошибка Auto Topic: ' + e.message);
      setStatus('');
    } finally {
      setIsAutoTopic(false);
    }
  };

  // ── Segment-by-segment state ──────────────────────────────────────
  type SegmentState = {
    index: number;
    speakerId: string;
    speakerName: string;
    text: string;
    translationRu?: string;
    words: number;
    status: 'idle' | 'generating' | 'done' | 'error';
    videoBase64?: string;
    videoPath?: string;
    errorMsg?: string;
  };

  const [segments, setSegments] = useState<SegmentState[]>([]);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const stopAutoRef = React.useRef(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  // Parse script into segments whenever script/host1/host2 changes
  React.useEffect(() => {
    if (!script || !host1 || !host2) { setSegments([]); return; }
    const host1Char = characters.find(c => c.id === host1);
    const host2Char = characters.find(c => c.id === host2);
    if (!host1Char || !host2Char) { setSegments([]); return; }

    const parsed: SegmentState[] = [];
    script.split('\n').filter(l => l.trim()).forEach((line) => {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const name = match[1].trim();
      const text = match[2].trim();
      let speakerId = '';
      let speakerName = '';
      if (name.toLowerCase() === host1Char.name.toLowerCase()) {
        speakerId = host1Char.id; speakerName = host1Char.name;
      } else if (name.toLowerCase() === host2Char.name.toLowerCase()) {
        speakerId = host2Char.id; speakerName = host2Char.name;
      }
      if (!speakerId) return;
      // Preserve existing video if segment unchanged
      const existing = segments.find(s => s.index === parsed.length && s.text === text);
      parsed.push({
        index: parsed.length,
        speakerId,
        speakerName,
        text,
        translationRu: translationsMap[text] || existing?.translationRu,
        words: text.split(/\s+/).length,
        status: existing?.status ?? 'idle',
        videoBase64: existing?.videoBase64,
        videoPath: existing?.videoPath,
      });
    });
    setSegments(parsed);
  }, [script, host1, host2, characters, translationsMap]);

  // Debounced auto-save of prompts to prompts.txt and prompts.json
  React.useEffect(() => {
    if (!script || !host1 || !host2 || !episodeTitle || segments.length === 0) return;

    const timer = setTimeout(async () => {
      try {
        await window.electronAPI.primatecastSaveAllPrompts({
          host1Id: host1,
          host2Id: host2,
          clothes1,
          clothes2,
          location,
          episodeTitle,
          aspectRatio,
          segments: segments.map(s => ({
            index: s.index,
            speakerId: s.speakerId,
            text: s.text
          }))
        });
        console.log('[PrimateCast] All prompts pre-saved successfully.');
      } catch (err) {
        console.error('[PrimateCast] Error pre-saving prompts:', err);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timer);
  }, [segments, episodeTitle, location, clothes1, clothes2, aspectRatio, host1, host2]);

  const updateSegment = (index: number, updates: Partial<SegmentState>) => {
    setSegments(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s));
  };

  const handleGenerateSegment = async (seg: SegmentState) => {
    if (!host1 || !host2 || !episodeTitle) {
      alert('Заполните Episode Title и выберите оба хоста!');
      return;
    }
    updateSegment(seg.index, { status: 'generating', errorMsg: undefined });
    try {
      const result = await window.electronAPI.primatecastGenerateSegment({
        segmentIndex: seg.index,
        speakerId: seg.speakerId,
        dialogueText: seg.text,
        host1Id: host1,
        host2Id: host2,
        clothes1, clothes2, location, episodeTitle,
        aspectRatio
      });
      updateSegment(seg.index, {
        status: 'done',
        videoBase64: result.videoBase64,
        videoPath: result.videoPath
      });
    } catch (e: any) {
      updateSegment(seg.index, { status: 'error', errorMsg: e.message });
    }
  };

  const handleAutoGenerateAll = async () => {
    if (!host1 || !host2 || !episodeTitle) {
      alert('Заполните Episode Title и выберите оба хоста!');
      return;
    }
    stopAutoRef.current = false;
    setIsAutoRunning(true);
    for (const seg of segments) {
      if (stopAutoRef.current) break;
      if (seg.status === 'done') continue; // skip already done
      await handleGenerateSegment(seg);
      await new Promise(r => setTimeout(r, 300));
    }
    setIsAutoRunning(false);
  };

  const renderCharactersTab = () => (
    <div style={{ display: 'flex', gap: '20px', padding: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* Creation Panel */}
      <div style={{ flex: 1, backgroundColor: '#222', padding: '20px', borderRadius: '8px', minWidth: '400px' }}>
        <h3>Create New Character</h3>
        
        <div style={{ marginBottom: '15px' }}>
            <div style={{ fontSize: '13px', color: '#888', marginBottom: '5px' }}>LLM Provider</div>
            <div style={{ display: 'flex', gap: '10px' }}>
                {LLM_PROVIDERS.map(p => (
                    <button
                        key={p.value}
                        onClick={() => setLlmProvider(p.value)}
                        style={{
                            padding: '6px 12px',
                            backgroundColor: llmProvider === p.value ? '#007acc' : '#333',
                            color: '#fff',
                            border: '1px solid #444',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        {p.label}
                    </button>
                ))}
            </div>
        </div>

        <p style={{ color: '#888', fontSize: '13px' }}>
          Describe the character (e.g. "Sarcastic Zoomer Macaque"). AI will generate the prompt and profile.
        </p>
        <textarea 
          value={charPrompt} 
          onChange={e => setCharPrompt(e.target.value)}
          placeholder="E.g., A wise old chimpanzee who loves talking about taxes..."
          style={{ width: '100%', height: '80px', marginBottom: '10px', backgroundColor: '#333', color: '#fff', border: '1px solid #444', padding: '8px' }}
        />
        <button 
          onClick={handleGenerateIdea} 
          disabled={isGeneratingIdea || !charPrompt}
          style={{ padding: '8px 16px', backgroundColor: '#007acc', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          {isGeneratingIdea ? 'Generating Profile...' : '1. Generate AI Profile'}
        </button>

        {generatedIdea && (
          <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#2a2a2a', borderRadius: '6px' }}>
            <h4>{generatedIdea.name}</h4>
            <p><strong>Voice:</strong> {generatedIdea.voiceDescription}</p>
            <p><strong>Personality:</strong> {generatedIdea.personality}</p>
            <p style={{ fontSize: '12px', color: '#aaa' }}>{generatedIdea.visualPrompt}</p>
            
            <div style={{ marginTop: '15px' }}>
              <button 
                onClick={handleGenerateImage} 
                disabled={isGeneratingImage}
                style={{ padding: '8px 16px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                {isGeneratingImage ? 'Generating Base Image...' : '2. Generate Base Image (G-Labs)'}
              </button>
            </div>
          </div>
        )}

        {generatedImage && (
          <div style={{ marginTop: '20px' }}>
            <button 
              onClick={handleSaveCharacter} 
              style={{ marginBottom: '15px', width: '100%', padding: '10px', backgroundColor: '#e67e22', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              3. Approve & Save Character
            </button>
            <img src={generatedImage.base64} alt="Base" style={{ width: '100%', borderRadius: '8px' }} />
          </div>
        )}
      </div>

      {/* Roster Panel */}
      <div style={{ flex: 1, backgroundColor: '#222', padding: '20px', borderRadius: '8px' }}>
        <h3>Saved Characters Roster</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {characters.map(c => (
            <div key={c.id} style={{ display: 'flex', backgroundColor: '#333', padding: '10px', borderRadius: '8px', gap: '15px' }}>
              {c.base64 && <img src={c.base64} alt={c.name} style={{ width: '120px', height: '67px', objectFit: 'cover', borderRadius: '4px' }} />}
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 5px 0' }}>{c.name}</h4>
                <div style={{ fontSize: '12px', color: '#aaa' }}>{c.voiceDescription}</div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{c.personality}</div>
              </div>
              <button 
                onClick={() => handleDeleteCharacter(c.id)}
                style={{ backgroundColor: 'transparent', color: '#ff4444', border: 'none', cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                Delete
              </button>
            </div>
          ))}
          {characters.length === 0 && <p style={{ color: '#888' }}>No characters saved yet.</p>}
        </div>
      </div>
    </div>
  );

  const renderEpisodeTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', height: '100%', overflowY: 'auto' }}>
      
      {/* AUTO TOPIC PANEL */}
      <div style={{
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        border: '1px solid #2a4a7f',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <span style={{ fontSize: '22px' }}>🌍</span>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#60a5fa' }}>Auto Topic — Trending Now</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Поиск горячих тем в интернете и автогенерация скрипта</div>
          </div>
        </div>

        {/* Market buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
          {MARKETS.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedMarket(m.id)}
              style={{
                padding: '8px 14px',
                backgroundColor: selectedMarket === m.id ? '#2563eb' : 'rgba(255,255,255,0.07)',
                color: selectedMarket === m.id ? '#fff' : '#94a3b8',
                border: selectedMarket === m.id ? '1px solid #3b82f6' : '1px solid #334155',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: selectedMarket === m.id ? 'bold' : 'normal',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <span>{m.flag}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setTopicMode('trending')}
            style={{
              padding: '8px 14px',
              backgroundColor: topicMode === 'trending' ? '#2563eb' : 'rgba(255,255,255,0.07)',
              color: topicMode === 'trending' ? '#fff' : '#94a3b8',
              border: topicMode === 'trending' ? '1px solid #3b82f6' : '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            📈 Тренды Google Trends
          </button>
          <button
            onClick={() => setTopicMode('custom_topic')}
            style={{
              padding: '8px 14px',
              backgroundColor: topicMode === 'custom_topic' ? '#2563eb' : 'rgba(255,255,255,0.07)',
              color: topicMode === 'custom_topic' ? '#fff' : '#94a3b8',
              border: topicMode === 'custom_topic' ? '1px solid #3b82f6' : '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            🔍 Своя тема (с поиском в Web)
          </button>
          <button
            onClick={() => setTopicMode('custom_text')}
            style={{
              padding: '8px 14px',
              backgroundColor: topicMode === 'custom_text' ? '#2563eb' : 'rgba(255,255,255,0.07)',
              color: topicMode === 'custom_text' ? '#fff' : '#94a3b8',
              border: topicMode === 'custom_text' ? '1px solid #3b82f6' : '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            📄 Готовый текст / Скрипт
          </button>
          <button
            onClick={() => setTopicMode('video_analysis')}
            style={{
              padding: '8px 14px',
              backgroundColor: topicMode === 'video_analysis' ? '#2563eb' : 'rgba(255,255,255,0.07)',
              color: topicMode === 'video_analysis' ? '#fff' : '#94a3b8',
              border: topicMode === 'video_analysis' ? '1px solid #3b82f6' : '1px solid #334155',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            📁 Анализ видео
          </button>
        </div>

        {/* Custom Input Field */}
        {topicMode !== 'trending' && (
          <div style={{ marginBottom: '14px' }}>
            {topicMode === 'video_analysis' ? (
              <div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>
                  Выберите видеофайл для анализа и генерации:
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedVideoName(file.name);
                        const reader = new FileReader();
                        reader.onload = () => {
                          setVideoBase64(reader.result as string);
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ display: 'none' }}
                    id="primatecast-video-file"
                  />
                  <label
                    htmlFor="primatecast-video-file"
                    style={{
                      padding: '10px 18px',
                      backgroundColor: 'rgba(255,255,255,0.07)',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      transition: 'all 0.2s',
                      display: 'inline-block'
                    }}
                  >
                    📁 Выбрать видео
                  </label>
                  {selectedVideoName && (
                    <span 
                      style={{ fontSize: '13px', color: '#60a5fa', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '300px' }} 
                      title={selectedVideoName}
                    >
                      {selectedVideoName}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '6px', fontWeight: 'bold' }}>
                  {topicMode === 'custom_topic' ? 'Укажите тему для поиска и генерации подкаста:' : 'Вставьте исходный текст для обработки:'}
                </div>
                {topicMode === 'custom_topic' ? (
                  <input
                    type="text"
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    placeholder="Например: Обновление Apple Vision Pro и метавселенные..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '14px',
                      outline: 'none'
                    }}
                  />
                ) : (
                  <textarea
                    value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    placeholder="Вставьте сюда статью, новость или реплики..."
                    style={{
                      width: '100%',
                      height: '100px',
                      padding: '10px 14px',
                      backgroundColor: 'rgba(0,0,0,0.2)',
                      color: '#fff',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '14px',
                      resize: 'vertical',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Full Version Toggle Checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', marginTop: '4px' }}>
          <input
            type="checkbox"
            checked={fullVersion}
            onChange={(e) => setFullVersion(e.target.checked)}
            id="primatecast-full-version"
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              accentColor: '#3b82f6',
              flexShrink: 0
            }}
          />
          <label
            htmlFor="primatecast-full-version"
            style={{
              fontSize: '13px',
              color: '#f8fafc',
              cursor: 'pointer',
              userSelect: 'none',
              display: 'flex',
              flexDirection: 'column',
              lineHeight: '1.4'
            }}
          >
            <span style={{ fontWeight: 'bold' }}>Полная версия подкаста (более 1 минуты)</span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {fullVersion 
                ? 'Генерирует полный сценарий (13-14 реплик). Длительность видео ~60-80 секунд.' 
                : 'Короткая версия (6-7 реплик). Экономит 50% стоимости генерации. Длительность видео ~30-40 секунд.'}
            </span>
          </label>
        </div>

        {/* Auto topic button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <button
            onClick={handleAutoTopic}
            disabled={isAutoTopic}
            style={{
              padding: '10px 22px',
              background: isAutoTopic ? '#1e3a5f' : 'linear-gradient(90deg, #2563eb, #7c3aed)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: isAutoTopic ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: isAutoTopic ? 'none' : '0 0 20px rgba(37,99,235,0.4)'
            }}
          >
            <span>{isAutoTopic ? '⏳' : topicMode === 'trending' ? '🔎' : topicMode === 'custom_topic' ? '🔍' : topicMode === 'custom_text' ? '⚙️' : '📁'}</span>
            {isAutoTopic ? 'Обработка...' : topicMode === 'trending' ? '✨ Auto Topic + Script' : topicMode === 'custom_topic' ? '✨ Generate from Topic' : topicMode === 'custom_text' ? '✨ Adapt & Split Text' : '✨ Analyze Video & Generate'}
          </button>
          {isAutoTopic && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#60a5fa' }}>
              <div style={{
                width: '14px',
                height: '14px',
                border: '2px solid rgba(96, 165, 250, 0.2)',
                borderTop: '2px solid #60a5fa',
                borderRadius: '50%',
                animation: 'primatecast-spin 1s linear infinite',
                flexShrink: 0
              }} />
              <style>{`
                @keyframes primatecast-spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
              <span>{status}</span>
            </div>
          )}
        </div>

        {/* Topic result */}
        {autoTopicResult && (
          <div style={{
            marginTop: '14px',
            padding: '12px',
            backgroundColor: 'rgba(37,99,235,0.15)',
            borderRadius: '8px',
            borderLeft: '3px solid #3b82f6'
          }}>
            <div style={{ fontWeight: 'bold', color: '#93c5fd', marginBottom: '4px' }}>
              📌 {autoTopicResult.topic}
              <span style={{ fontSize: '11px', color: '#64748b', marginLeft: '8px' }}>({autoTopicResult.topicEn})</span>
              {autoTopicResult.topicRu && (
                <span style={{ fontSize: '13px', color: '#a7f3d0', marginLeft: '8px' }}>— {autoTopicResult.topicRu}</span>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>
              💬 {autoTopicResult.hook}
              {autoTopicResult.hookRu && (
                <div style={{ fontSize: '12px', color: '#a7f3d0', marginTop: '4px', fontStyle: 'normal' }}>
                  🇷🇺 {autoTopicResult.hookRu}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        {/* Host 1 */}
        <div style={{ flex: 1, backgroundColor: '#222', padding: '15px', borderRadius: '8px' }}>
          <h4>Host 1</h4>
          <select 
            value={host1} 
            onChange={e => setHost1(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          >
            <option value="">Select Character...</option>
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input 
            type="text" 
            placeholder="Clothes (e.g. black hoodie, glasses)" 
            value={clothes1}
            onChange={e => setClothes1(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          />
        </div>

        {/* Host 2 */}
        <div style={{ flex: 1, backgroundColor: '#222', padding: '15px', borderRadius: '8px' }}>
          <h4>Host 2</h4>
          <select 
            value={host2} 
            onChange={e => setHost2(e.target.value)}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          >
            <option value="">Select Character...</option>
            {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input 
            type="text" 
            placeholder="Clothes (e.g. stylish suit)" 
            value={clothes2}
            onChange={e => setClothes2(e.target.value)}
            style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          />
        </div>
      </div>

      {/* Location & Title */}
      <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
        <div style={{ flex: 1.5 }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Episode Title (Folder Name)</label>
          <input 
            type="text" 
            value={episodeTitle}
            onChange={e => setEpisodeTitle(e.target.value)}
            placeholder="e.g. Episode_1_Taxes"
            style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          />
        </div>
        <div style={{ flex: 2 }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Location / Studio Setup</label>
          <input 
            type="text" 
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="modern podcast studio with neon lights"
            style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: '1px solid #555' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Aspect Ratio</label>
          <select 
            value={aspectRatio}
            onChange={e => setAspectRatio(e.target.value as '16:9' | '9:16')}
            style={{ width: '100%', padding: '8px', backgroundColor: '#333', color: '#fff', border: '1px solid #555', cursor: 'pointer' }}
          >
            <option value="16:9">Horizontal (16:9)</option>
            <option value="9:16">Vertical (9:16)</option>
          </select>
        </div>
      </div>

      {/* Script */}
      <div style={{ backgroundColor: '#222', padding: '15px', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h4 style={{ margin: 0 }}>Episode Script</h4>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '13px' }}>
            <span style={{ color: isTooShort ? '#ffaa00' : '#4caf50' }}>
              ⏱ ~{estimatedDuration}s {isTooShort && '(< 60s для монетизации)'}
            </span>
            {hasOverlongLines && (
              <span style={{ color: '#ff4444', fontWeight: 'bold' }}>
                ⚠️ Есть строки &gt; 20 слов!
              </span>
            )}
          </div>
        </div>

        {/* Per-line word count analysis */}
        {scriptLineStats.length > 0 && (
          <div style={{
            marginBottom: '10px',
            maxHeight: '140px',
            overflowY: 'auto',
            backgroundColor: '#1a1a1a',
            borderRadius: '6px',
            padding: '8px',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div style={{ color: '#666', marginBottom: '4px', fontSize: '11px' }}>
              📊 Анализ строк (Omni Flash = 8 сек = макс 20 слов):
            </div>
            {scriptLineStats.map((s, i) => s && (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '2px 4px',
                borderRadius: '3px',
                backgroundColor: s.tooLong ? 'rgba(255,68,68,0.15)' : 'transparent',
                marginBottom: '1px'
              }}>
                <span style={{
                  minWidth: '50px',
                  color: s.tooLong ? '#ff4444' : s.words > 15 ? '#ffaa00' : '#4caf50',
                  fontWeight: 'bold'
                }}>
                  {s.words}w {s.tooLong ? '❌' : s.words > 15 ? '⚠️' : '✓'}
                </span>
                <span style={{
                  color: s.tooLong ? '#ff8888' : '#888',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1
                }}>
                  {s.line.substring(0, 70)}{s.line.length > 70 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder={`Format:\nName1: Short hook line...\nName2: Reply max 20 words...`}
          style={{ flex: 1, backgroundColor: '#333', color: '#fff', border: `1px solid ${hasOverlongLines ? '#ff4444' : '#555'}`, padding: '10px', minHeight: '180px', fontFamily: 'monospace', fontSize: '13px' }}
        />
        
        {/* ── SEGMENT GENERATION PANEL ──────────────────── */}
        {segments.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            {/* Control row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  🎬 Клипы: {segments.filter(s => s.status === 'done').length} / {segments.length} готово
                </span>
              </div>
              <button
                onClick={handleAutoGenerateAll}
                disabled={isAutoRunning}
                style={{
                  padding: '9px 18px',
                  background: isAutoRunning ? '#333' : 'linear-gradient(90deg,#16a34a,#15803d)',
                  color: '#fff', border: 'none', borderRadius: '7px',
                  cursor: isAutoRunning ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold', fontSize: '13px',
                  display: 'flex', alignItems: 'center', gap: '7px'
                }}
              >
                {isAutoRunning ? '⏳ Генерация...' : '▶▶ Auto — Генерировать все'}
              </button>
              {isAutoRunning && (
                <button
                  onClick={() => { stopAutoRef.current = true; setIsAutoRunning(false); }}
                  style={{ padding: '9px 14px', backgroundColor: '#7f1d1d', color: '#fff', border: 'none', borderRadius: '7px', cursor: 'pointer' }}
                >
                  ⏹ Стоп
                </button>
              )}
            </div>

            {/* Segment cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {segments.map(seg => (
                <div key={seg.index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  backgroundColor: seg.status === 'done' ? '#1a2e1a' : seg.status === 'error' ? '#2e1a1a' : '#1e1e2e',
                  border: `1px solid ${seg.status === 'done' ? '#2d5a2d' : seg.status === 'error' ? '#7f1d1d' : '#333'}`,
                  borderRadius: '8px'
                }}>
                  {/* Index + speaker badge */}
                  <div style={{ minWidth: '26px', textAlign: 'center', fontSize: '11px', color: '#666' }}>
                    {seg.index + 1}
                  </div>
                  <div style={{
                    minWidth: '70px', padding: '3px 8px', borderRadius: '12px', fontSize: '11px',
                    backgroundColor: seg.speakerId === host1 ? '#1e3a5f' : '#3a1e5f',
                    color: seg.speakerId === host1 ? '#60a5fa' : '#c084fc',
                    textAlign: 'center', fontWeight: 'bold'
                  }}>
                    {seg.speakerName}
                  </div>

                  {/* Word count */}
                  <div style={{
                    minWidth: '40px', fontSize: '11px', textAlign: 'center',
                    color: seg.words > 20 ? '#ff4444' : seg.words > 15 ? '#ffaa00' : '#4caf50',
                    fontWeight: 'bold'
                  }}>
                    {seg.words}w
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={seg.text}>
                      {seg.text}
                    </div>
                    {seg.translationRu && (
                      <div style={{ fontSize: '11px', color: '#a7f3d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={seg.translationRu}>
                        🇷🇺 {seg.translationRu}
                      </div>
                    )}
                  </div>

                  {/* Video thumbnail */}
                  {seg.status === 'done' && seg.videoBase64 && (
                    <div
                      onClick={() => setPreviewVideo(seg.videoBase64!)}
                      style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}
                      title="Нажмите для просмотра"
                    >
                      <video
                        src={seg.videoBase64}
                        style={{ width: '80px', height: '45px', objectFit: 'cover', borderRadius: '4px', border: '2px solid #2d5a2d' }}
                        muted
                      />
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '18px', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: '4px'
                      }}>▶</div>
                    </div>
                  )}

                  {/* Status / Generate button */}
                  {seg.status === 'generating' ? (
                    <div style={{ fontSize: '12px', color: '#60a5fa', minWidth: '90px', textAlign: 'center' }}>
                      ⏳ Генерация...
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                      {seg.status === 'done' ? (
                        <button
                          onClick={() => handleGenerateSegment(seg)}
                          style={{ padding: '5px 10px', backgroundColor: '#444', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}
                          title="Перегенерировать"
                        >
                          🔄
                        </button>
                      ) : (
                        <button
                          onClick={() => handleGenerateSegment(seg)}
                          style={{ padding: '5px 12px', backgroundColor: '#007acc', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                        >
                          ▶ Создать
                        </button>
                      )}
                    </div>
                  )}

                  {seg.status === 'error' && (
                    <div style={{ fontSize: '11px', color: '#ff8888', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={seg.errorMsg}>
                      ❌ {seg.errorMsg?.substring(0, 30)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {segments.length === 0 && script.trim() && (
          <div style={{ marginTop: '15px', color: '#666', fontSize: '13px' }}>
            ⚠️ Выберите обоих хостов чтобы увидеть карточки сегментов
          </div>
        )}
      </div>

    </div>
  );

  // ── Video Preview Modal ──────────────────────────────────────────
  const renderPreviewModal = () => previewVideo ? (
    <div
      onClick={() => setPreviewVideo(null)}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
        <video
          src={previewVideo}
          controls
          autoPlay
          style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: '10px', boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
        />
        <button
          onClick={() => setPreviewVideo(null)}
          style={{
            position: 'absolute', top: '-12px', right: '-12px',
            width: '30px', height: '30px', borderRadius: '50%',
            backgroundColor: '#ef4444', color: '#fff', border: 'none',
            cursor: 'pointer', fontSize: '16px', fontWeight: 'bold'
          }}
        >✕</button>
      </div>
    </div>
  ) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', color: '#eee' }}>
      
      {/* Sub Tabs */}
      <div style={{ display: 'flex', backgroundColor: '#111', padding: '10px 20px', gap: '15px' }}>
        <button 
          onClick={() => setSubTab('characters')}
          style={{ padding: '8px 16px', backgroundColor: subTab === 'characters' ? '#333' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          🦍 Characters Roster
        </button>
        <button 
          onClick={() => setSubTab('episode')}
          style={{ padding: '8px 16px', backgroundColor: subTab === 'episode' ? '#333' : 'transparent', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          🎬 Episode Generator
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {subTab === 'characters' ? renderCharactersTab() : renderEpisodeTab()}
      </div>

      {renderPreviewModal()}

    </div>
  );
};

export default PrimateCastTab;
