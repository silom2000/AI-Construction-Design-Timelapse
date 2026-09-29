import React, { useState, useEffect } from 'react';

const LLM_PROVIDERS = [
  { value: 'custom', label: 'Custom Proxy (Local)' },
  { value: 'omniroute', label: 'OmniRoute (Claude)' },
  { value: 'pollinations', label: 'Pollinations (Free)' },
];

const MARKETS = [
  { id: 'fr', flag: '🇫🇷', label: 'Français (France)', language: 'French', country: 'France' },
  { id: 'en-us', flag: '🇺🇸', label: 'English (USA)', language: 'English', country: 'United States' },
  { id: 'en-gb', flag: '🇬🇧', label: 'English (UK)', language: 'English', country: 'United Kingdom' },
  { id: 'de', flag: '🇩🇪', label: 'Deutsch', language: 'German', country: 'Germany' },
  { id: 'pl', flag: '🇵🇱', label: 'Polski (Polska)', language: 'Polish', country: 'Poland' },
];

const VIDEO_MODELS = [
  { value: 'omni_flash', label: '✦ Omni Flash' },
  { value: 'veo_31_fast', label: '▸ Veo 3.1 Fast' },
];

const IMAGE_MODELS = [
  { value: 'nano_banana_2', label: 'Nano Banana 2' },
  { value: 'nano_banana_pro', label: 'Nano Banana Pro' },
  { value: 'nano_banana_2_lite', label: 'Nano Banana 2 Lite' },
];

type SegmentRole = 'blogger' | 'stranger' | 'aside' | 'outro' | 'vlog_action' | 'vlog_comment';

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
  vlog_action: '#007acc',
  vlog_comment: '#c0722a',
};

const ROLE_LABELS: Record<SegmentRole, string> = {
  blogger: '🎤 Blogger',
  stranger: '🗣 Stranger',
  aside: '💬 Aside',
  outro: '🎬 Outro',
  vlog_action: '🎬 Vlog Action',
  vlog_comment: '💬 Girl Secret',
};

const FrenchTalkTab: React.FC = () => {
  const [subTab, setSubTab] = useState<'blogger' | 'episode' | 'vlog' | 'stream_pack'>('blogger');
  const [llmProvider, setLlmProvider] = useState('custom');
  const [imageModel, setImageModel] = useState<'nano_banana_2' | 'nano_banana_pro' | 'grok'>('nano_banana_2');
  const [videoModel, setVideoModel] = useState<'omni_flash' | 'veo_31_fast'>('omni_flash');

  // Stream Pack state
  const [selectedStreamDay, setSelectedStreamDay] = useState<string>('Monday');
  const [streamPacks, setStreamPacks] = useState<Record<string, any>>({});
  const [streamDaysInfo, setStreamDaysInfo] = useState<Record<string, any>>({});
  const [isGeneratingStreamPack, setIsGeneratingStreamPack] = useState(false);
  const [streamAutoRunning, setStreamAutoRunning] = useState(false);
  const [generatingImageType, setGeneratingImageType] = useState<string | null>(null);
  const stopStreamAutoRef = React.useRef(false);

  // Blogger state
  const [blogger, setBlogger] = useState<any>(null);
  const [bloggerPrompt, setBloggerPrompt] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [generatedIdea, setGeneratedIdea] = useState<any>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{ imagePath: string; base64: string } | null>(null);

  // Episode state
  const [bloggerOutfit, setBloggerOutfit] = useState('');
  const [customBloggerOutfit, setCustomBloggerOutfit] = useState('');
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
  const [isTranslating, setIsTranslating] = useState(false);
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
  const [autoStatus, setAutoStatus] = useState('');
  const stopAutoRef = React.useRef(false);
  const [previewVideo, setPreviewVideo] = useState<string | null>(null);

  // Vlog state
  const [vlogLocation, setVlogLocation] = useState('Paris Studio Apartment - Living Room');
  const [vlogOutfit, setVlogOutfit] = useState('Cozy Homewear / Loungewear');
  const [customVlogOutfit, setCustomVlogOutfit] = useState('');
  const [vlogTopic, setVlogTopic] = useState('beauty_secret');
  const [customVlogTopic, setCustomVlogTopic] = useState('');
  const [useWebSearchVlog, setUseWebSearchVlog] = useState(false);
  const [vlogReferenceUrl, setVlogReferenceUrl] = useState('');
  const [vlogScreenshotBase64, setVlogScreenshotBase64] = useState<string | null>(null);
  const [vlogVideoBase64, setVlogVideoBase64] = useState<string | null>(null);
  const vlogFileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isGeneratingLocationRef, setIsGeneratingLocationRef] = useState(false);
  const [locationRefs, setLocationRefs] = useState<Array<{ name: string; path: string; url: string; base64: string }>>([]);
  const [isGeneratingVlogScript, setIsGeneratingVlogScript] = useState(false);
  const [vlogScript, setVlogScript] = useState('');
  const [vlogMetadata, setVlogMetadata] = useState<{ title: string; description: string; hashtags: string } | null>(null);
  const [vlogSegments, setVlogSegments] = useState<SegmentState[]>([]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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

  const loadLocationRefs = async () => {
    try {
      const refs = await window.electronAPI.frenchtalkGetLocationRefs();
      setLocationRefs(refs);
    } catch (e) {}
  };

  const loadStreamPacks = async () => {
    try {
      const res = await window.electronAPI.frenchtalkGetStreamPacks();
      if (res && res.packs) {
        setStreamPacks(res.packs);
        setStreamDaysInfo(res.daysInfo || {});
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadBlogger();
    loadLocationRefs();
    loadStreamPacks();
    window.electronAPI.onFrenchTalkProgress((data: { status: string; progress?: number }) => {
      if (data.status) setStatus(data.status);
    });
    return () => { window.electronAPI.removeFrenchTalkProgressListener(); };
  }, []);

  // Parse script → segments
  React.useEffect(() => {
    if (!script) { setSegments([]); return; }
    const bloggerName = blogger?.name || 'Camille';

    const parsed: SegmentState[] = [];
    script.split('\n').map(l => l.trim()).filter(l => l.length > 0).forEach(cleanLine => {
      const match = cleanLine.match(/^([^:]+):\s*(.*)$/);
      if (!match) return;
      const speaker = match[1].trim();
      const text = match[2].trim();
      if (!text) return;

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

  // Clipboard paste listener for Screenshots & Videos (Ctrl+V)
  React.useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const b64 = event.target?.result as string;
              setVlogScreenshotBase64(b64);
              setVlogVideoBase64(null);
            };
            reader.readAsDataURL(blob);
          }
          break;
        } else if (item.type.indexOf('video') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const b64 = event.target?.result as string;
              setVlogVideoBase64(b64);
              setVlogScreenshotBase64(null);
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const handleVlogFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name);
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const b64 = event.target?.result as string;
      if (isVideo) {
        setVlogVideoBase64(b64);
        setVlogScreenshotBase64(null);
      } else if (isImage) {
        setVlogScreenshotBase64(b64);
        setVlogVideoBase64(null);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const pasteVlogUrlFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setVlogReferenceUrl(text.trim());
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };
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

      const cleanScript = (result.script || '').replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
      setScript(cleanScript);
      setEpisodeTitle('FT_' + result.topicEn.replace(/[^a-z0-9]/gi, '_').substring(0, 30));
      setAutoTopicResult({ topic: result.topic, topicEn: result.topicEn, topicRu: result.topicRu, hook: result.hook, hookRu: result.hookRu, question: result.question });

      if (result.scriptRu) {
        processScriptTranslation(cleanScript, result.scriptRu);
      }

      setStatus('');
    } catch (e: any) {
      alert('Ошибка Auto Topic: ' + e.message);
      setStatus('');
    } finally {
      setIsAutoTopic(false);
    }
  };

  const processScriptTranslation = (scriptFr: string, scriptRu: string) => {
    const cleanScriptRu = scriptRu.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
    const origLines = scriptFr.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.includes(':'));
    const transLines = cleanScriptRu.split('\n').map(l => l.trim()).filter(l => l.length > 0 && (l.includes(':') || l.length > 3));
    const newMap: Record<string, string> = {};
    origLines.forEach((line: string, idx: number) => {
      const origM = line.match(/^([^:]+):\s*(.*)$/);
      if (!origM) return;
      const transLine = transLines[idx];
      if (transLine) {
        const transM = transLine.match(/^([^:]+):\s*(.*)$/);
        const ruText = transM ? transM[2].trim() : transLine.replace(/^[^:]+:\s*/, '').trim();
        newMap[origM[2].trim()] = ruText;
      }
    });
    setTranslationsMap(prev => ({ ...prev, ...newMap }));
  };

  const handleTranslateScript = async () => {
    if (!script) return;
    setIsTranslating(true);
    try {
      const res = await window.electronAPI.frenchtalkTranslateScript({
        script,
        bloggerName: blogger?.name || 'Camille'
      });
      if (res && res.scriptRu) {
        processScriptTranslation(script, res.scriptRu);
      }
    } catch (err: any) {
      alert('Ошибка перевода: ' + err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  const updateSegment = (index: number, updates: Partial<SegmentState>) => {
    if (subTab === 'vlog') {
      setVlogSegments(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s));
    } else {
      setSegments(prev => prev.map(s => s.index === index ? { ...s, ...updates } : s));
    }
  };

  const handleGenerateSegment = async (seg: SegmentState) => {
    if (!blogger || !episodeTitle) { alert('Заполните Episode Title и создайте блогера!'); return; }
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    const isVlog = subTab === 'vlog';
    updateSegment(seg.index, { status: 'generating', errorMsg: undefined });
    try {
      const activeSegments = isVlog ? vlogSegments : segments;
      const fullScript = activeSegments.map(s => `${s.speakerLabel}: ${s.text}`).join('\n');
      const result = await window.electronAPI.frenchtalkGenerateSegment({
        segmentIndex: seg.index,
        role: seg.role,
        dialogueText: seg.text,
        speakerLabel: seg.speakerLabel,
        bloggerOutfit: isVlog ? (vlogOutfit === 'custom' ? customVlogOutfit : vlogOutfit) : (bloggerOutfit === 'custom' ? customBloggerOutfit : bloggerOutfit),
        location: isVlog ? vlogLocation : location,
        episodeTitle,
        aspectRatio,
        language: market.language,
        videoModel,
        strangerDescription,
        strangerVoiceDescription,
        strangerRefBase64: strangerRefBase64 || undefined,
        fullScript
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
    const targetSegments = subTab === 'vlog' ? vlogSegments : segments;
    const effectiveOutfit = subTab === 'vlog'
      ? (vlogOutfit === 'custom' ? customVlogOutfit : vlogOutfit)
      : (bloggerOutfit === 'custom' ? customBloggerOutfit : bloggerOutfit);
    try {
      // Step 1: сбрасываем старый кэш outfit
      setAutoStatus('🔄 Сбрасываю кэш образа...');
      if (window.electronAPI?.frenchtalkResetOutfitCache) {
        await window.electronAPI.frenchtalkResetOutfitCache({ episodeTitle, bloggerOutfit: effectiveOutfit, aspectRatio });
      }
      if (stopAutoRef.current) return;

      // Step 2: генерируем НОВУЮ картинку блогера в новой одежде как отдельный шаг
      // Эта картинка сохраняется в кэш и станет референсом для ВСЕХ видео
      setAutoStatus('📸 Генерирую образ блогера...');
      if (window.electronAPI?.frenchtalkGenerateOutfitReference) {
        try {
          await window.electronAPI.frenchtalkGenerateOutfitReference({ episodeTitle, bloggerOutfit: effectiveOutfit, aspectRatio });
        } catch (outfitErr: any) {
          const proceed = window.confirm(`⚠️ Не удалось создать образ блогера: ${outfitErr.message}\n\nПродолжить генерацию видео без нового референса?`);
          if (!proceed || stopAutoRef.current) return;
        }
      }
      if (stopAutoRef.current) return;

      // Step 3: все видео-сегменты запускаем параллельно — кэш образа блогера уже готов
      setAutoStatus('🎬 Генерирую клипы...');
      await Promise.all(
        targetSegments.map(async (seg) => {
          if (stopAutoRef.current) return;
          await handleGenerateSegment(seg);
        })
      );
    } finally {
      setIsAutoRunning(false);
      setAutoStatus('');
    }
  };

  const handleGenerateStreamScript = async (day: string) => {
    setIsGeneratingStreamPack(true);
    try {
      const res = await window.electronAPI.frenchtalkGenerateStreamPackScript({ day });
      setStreamPacks(prev => ({ ...prev, [day]: res }));
    } catch (e: any) {
      alert('Ошибка создания пака: ' + e.message);
    } finally {
      setIsGeneratingStreamPack(false);
    }
  };

  const handleGenerateStreamImage = async (day: string, type: 'room' | 'scene') => {
    if (generatingImageType) return;
    try {
      setGeneratingImageType(type);
      const res = await window.electronAPI.frenchtalkGenerateStreamPackImage({ day, type });
      if (res && res.success) {
        setStreamDaysInfo(prev => ({
          ...prev,
          [day]: {
            ...(prev[day] || {}),
            ...(res.bgRoomBase64 ? { bgRoomBase64: res.bgRoomBase64 } : {}),
            ...(res.sceneBase64 ? { sceneBase64: res.sceneBase64 } : {})
          }
        }));
      }
    } catch (e: any) {
      alert(`Ошибка при генерации картинки (${type === 'room' ? 'комната' : 'сцена'}): ${e.message || e}`);
    } finally {
      setGeneratingImageType(null);
    }
  };

  const updateStreamClipStatus = (day: string, clipIndex: number, updates: any) => {
    setStreamPacks(prev => {
      const pack = prev[day];
      if (!pack || !pack.clips) return prev;
      const updatedClips = pack.clips.map((c: any) => c.index === clipIndex ? { ...c, ...updates } : c);
      return { ...prev, [day]: { ...pack, clips: updatedClips } };
    });
  };

  const handleGenerateStreamClip = async (day: string, clip: any) => {
    updateStreamClipStatus(day, clip.index, { status: 'generating' });
    try {
      const result = await window.electronAPI.frenchtalkGenerateStreamPackClip({
        day,
        clipIndex: clip.index,
        videoModel,
        aspectRatio
      });
      updateStreamClipStatus(day, clip.index, { status: 'done', videoPath: result.videoPath, videoBase64: result.videoBase64 });
    } catch (e: any) {
      updateStreamClipStatus(day, clip.index, { status: 'error' });
      alert('Ошибка генерации клипа №' + (clip.index + 1) + ': ' + e.message);
    }
  };

  const handleAutoGenerateStreamPack = async (day: string) => {
    const pack = streamPacks[day];
    if (!pack || !pack.clips) return;
    stopStreamAutoRef.current = false;
    setStreamAutoRunning(true);
    for (const clip of pack.clips) {
      if (stopStreamAutoRef.current) break;
      if (clip.status === 'done') continue;
      await handleGenerateStreamClip(day, clip);
      await new Promise(r => setTimeout(r, 500));
    }
    setStreamAutoRunning(false);
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
            <img src={generatedImage.base64} alt="Base" onClick={() => setLightboxImage(generatedImage.base64)} style={{ width: '100%', borderRadius: '8px', maxHeight: '400px', objectFit: 'cover', cursor: 'pointer' }} />
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
                <img src={blogger.base64} alt={blogger.name} onClick={() => setLightboxImage(blogger.base64)} style={{ width: '120px', height: '160px', objectFit: 'cover', borderRadius: '8px', border: '2px solid #7c4dff', cursor: 'pointer' }} />
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
          <select value={bloggerOutfit} onChange={e => setBloggerOutfit(e.target.value)}
            style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', marginBottom: bloggerOutfit === 'custom' ? '8px' : '0' }}>
            {OUTFIT_PRESETS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {bloggerOutfit === 'custom' && (
            <input value={customBloggerOutfit} onChange={e => setCustomBloggerOutfit(e.target.value)}
              placeholder="Опишите одежду (на английском)..."
              style={{ width: '100%', padding: '7px 10px', backgroundColor: '#252535', color: '#fff', border: '1px solid #e8c4a0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
            />
          )}
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>Video Model</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {VIDEO_MODELS.map(m => (
              <button key={m.value} onClick={() => setVideoModel(m.value as any)} style={{
                padding: '7px 14px', backgroundColor: videoModel === m.value ? '#7c4dff' : '#252535',
                color: videoModel === m.value ? '#fff' : '#aaa', border: videoModel === m.value ? '1px solid #9d6fff' : '1px solid #444',
                borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: videoModel === m.value ? 'bold' : 'normal',
                transition: 'all 0.2s ease'
              }}>{m.label}</button>
            ))}
          </div>
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
                  onClick={() => setLightboxImage(generatedStrangerPreview)}
                  style={{ width: '80px', height: '107px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #5a3a9a', flexShrink: 0, cursor: 'pointer' }}
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
              <button
                disabled={!script || isTranslating}
                onClick={handleTranslateScript}
                style={{
                  padding: '7px 14px', backgroundColor: '#6a1b9a', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: !script || isTranslating ? 'not-allowed' : 'pointer', fontSize: '12px', fontWeight: 'bold'
                }}
              >
                {isTranslating ? '⏳ Перевожу...' : '🌐 Перевести на русский'}
              </button>
              {!isAutoRunning ? (
                <button onClick={handleAutoGenerateAll} style={{
                  padding: '7px 14px', backgroundColor: '#007acc', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                }}>⚡ Авто-генерация всех</button>
              ) : (
                <>
                  {autoStatus && <span style={{ fontSize: '11px', color: '#aaa', alignSelf: 'center' }}>{autoStatus}</span>}
                  <button onClick={() => { stopAutoRef.current = true; setIsAutoRunning(false); }} style={{
                    padding: '7px 14px', backgroundColor: '#cc3333', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                  }}>⛔ Стоп</button>
                </>
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
                    <div style={{ fontSize: '11px', color: '#ffb3da', fontStyle: 'italic', marginTop: '2px' }}>🇷🇺 {seg.translationRu}</div>
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

  const OUTFIT_PRESETS = [
    { value: 'Cozy Homewear / Loungewear', label: '🏠 Домашний уютный комплект (Loungewear)' },
    { value: 'Casual Cooking Top & Apron', label: '🍳 Фартук поверх стильного топа (Готовка)' },
    { value: 'Gym Activewear (Leggings & Sports Top)', label: '🏋️‍♀️ Спортивный костюм (Легинсы и топ)' },
    { value: 'Tennis Outfit (Sporty Skirt & Polo)', label: '🎾 Теннисный комплект (Юбка и поло)' },
    { value: 'One-piece Swimsuit (Закрытый купальник)', label: '🏊‍♀️ Закрытый купальник для бассейна' },
    { value: 'Chic Parisian Evening Dress', label: '👗 Элегантное вечернее платье' },
    { value: 'custom', label: '✏️ Свой вариант...' },
  ];

  const LOCATION_PRESETS = [
    { value: 'Paris Studio Apartment - Living Room', label: '🛋 Квартира-студия в Париже — Гостиная' },
    { value: 'Paris Studio Apartment - Kitchen', label: '🍳 Квартира-студия в Париже — Кухня' },
    { value: 'Fitness Gym Interior', label: '🏋️‍♀️ Спортивный зал / Фитнес-клуб' },
    { value: 'Outdoor Tennis Court', label: '🎾 Открытый теннисный корт' },
    { value: 'Luxury Swimming Poolside', label: '🏊‍♀️ Бассейн / Зона отдыха у воды' },
  ];

  const VLOG_TOPIC_PRESETS = [
    { value: 'beauty_secret', label: '💅 Девичьи секреты и уход ("Секрет утренней свежести")' },
    { value: 'cooking', label: '🍳 Готовка и рецепт ("Секретный парижский десерт")' },
    { value: 'gym_workout', label: '🏋️‍♀️ Фитнес-влог ("Моя тренировка в зале")' },
    { value: 'tennis_match', label: '🎾 Теннис ("Учимся подаче и стильный аутфит")' },
    { value: 'pool_day', label: '🏊‍♀️ День у бассейна ("Отдых и мои мысли обо всем")' },
    { value: 'custom', label: '✏️ Своя тема...' },
  ];

  const handleGenerateLocationRef = async () => {
    setIsGeneratingLocationRef(true);
    try {
      const prompt = `A photorealistic interior or exterior shot of ${vlogLocation}, high end aesthetic design, warm natural lighting, 9:16 portrait.`;
      await window.electronAPI.frenchtalkGenerateLocationRef({
        locationName: vlogLocation,
        visualPrompt: prompt,
        model: imageModel
      });
      await loadLocationRefs();
    } catch (e: any) {
      alert('Ошибка генерации локации: ' + e.message);
    } finally {
      setIsGeneratingLocationRef(false);
    }
  };

  const handleGenerateVlogScript = async () => {
    if (!blogger) { alert('Сначала создайте и сохраните блогера!'); return; }
    const market = MARKETS.find(m => m.id === selectedMarket)!;
    setIsGeneratingVlogScript(true);
    try {
      const effectiveOutfit = vlogOutfit === 'custom' ? customVlogOutfit : vlogOutfit;
      const effectiveTopic = vlogTopic === 'custom' ? customVlogTopic : vlogTopic;

      // Detect recipe URL (russianfood.com and similar food sites — not social media)
      const isRecipeUrl = vlogReferenceUrl &&
        /^https?:\/\//i.test(vlogReferenceUrl) &&
        !/(tiktok|instagram|facebook|fb\.com|reels|shorts|youtube)/i.test(vlogReferenceUrl);

      let recipeCustomInput = customVlogTopic;
      let recipeImages: string[] = [];
      if (isRecipeUrl) {
        try {
          const parsed = await window.electronAPI.frenchtalkParseRecipe({ url: vlogReferenceUrl });
          if (parsed && parsed.title) {
            const ingredientsList = parsed.ingredients.join(', ');
            const stepsList = parsed.steps.map((s, i) => `Шаг ${i + 1}: ${s}`).join(' | ');
            recipeCustomInput = `РЕЦЕПТ: "${parsed.title}". ИНГРЕДИЕНТЫ: ${ingredientsList}. ПРИГОТОВЛЕНИЕ: ${stepsList}. Порции: ${parsed.servings || '?'}. Время: ${parsed.time || '?'}.`;
            recipeImages = parsed.images.slice(0, 5);
            console.log(`[FrenchTalk] Recipe parsed: ${parsed.title}, ${parsed.ingredients.length} ingredients, ${parsed.steps.length} steps, ${recipeImages.length} images`);
          }
        } catch (parseErr: unknown) {
          console.warn('[FrenchTalk] Recipe parse failed, continuing without it:', parseErr);
        }
      }

      const result = await window.electronAPI.frenchtalkAutoVlogTopic({
        language: market.language,
        country: market.country,
        bloggerName: blogger.name,
        vlogTopic: effectiveTopic,
        outfit: effectiveOutfit,
        location: vlogLocation,
        customInput: isRecipeUrl ? recipeCustomInput : customVlogTopic,
        useWebSearch: useWebSearchVlog,
        referenceUrl: isRecipeUrl ? undefined : (vlogReferenceUrl || undefined),
        screenshotBase64: vlogScreenshotBase64 || undefined,
        videoBase64: vlogVideoBase64 || undefined
      });

      setVlogScript(result.script);
      setVlogMetadata(result.metadata || null);
      setEpisodeTitle('Vlog_' + vlogLocation.replace(/[^a-z0-9]/gi, '_').substring(0, 18) + '_' + Date.now().toString().slice(-4));

      // Clean markdown blocks
      const cleanScript = result.script.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();
      const cleanScriptRu = (result.scriptRu || '').replace(/```[a-z]*\n?/gi, '').replace(/```\n?/gi, '').trim();

      // Highly permissive regex to catch roles even if LLM uses dashes, markdown, or forgets colons
      const roleRegex = /^.*?((?:vlog\s*)?action|(?:blogger\s*)?comment|outro|girl\s*secret|секрет|комментарий|действие)s?\b[^a-zA-Z0-9А-Яа-я"']*(.*)$/i;

      const parsedLines = cleanScript.split('\n').map(l => l.trim()).filter(l => roleRegex.test(l));
      const parsedRuLines = cleanScriptRu.split('\n').map(l => l.trim()).filter(l => roleRegex.test(l));
      const rawRuLines = cleanScriptRu.split('\n').map(l => l.trim()).filter(l => l && l.length > 5);

      const parsed: SegmentState[] = [];
      
      parsedLines.forEach((l, idx) => {
        const match = l.match(roleRegex);
        if (!match) return;
        
        const rawRole = match[1].toLowerCase();
        let text = match[2].trim();
        // Strip surrounding quotes if the LLM added them
        text = text.replace(/^["'](.*)["']$/, '$1').trim();

        let translationRu = '';
        if (parsedRuLines[idx]) {
          const ruMatch = parsedRuLines[idx].match(roleRegex);
          if (ruMatch) {
              translationRu = ruMatch[2].replace(/^["'](.*)["']$/, '$1').trim();
          }
        } 
        
        if (!translationRu && rawRuLines[idx]) {
            // Fallback if Russian translation didn't use the role prefix at all
            const ruMatch = rawRuLines[idx].match(roleRegex);
            translationRu = ruMatch ? ruMatch[2].replace(/^["'](.*)["']$/, '$1').trim() : rawRuLines[idx].replace(/^["'](.*)["']$/, '$1').trim();
        }

        let role: SegmentRole = 'vlog_comment';
        let speaker = 'Blogger Comment';
        
        if (rawRole.includes('action') || rawRole.includes('действие')) {
            role = 'vlog_action';
            speaker = 'Vlog Action';
        } else if (rawRole.includes('outro') || rawRole.includes('аутро')) {
            role = 'outro';
            speaker = 'Outro';
        }

        parsed.push({
          index: idx,
          role,
          speakerLabel: speaker,
          text,
          translationRu,
          words: text.split(/\s+/).length,
          status: 'idle'
        });
      });
      setVlogSegments(parsed);
    } catch (e: any) {
      alert('Ошибка генерации влог-сценария: ' + e.message);
    } finally {
      setIsGeneratingVlogScript(false);
    }
  };

  const handleVlogReset = () => {
    setVlogLocation('Paris Studio Apartment - Living Room');
    setVlogOutfit('Cozy Homewear / Loungewear');
    setCustomVlogOutfit('');
    setVlogTopic('beauty_secret');
    setCustomVlogTopic('');
    setUseWebSearchVlog(false);
    setVlogReferenceUrl('');
    setVlogScreenshotBase64(null);
    setVlogVideoBase64(null);
    setVlogScript('');
    setVlogMetadata(null);
    setVlogSegments([]);
  };

  const renderVlogTab = () => (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '20px', gap: '16px' }}>

      {/* VLOG GENERATION PANEL */}
      <div style={{
        background: 'linear-gradient(135deg, #2e0a24 0%, #4e1b3e 50%, #2e0a24 100%)',
        border: '1px solid #7a2a6a', borderRadius: '12px', padding: '18px', marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, color: '#f8c4e0', fontSize: '15px' }}>💅 Life & Girl Secrets — Личный Влог Блогера</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: '#ffb3da' }}>Локации студии, рецепты, фитнес, теннис & бассейн</div>
            <button
              onClick={handleVlogReset}
              title="Сбросить все настройки и результаты"
              style={{
                padding: '5px 12px', backgroundColor: 'transparent', color: '#ffb3da',
                border: '1px solid #7a2a6a', borderRadius: '6px', cursor: 'pointer',
                fontSize: '12px', whiteSpace: 'nowrap', transition: 'all 0.15s'
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4e1b3e'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
            >🔄 Reset</button>
          </div>
        </div>

        {/* Location & References */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={{ flex: 1, minWidth: '180px' }}>
            <label style={{ fontSize: '12px', color: '#ffb3da', display: 'block', marginBottom: '4px' }}>🌐 Язык сценария и озвучки:</label>
            <select value={selectedMarket} onChange={e => setSelectedMarket(e.target.value)} style={{
              width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px'
            }}>
              {MARKETS.map(m => (
                <option key={m.id} value={m.id}>{m.flag} {m.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '12px', color: '#ffb3da', display: 'block', marginBottom: '4px' }}>📍 Выберите локацию съемок:</label>
            <select value={vlogLocation} onChange={e => setVlogLocation(e.target.value)} style={{
              width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px'
            }}>
              {LOCATION_PRESETS.map(loc => (
                <option key={loc.value} value={loc.value}>{loc.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '12px', color: '#ffb3da', display: 'block', marginBottom: '4px' }}>👗 Выберите аутфит блогера:</label>
            <select value={vlogOutfit} onChange={e => setVlogOutfit(e.target.value)} style={{
              width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px'
            }}>
              {OUTFIT_PRESETS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '220px' }}>
            <label style={{ fontSize: '12px', color: '#ffb3da', display: 'block', marginBottom: '4px' }}>💡 Тема влога / Секрет:</label>
            <select value={vlogTopic} onChange={e => setVlogTopic(e.target.value)} style={{
              width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px'
            }}>
              {VLOG_TOPIC_PRESETS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', cursor: 'pointer', fontSize: '11px', color: '#ffb3da' }}>
              <input type="checkbox" checked={useWebSearchVlog} onChange={e => setUseWebSearchVlog(e.target.checked)} />
              <span>🔍 Искать свежие рецепты/тренды в сети</span>
            </label>
          </div>
        </div>

        {vlogOutfit === 'custom' && (
          <div style={{ marginBottom: '14px' }}>
            <input type="text" value={customVlogOutfit} onChange={e => setCustomVlogOutfit(e.target.value)}
              placeholder="Введите описание одежды (например: бежевый свитшот и джинсы)..."
              style={{ width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        )}

        {vlogTopic === 'custom' && (
          <div style={{ marginBottom: '14px' }}>
            <input type="text" value={customVlogTopic} onChange={e => setCustomVlogTopic(e.target.value)}
              placeholder="Введите тему влога (например: Готовим французские круассаны и секрет выпечки)..."
              style={{ width: '100%', padding: '8px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #7a2a6a', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>
        )}

        {/* ─── Multimodal Reference Panel ─── */}
        <div style={{ backgroundColor: '#1a0528', padding: '12px', borderRadius: '8px', border: '1px solid #6a1e5d', marginBottom: '14px' }}>
          <div style={{ fontSize: '12px', color: '#e8c4a0', fontWeight: 'bold', marginBottom: '8px' }}>
            🌐 Референс из сети (TikTok / Reels / Shorts / Facebook) или рецептный сайт (russianfood.com и др.)
          </div>

          {/* URL row */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <input
              type="text"
              value={vlogReferenceUrl}
              onChange={e => setVlogReferenceUrl(e.target.value)}
              placeholder="Вставьте ссылку на TikTok, Reels, Shorts, Facebook или рецептный сайт (russianfood.com и др.)..."
              style={{ flex: 1, padding: '7px 10px', backgroundColor: '#3e1635', color: '#fff', border: vlogReferenceUrl ? '1px solid #3b82f6' : '1px solid #7a2a6a', borderRadius: '6px', fontSize: '12px' }}
            />
            <button
              onClick={pasteVlogUrlFromClipboard}
              style={{ padding: '7px 12px', backgroundColor: '#3e1635', color: '#ccc', border: '1px solid #7a2a6a', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}
            >📋 Вставить</button>
            {vlogReferenceUrl && (
              <button
                onClick={() => setVlogReferenceUrl('')}
                style={{ padding: '7px 10px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7a2a6a', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
              >✕</button>
            )}
          </div>

          {/* File upload row */}
          <input
            type="file"
            ref={vlogFileInputRef}
            onChange={handleVlogFileUpload}
            accept="image/*,video/*,.mp4,.mov,.webm,.avi,.mkv"
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => vlogFileInputRef.current?.click()}
              style={{ padding: '7px 12px', backgroundColor: '#3e1635', color: '#ccc', border: '1px solid #7a2a6a', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}
            >📂 Загрузить файл</button>
            <span style={{ fontSize: '11px', color: '#888' }}>или нажмите Ctrl+V для вставки скриншота / видео из буфера</span>
          </div>

          {/* Preview of loaded screenshot/video */}
          {(vlogScreenshotBase64 || vlogVideoBase64) && (
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: '#2a0e24', padding: '8px', borderRadius: '6px', border: '1px solid #5a1e4d' }}>
              {vlogScreenshotBase64 && (
                <img
                  src={vlogScreenshotBase64}
                  alt="screenshot"
                  onClick={() => setLightboxImage(vlogScreenshotBase64)}
                  style={{ width: '48px', height: '64px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #7a2a6a', cursor: 'pointer', flexShrink: 0 }}
                />
              )}
              {vlogVideoBase64 && (
                <span style={{ fontSize: '22px', flexShrink: 0 }}>🎬</span>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 'bold' }}>
                  {vlogVideoBase64
                    ? '✓ Видеофайл загружен — STT + Vision AI извлекут речь и действия'
                    : '✓ Скриншот загружен — Vision OCR извлечёт весь текст и правила'}
                </div>
                <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
                  Будет адаптировано под блогера при генерации сценария
                </div>
              </div>
              <button
                onClick={() => { setVlogScreenshotBase64(null); setVlogVideoBase64(null); }}
                style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7a2a6a', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', flexShrink: 0 }}
              >Удалить</button>
            </div>
          )}

          {vlogReferenceUrl && (
            <div style={{ marginTop: '6px', fontSize: '10px', color: '#60a5fa' }}>
              {/(tiktok|instagram|facebook|fb\.com|reels|shorts|youtube)/i.test(vlogReferenceUrl)
                ? '✓ Ссылка будет скачана, транскрибирована и адаптирована под блогера'
                : '🍳 Рецептный сайт — ингредиенты и шаги будут автоматически извлечены для влога'}
            </div>
          )}
        </div>

        {/* Location Reference Gallery */}
        <div style={{ backgroundColor: '#250c20', padding: '12px', borderRadius: '8px', border: '1px solid #5a1e4d', marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: '#e8c4a0', fontWeight: 'bold' }}>🏠 Референсы интерьеров и локаций (Omni Flash Consistency)</span>
            <button onClick={handleGenerateLocationRef} disabled={isGeneratingLocationRef} style={{
              padding: '5px 12px', backgroundColor: isGeneratingLocationRef ? '#444' : '#e91e63', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
            }}>
              {isGeneratingLocationRef ? '⏳ Создаю интерьер...' : '🎨 Создать фото локации'}
            </button>
          </div>
          {locationRefs.length > 0 ? (
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
              {locationRefs.map(ref => (
                <div key={ref.name} style={{ flexShrink: 0, textAlign: 'center' }}>
                  <img src={ref.base64} alt={ref.name} onClick={() => setLightboxImage(ref.base64)} style={{ width: '70px', height: '100px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #7a2a6a', cursor: 'pointer' }} />
                  <div style={{ fontSize: '9px', color: '#aaa', width: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.name}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>Нет сохраненных фото локаций. Нажмите "Создать фото локации", чтобы сгенерировать интерьер студии/зала.</div>
          )}
        </div>

        <button onClick={handleGenerateVlogScript} disabled={isGeneratingVlogScript} style={{
          width: '100%', padding: '10px', backgroundColor: isGeneratingVlogScript ? '#444' : '#d81b60', color: '#fff',
          border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px'
        }}>
          {isGeneratingVlogScript ? '⏳ Пишу сценарий влога...' : '✨ Сгенерировать сценарий Влога'}
        </button>

        {vlogScript && (
          <div style={{ marginTop: '12px' }}>
            <textarea value={vlogScript} onChange={e => setVlogScript(e.target.value)}
              style={{ width: '100%', height: '80px', backgroundColor: '#250c20', color: '#f8c4e0', border: '1px solid #5a1e4d', borderRadius: '6px', padding: '8px', fontSize: '12px', boxSizing: 'border-box' }} />
          </div>
        )}

        {vlogMetadata && (
          <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#1a0515', border: '1px solid #7a2a6a', borderRadius: '8px' }}>
            <div style={{ fontSize: '12px', color: '#e8c4a0', fontWeight: 'bold', marginBottom: '8px' }}>📱 TikTok Метаданные (Копировать)</div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '10px', color: '#ffb3da', display: 'block', marginBottom: '2px' }}>Название (Title)</label>
                <div style={{ display: 'flex' }}>
                  <input type="text" readOnly value={vlogMetadata.title || ''} style={{ flex: 1, padding: '6px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '4px 0 0 4px', fontSize: '11px' }} />
                  <button onClick={() => navigator.clipboard.writeText(vlogMetadata.title || '')} style={{ padding: '6px 10px', backgroundColor: '#5a1e4d', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '11px' }}>Copy</button>
                </div>
              </div>
              
              <div style={{ flex: 2, minWidth: '300px' }}>
                <label style={{ fontSize: '10px', color: '#ffb3da', display: 'block', marginBottom: '2px' }}>Описание (Description)</label>
                <div style={{ display: 'flex' }}>
                  <input type="text" readOnly value={vlogMetadata.description || ''} style={{ flex: 1, padding: '6px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '4px 0 0 4px', fontSize: '11px' }} />
                  <button onClick={() => navigator.clipboard.writeText(vlogMetadata.description || '')} style={{ padding: '6px 10px', backgroundColor: '#5a1e4d', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '11px' }}>Copy</button>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '10px', color: '#ffb3da', display: 'block', marginBottom: '2px' }}>Хэштеги (Hashtags)</label>
                <div style={{ display: 'flex' }}>
                  <input type="text" readOnly value={vlogMetadata.hashtags || ''} style={{ flex: 1, padding: '6px', backgroundColor: '#3e1635', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '4px 0 0 4px', fontSize: '11px' }} />
                  <button onClick={() => navigator.clipboard.writeText(vlogMetadata.hashtags || '')} style={{ padding: '6px 10px', backgroundColor: '#5a1e4d', color: '#fff', border: '1px solid #5a1e4d', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '11px' }}>Copy</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* VLOG SEGMENTS RENDER */}
      {vlogSegments.length > 0 && (
        <div style={{ backgroundColor: '#151520', borderRadius: '10px', padding: '16px', border: '1px solid #3a1a4e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', color: '#f8c4e0', fontWeight: 'bold' }}>
              🎬 Генерация влог-клипов — {vlogSegments.length} сцен
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#888', alignSelf: 'center' }}>
                {vlogSegments.filter(s => s.status === 'done').length}/{vlogSegments.length} готово
              </span>
              {!isAutoRunning ? (
                <button onClick={handleAutoGenerateAll} style={{
                  padding: '7px 14px', backgroundColor: '#e91e63', color: '#fff',
                  border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                }}>⚡ Авто-генерация всех</button>
              ) : (
                <>
                  {autoStatus && <span style={{ fontSize: '11px', color: '#aaa', alignSelf: 'center' }}>{autoStatus}</span>}
                  <button onClick={() => { stopAutoRef.current = true; setIsAutoRunning(false); }} style={{
                    padding: '7px 14px', backgroundColor: '#cc3333', color: '#fff',
                    border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
                  }}>⛔ Стоп</button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {vlogSegments.map(seg => (
              <div key={seg.index} style={{
                display: 'flex', gap: '12px', alignItems: 'flex-start',
                backgroundColor: '#0d0d1a', borderRadius: '8px', padding: '10px',
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
                    <div style={{ fontSize: '11px', color: '#ffb3da', fontStyle: 'italic' }}>🇷🇺 {seg.translationRu}</div>
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
    </div>
  );

  const renderStreamPackTab = () => {
    const currentPack = streamPacks[selectedStreamDay] || null;
    const dayInfo = streamDaysInfo[selectedStreamDay] || {};
    const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const daysRuMap: Record<string, string> = {
      Monday: 'Понедельник', Tuesday: 'Вторник', Wednesday: 'Среда',
      Thursday: 'Четверг', Friday: 'Пятница', Saturday: 'Суббота', Sunday: 'Воскресенье'
    };

    const doneCount = currentPack?.clips ? currentPack.clips.filter((c: any) => c.status === 'done').length : 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '20px', gap: '16px', backgroundColor: '#0e0b16' }}>
        {/* Top bar: Day Selection */}
        <div style={{
          display: 'flex', gap: '8px', padding: '12px', backgroundColor: '#161324',
          borderRadius: '12px', border: '1px solid #2e2a4a', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0
        }}>
          <span style={{ color: '#e8c4a0', fontWeight: 'bold', fontSize: '14px', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔴 Выберите день вещания:
          </span>
          {daysList.map(d => {
            const pack = streamPacks[d];
            const cnt = pack?.clips ? pack.clips.filter((c: any) => c.status === 'done').length : 0;
            const isSel = selectedStreamDay === d;
            return (
              <button key={d} onClick={() => setSelectedStreamDay(d)} style={{
                padding: '8px 16px', borderRadius: '8px', border: isSel ? '1px solid #ff4081' : '1px solid #36335a',
                backgroundColor: isSel ? '#7c4dff' : '#1d1a32',
                background: isSel ? 'linear-gradient(135deg, #ff4081 0%, #7c4dff 100%)' : undefined,
                color: '#fff', fontWeight: isSel ? 'bold' : 'normal', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
              }}>
                <span>{daysRuMap[d] || d}</span>
                {cnt > 0 && (
                  <span style={{ fontSize: '11px', backgroundColor: '#00c853', color: '#fff', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                    {cnt}/30
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Day info card & settings */}
        <div style={{
          display: 'flex', gap: '16px', backgroundColor: '#171428', padding: '16px', borderRadius: '12px',
          border: '1px solid #302d50', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <h3 style={{ margin: 0, color: '#ff4081', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📅 {daysRuMap[selectedStreamDay]} (AI Live Studio)
              </h3>
              <span style={{ fontSize: '11px', backgroundColor: '#1a3a2a', color: '#00e676', padding: '4px 10px', borderRadius: '20px', border: '1px solid #00c853', fontWeight: 'bold' }}>
                ✏️ Стиль и локация открыты для редактирования
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', fontSize: '13px', color: '#ddd' }}>
              <div style={{ backgroundColor: '#100d1c', padding: '12px', borderRadius: '8px', border: '1px solid #2e2850', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ color: '#e8c4a0', display: 'block', fontSize: '11px', fontWeight: 'bold' }}>👗 ОДЕЖДА ДНЯ (МОЖНО РЕДАКТИРОВАТЬ):</span>
                <input
                  type="text"
                  value={dayInfo.outfitRu || dayInfo.outfit || ''}
                  onChange={e => {
                    const val = e.target.value;
                    const updated = {
                      ...streamDaysInfo,
                      [selectedStreamDay]: { ...dayInfo, outfit: val, outfitRu: val }
                    };
                    setStreamDaysInfo(updated);
                    if (window.electronAPI.frenchtalkSaveStreamPackDaysInfo) {
                      window.electronAPI.frenchtalkSaveStreamPackDaysInfo(updated).catch(console.error);
                    }
                  }}
                  placeholder="Опишите стиль одежды для стрима..."
                  style={{
                    width: '100%', padding: '8px 10px', backgroundColor: '#090712', color: '#fff',
                    border: '1px solid #7c4dff', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', fontWeight: '500', outline: 'none'
                  }}
                />
              </div>
              <div style={{ backgroundColor: '#100d1c', padding: '12px', borderRadius: '8px', border: '1px solid #2e2850', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ color: '#e8c4a0', display: 'block', fontSize: '11px', fontWeight: 'bold' }}>🛋 ЛОКАЦИЯ И АТМОСФЕРА (МОЖНО РЕДАКТИРОВАТЬ):</span>
                <input
                  type="text"
                  value={dayInfo.locationRu || dayInfo.location || ''}
                  onChange={e => {
                    const val = e.target.value;
                    const updated = {
                      ...streamDaysInfo,
                      [selectedStreamDay]: { ...dayInfo, location: val, locationRu: val }
                    };
                    setStreamDaysInfo(updated);
                    if (window.electronAPI.frenchtalkSaveStreamPackDaysInfo) {
                      window.electronAPI.frenchtalkSaveStreamPackDaysInfo(updated).catch(console.error);
                    }
                  }}
                  placeholder="Опишите интерьер и обстановку комнат..."
                  style={{
                    width: '100%', padding: '8px 10px', backgroundColor: '#090712', color: '#fff',
                    border: '1px solid #7c4dff', borderRadius: '6px', fontSize: '13px', fontFamily: 'inherit', fontWeight: '500', outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '240px' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '4px' }}>🎬 Video Model</div>
              <select value={videoModel} onChange={e => setVideoModel(e.target.value as any)} style={{
                width: '100%', padding: '8px 12px', backgroundColor: '#0e0b1a', color: '#ff4081', border: '1px solid #ff4081', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
              }}>
                <option value="omni_flash">⚡ Omni Flash (Быстро)</option>
                <option value="veo_31_fast">🌟 Veo 3.1 Fast (Качество)</option>
              </select>
            </div>
            {!currentPack && (
              <button onClick={() => handleGenerateStreamScript(selectedStreamDay)} disabled={isGeneratingStreamPack} style={{
                padding: '12px 16px', background: 'linear-gradient(135deg, #ff4081 0%, #7c4dff 100%)',
                color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(255, 64, 129, 0.4)', transition: 'all 0.2s'
              }}>
                {isGeneratingStreamPack ? '⏳ Создаю сценарии...' : `✨ Сгенерировать 30 клипов (${daysRuMap[selectedStreamDay]})`}
              </button>
            )}
          </div>
        </div>

        {/* Reference Images Studio Control */}
        <div style={{
          margin: '0 20px', padding: '16px 20px', backgroundColor: '#131122', borderRadius: '12px',
          border: '1px solid #3d3460', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h4 style={{ margin: 0, color: '#e8c4a0', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🖼️ Этап 1: Подготовка и проверка визуальных референсов
              </h4>
              <span style={{ color: '#aaa', fontSize: '12px', display: 'block', marginTop: '4px' }}>
                Перед генерацией видеоклипов создайте и оцените интерьер комнаты и итоговый кадр девушки на диване.
              </span>
            </div>
            {dayInfo.sceneBase64 ? (
              <span style={{ fontSize: '12px', backgroundColor: '#1a3a2a', color: '#00e676', padding: '4px 12px', borderRadius: '20px', border: '1px solid #00c853', fontWeight: 'bold' }}>
                ✅ Кадр для видео готов к анимации!
              </span>
            ) : (
              <span style={{ fontSize: '12px', backgroundColor: '#3e2723', color: '#ffb74d', padding: '4px 12px', borderRadius: '20px', border: '1px solid #ff9800', fontWeight: 'bold' }}>
                ⚠️ Требуется сгенерировать итоговую сцену
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
            {/* 1. Room Background */}
            <div style={{ backgroundColor: '#0b0914', padding: '12px', borderRadius: '10px', border: '1px solid #282342', display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{
                width: '90px', height: '160px', backgroundColor: '#161326', borderRadius: '8px', border: '1px solid #362e5a',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: dayInfo.bgRoomBase64 ? 'pointer' : 'default'
              }} onClick={() => dayInfo.bgRoomBase64 && setLightboxImage(dayInfo.bgRoomBase64)}>
                {dayInfo.bgRoomBase64 ? (
                  <img src={dayInfo.bgRoomBase64} alt="Room Ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} title="Нажмите для увеличения" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#666', textAlign: 'center', padding: '4px' }}>Нет<br/>фото<br/>комнаты</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                <div>
                  <strong style={{ color: '#fff', fontSize: '13px', display: 'block' }}>1. Чистый интерьер комнаты</strong>
                  <span style={{ color: '#888', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                    Архитектурная фотография фона без человека.
                  </span>
                </div>
                <button
                  onClick={() => handleGenerateStreamImage(selectedStreamDay, 'room')}
                  disabled={!!generatingImageType}
                  style={{
                    padding: '8px 12px', backgroundColor: generatingImageType === 'room' ? '#332d56' : '#2d2250', color: '#ff4081',
                    border: '1px solid #ff4081', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px', cursor: generatingImageType ? 'not-allowed' : 'pointer', transition: 'all 0.2s'
                  }}
                >
                  {generatingImageType === 'room' ? '⏳ Генерирую...' : (dayInfo.bgRoomBase64 ? '🔄 Пересоздать комнату' : '✨ Сгенерировать комнату')}
                </button>
              </div>
            </div>

            {/* 2. Master Scene */}
            <div style={{ backgroundColor: '#0b0914', padding: '12px', borderRadius: '10px', border: '1px solid #282342', display: 'flex', gap: '14px', alignItems: 'center' }}>
              <div style={{
                width: '90px', height: '160px', backgroundColor: '#161326', borderRadius: '8px', border: '1px solid #362e5a',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: dayInfo.sceneBase64 ? 'pointer' : 'default'
              }} onClick={() => dayInfo.sceneBase64 && setLightboxImage(dayInfo.sceneBase64)}>
                {dayInfo.sceneBase64 ? (
                  <img src={dayInfo.sceneBase64} alt="Master Scene Ref" style={{ width: '100%', height: '100%', objectFit: 'cover' }} title="Нажмите для увеличения" />
                ) : (
                  <span style={{ fontSize: '11px', color: '#666', textAlign: 'center', padding: '4px' }}>Нет<br/>итоговой<br/>сцены</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                <div>
                  <strong style={{ color: '#fff', fontSize: '13px', display: 'block' }}>2. Итоговый кадр с блогером</strong>
                  <span style={{ color: '#888', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                    Профи-камера Hasselblad X2D. Девушка в одежде дня на фоне комнаты.
                  </span>
                </div>
                <button
                  onClick={() => handleGenerateStreamImage(selectedStreamDay, 'scene')}
                  disabled={!!generatingImageType || !dayInfo.bgRoomBase64}
                  style={{
                    padding: '8px 12px',
                    background: !dayInfo.bgRoomBase64 ? '#1d1a2f' : (generatingImageType === 'scene' ? '#452055' : 'linear-gradient(135deg, #ff4081 0%, #7c4dff 100%)'),
                    color: !dayInfo.bgRoomBase64 ? '#666' : '#fff',
                    border: !dayInfo.bgRoomBase64 ? '1px solid #333' : 'none',
                    borderRadius: '6px', fontWeight: 'bold', fontSize: '12px',
                    cursor: (!dayInfo.bgRoomBase64 || generatingImageType) ? 'not-allowed' : 'pointer',
                    boxShadow: dayInfo.bgRoomBase64 ? '0 2px 10px rgba(255, 64, 129, 0.3)' : 'none', transition: 'all 0.2s'
                  }}
                >
                  {generatingImageType === 'scene' ? '⏳ Генерирую...' : (!dayInfo.bgRoomBase64 ? '🔒 Сначала создайте комнату' : (dayInfo.sceneBase64 ? '🔄 Пересоздать кадр' : '🌟 Сгенерировать итоговую сцену'))}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Clip List or Empty State */}
        {!currentPack ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backgroundColor: '#110e1f', borderRadius: '12px', border: '1px dashed #36335a', color: '#888', padding: '40px', textAlign: 'center'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎭</div>
            <h3 style={{ color: '#eee', margin: '0 0 8px 0' }}>Пакет для дня «{daysRuMap[selectedStreamDay]}» еще не создан</h3>
            <p style={{ maxWidth: '560px', fontSize: '13px', lineHeight: '1.6', color: '#aaa', margin: '0 0 24px 0' }}>
              При генерации система создаст ровно 30 видеоклипов без смены одежды:<br />
              <b>12 клипов</b> <code>idle_loop</code> (без слов и открывания рта, интерактив),<br />
              <b>15 клипов</b> <code>talking_reply</code> (короткий французский интерактив с переводом на русский),<br />
              <b>3 клипа</b> <code>gift_reaction</code> (восторг и благодарность за донат).
            </p>
            <button onClick={() => handleGenerateStreamScript(selectedStreamDay)} disabled={isGeneratingStreamPack} style={{
              padding: '14px 28px', background: 'linear-gradient(135deg, #ff4081 0%, #7c4dff 100%)',
              color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(124, 77, 255, 0.5)'
            }}>
              {isGeneratingStreamPack ? '⏳ Создаю план пакета...' : `🚀 Сгенерировать стрим-пак на ${daysRuMap[selectedStreamDay]}`}
            </button>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Controls banner */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px',
              backgroundColor: '#1c1832', borderRadius: '8px 8px 0 0', border: '1px solid #36335a', flexShrink: 0
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontWeight: 'bold', color: '#e8c4a0', fontSize: '14px' }}>
                  📦 Сгенерированные клипы ({doneCount}/30)
                </span>
                <span style={{ fontSize: '12px', color: '#aaa' }}>
                  Папка: <code>StreamPack_{selectedStreamDay}</code>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {streamAutoRunning ? (
                  <button onClick={() => { stopStreamAutoRef.current = true; setStreamAutoRunning(false); }} style={{
                    padding: '6px 14px', backgroundColor: '#f44336', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
                  }}>
                    ⏹ Остановить авто-генерацию
                  </button>
                ) : (
                  <button onClick={() => handleAutoGenerateStreamPack(selectedStreamDay)} disabled={doneCount === 30} style={{
                    padding: '6px 14px', background: 'linear-gradient(90deg, #00c853 0%, #b2ff59 100%)',
                    color: '#000', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                    opacity: doneCount === 30 ? 0.5 : 1
                  }}>
                    ⚡ Авто-генерация всех клипов
                  </button>
                )}
                <button onClick={() => handleGenerateStreamScript(selectedStreamDay)} disabled={isGeneratingStreamPack || streamAutoRunning} style={{
                  padding: '6px 12px', backgroundColor: '#2d294a', color: '#aaa', border: '1px solid #444', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                }}>
                  🔄 Пересоздать тексты
                </button>
              </div>
            </div>

            {/* Scrollable grid/table of clips */}
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: '#131022', border: '1px solid #252240', borderRadius: '0 0 8px 8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {currentPack.clips.map((clip: any) => {
                const isIdle = clip.role === 'idle_loop';
                const isTalk = clip.role === 'talking_reply';
                const isReaction = clip.role === 'gift_reaction';
                const roleBadge = isIdle ? { text: '🟢 IDLE (Молчит)', color: '#00e676', bg: '#003b1e' } :
                                  isTalk ? { text: '💬 TALKING REPLY', color: '#40c4ff', bg: '#00263e' } :
                                           { text: '🎁 GIFT REACTION', color: '#ff4081', bg: '#3b001a' };

                let fileTag = 'idle_';
                if (isTalk) fileTag = 'talking_';
                if (isReaction) fileTag = 'reaction_';

                return (
                  <div key={clip.index} style={{
                    display: 'flex', alignItems: 'center', gap: '14px', padding: '12px',
                    backgroundColor: clip.status === 'done' ? '#16231a' : '#1a172c',
                    borderRadius: '8px', border: `1px solid ${clip.status === 'done' ? '#2e6b48' : '#2f2b4e'}`,
                    transition: 'all 0.2s'
                  }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#252240', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '13px', color: '#ccc', flexShrink: 0 }}>
                      {String(clip.index + 1).padStart(2, '0')}
                    </div>

                    <div style={{ minWidth: '170px', flexShrink: 0 }}>
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', color: roleBadge.color, backgroundColor: roleBadge.bg, border: `1px solid ${roleBadge.color}44`, marginBottom: '4px' }}>
                        {roleBadge.text}
                      </span>
                      <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
                        Файл: <code>{fileTag}{String(clip.index + 1).padStart(2, '0')}...mp4</code>
                      </div>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '13px', color: isIdle ? '#bbb' : '#fff', fontWeight: isIdle ? 'normal' : '500' }}>
                        {clip.text}
                      </div>
                      {clip.translationRu && (
                        <div style={{ fontSize: '12px', color: '#ff80ab', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>🇷🇺</span> {clip.translationRu}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                      {clip.videoBase64 && (
                        <button onClick={() => setPreviewVideo(clip.videoBase64)} style={{
                          padding: '6px 12px', backgroundColor: '#3b2d60', color: '#e8c4a0', border: '1px solid #7c4dff', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                        }}>
                          ▶️ Смотреть (8с)
                        </button>
                      )}

                      <button onClick={() => handleGenerateStreamClip(selectedStreamDay, clip)} disabled={clip.status === 'generating' || streamAutoRunning} style={{
                        padding: '8px 14px', fontSize: '12px', fontWeight: 'bold',
                        backgroundColor: clip.status === 'done' ? '#1a3b2a' : clip.status === 'generating' ? '#252240' : undefined,
                        background: clip.status === 'done' ? '#1a3b2a' : clip.status === 'generating' ? '#252240' : 'linear-gradient(135deg, #7c4dff 0%, #ff4081 100%)',
                        color: clip.status === 'generating' ? '#aaa' : clip.status === 'done' ? '#00e676' : '#fff',
                        border: `1px solid ${clip.status === 'done' ? '#00c853' : '#666'}`,
                        borderRadius: '6px', cursor: clip.status === 'generating' ? 'default' : 'pointer', transition: 'all 0.2s'
                      }}>
                        {clip.status === 'generating' ? '⏳ Генерация...' : clip.status === 'done' ? '🔄 Пересоздать' : '🎬 Создать MP4'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderHeader = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
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
            <div style={{ fontSize: '11px', color: '#888' }}>Paris Street Interview & Lifestyle Vlog Generator for TikTok & AI Live</div>
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
          { id: 'episode', label: '🎬 Episode Generator' },
          { id: 'vlog', label: '💅 Life & Girl Secrets' },
          { id: 'stream_pack', label: '🔴 7-Day Stream Packs' }
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
        {subTab === 'blogger' ? renderBloggerTab() : subTab === 'episode' ? renderEpisodeTab() : subTab === 'vlog' ? renderVlogTab() : renderStreamPackTab()}
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

      {/* Image Preview Modal */}
      {lightboxImage && (
        <div onClick={() => setLightboxImage(null)} style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, cursor: 'pointer'
        }}>
          <div onClick={e => e.stopPropagation()}>
            <img src={lightboxImage} alt="Preview" style={{
              maxHeight: '85vh', maxWidth: '90vw', borderRadius: '8px', boxShadow: '0 0 40px rgba(124,77,255,0.5)', objectFit: 'contain'
            }} />
            <div style={{ textAlign: 'center', marginTop: '10px' }}>
              <button onClick={() => setLightboxImage(null)} style={{
                padding: '6px 16px', backgroundColor: '#333', color: '#ccc',
                border: '1px solid #555', borderRadius: '6px', cursor: 'pointer', fontSize: '12px'
              }}>✕ Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return renderHeader();
};

export default FrenchTalkTab;
