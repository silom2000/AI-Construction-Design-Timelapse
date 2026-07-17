import React, { useState, useRef } from 'react';
import {
  Globe, Video, User, Copy, Check, RefreshCw,
  RotateCw, Zap, Play, Clock, MessageSquare, Users, FileVideo,
  ChevronDown, ChevronRight, Download, Languages
} from 'lucide-react';
import type { DialogueResult, DialogueSegment } from './electron.d';

// ── Types ──────────────────────────────────────────────────────────────────
type PipelineState = 'IDLE' | 'PROCESSING' | 'STEP1_DONE' | 'STEP2_DONE' | 'STEP3_DONE' | 'RESULTS';
type LanguageTab = 'german' | 'french' | 'english';
type ResultsMode = 'overview' | 'segments';

// ── Color Palette ──────────────────────────────────────────────────────────
const C = {
  bg: '#0a0a0a',
  surface: '#111827',
  surfaceHover: '#1a2332',
  accent: '#3b82f6',
  accent2: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  text: '#e5e7eb',
  subtext: '#9ca3af',
  border: '#1f2937',
};

// ── Style factories ────────────────────────────────────────────────────────
const btn = (overrides?: React.CSSProperties): React.CSSProperties => ({
  padding: '10px 22px', borderRadius: '8px', border: 'none',
  cursor: 'pointer', fontWeight: 700, fontSize: '13px',
  color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '8px',
  transition: 'all 0.2s', ...overrides,
});

const btnSm = (overrides?: React.CSSProperties): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: '6px', border: 'none',
  cursor: 'pointer', fontWeight: 600, fontSize: '11px',
  color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '4px',
  transition: 'all 0.2s', ...overrides,
});

const card: React.CSSProperties = {
  backgroundColor: C.surface, borderRadius: '12px', border: `1px solid ${C.border}`,
  padding: '16px', marginBottom: '16px',
};

const chip = (bg: string, fg: string): React.CSSProperties => ({
  padding: '2px 10px', borderRadius: '12px', fontSize: '11px',
  fontWeight: 600, backgroundColor: bg, color: fg, display: 'inline-block',
  whiteSpace: 'nowrap',
});

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '8px 18px', borderRadius: '8px 8px 0 0', border: 'none',
  cursor: 'pointer', fontWeight: 700, fontSize: '13px',
  backgroundColor: active ? C.accent : 'transparent',
  color: active ? '#fff' : C.subtext,
  transition: 'all 0.2s',
});

// ── Helpers ─────────────────────────────────────────────────────────────────
async function copyToClipboard(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { return false; }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Component ───────────────────────────────────────────────────────────────
const LocalizeTab: React.FC = () => {
  // Pipeline
  const [pipelineState, setPipelineState] = useState<PipelineState>('IDLE');
  const [error, setError] = useState<string | null>(null);
  const [stepData, setStepData] = useState<any>({});
  const [editableJson, setEditableJson] = useState<string>('');
  const [processingMessage, setProcessingMessage] = useState<string>('');

  // Input
  const [videoBase64, setVideoBase64] = useState<string | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Results
  const [projectFolder, setProjectFolder] = useState<string>('');
  const [result, setResult] = useState<DialogueResult | null>(null);

  // Language state
  const [activeLang, setActiveLang] = useState<LanguageTab>('german');
  const [translatedSegmentsDE, setTranslatedSegmentsDE] = useState<DialogueSegment[] | null>(null);
  const [translatedSegmentsFR, setTranslatedSegmentsFR] = useState<DialogueSegment[] | null>(null);
  const [translatedSegmentsEN, setTranslatedSegmentsEN] = useState<DialogueSegment[] | null>(null);
  const [translatingDE, setTranslatingDE] = useState(false);
  const [translatingFR, setTranslatingFR] = useState(false);
  const [translatingEN, setTranslatingEN] = useState(false);

  // Video generation state
  const [generatingLang, setGeneratingLang] = useState<LanguageTab | null>(null);
  const [generatingIndex, setGeneratingIndex] = useState<number | null>(null);
  const [segmentVideosDE, setSegmentVideosDE] = useState<Record<number, string>>({});
  const [segmentVideosFR, setSegmentVideosFR] = useState<Record<number, string>>({});
  const [segmentVideosEN, setSegmentVideosEN] = useState<Record<number, string>>({});
  const [customPrompts, setCustomPrompts] = useState<Record<number, string>>({});
  const [generatingPrompts, setGeneratingPrompts] = useState(false);

  // UI state
  const [resultsMode, setResultsMode] = useState<ResultsMode>('overview');
  const [expandedSegment, setExpandedSegment] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const triggerCopy = (id: string, text: string) => {
    copyToClipboard(text).then(ok => { if (ok) { setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } });
  };

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setVideoBase64(b64);
      setVideoPreviewUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setVideoBase64(reader.result as string);
      setVideoPreviewUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleStep1 = async () => {
    if (!videoBase64) return;
    setError(null);
    setProcessingMessage('Extracting Audio & Transcribing...');
    setPipelineState('PROCESSING');
    try {
      const data = await window.electronAPI.localizeStep1STT({ videoBase64 });
      setStepData(data);
      setProjectFolder(data.projectFolder);
      setEditableJson(JSON.stringify({ transcript: data.transcript, utterances: data.utterances }, null, 2));
      setPipelineState('STEP1_DONE');
    } catch (err: any) {
      setError(err?.message || 'Step 1 failed');
      setPipelineState('IDLE');
    }
  };

  const handleStep2 = async () => {
    setError(null);
    setProcessingMessage('Running Speaker Diarization...');
    setPipelineState('PROCESSING');
    try {
      // Parse edited JSON
      const parsed = JSON.parse(editableJson);
      const data = await window.electronAPI.localizeStep2Diarize({
        projectFolder,
        transcriptWords: stepData.transcriptWords,
        utterances: parsed.utterances || stepData.utterances,
        frames: stepData.frames
      });
      setStepData({ ...stepData, ...data, utterances: parsed.utterances || stepData.utterances });
      setEditableJson(JSON.stringify({ speakers: data.speakers, timeline: data.timeline, segments: data.segments }, null, 2));
      setPipelineState('STEP2_DONE');
    } catch (err: any) {
      setError(err?.message || 'Step 2 failed');
      setPipelineState('STEP1_DONE');
    }
  };

  const handleStep3 = async () => {
    setError(null);
    setProcessingMessage('Analyzing Character Appearances...');
    setPipelineState('PROCESSING');
    try {
      const parsed = JSON.parse(editableJson);
      const data = await window.electronAPI.localizeStep3Characters({
        projectFolder,
        frames: stepData.frames,
        speakers: parsed.speakers || stepData.speakers
      });
      setStepData({ ...stepData, ...data, speakers: parsed.speakers || stepData.speakers });
      setEditableJson(JSON.stringify({ characters: data.characters, sceneDescription: data.sceneDescription }, null, 2));
      setPipelineState('STEP3_DONE');
    } catch (err: any) {
      setError(err?.message || 'Step 3 failed');
      setPipelineState('STEP2_DONE');
    }
  };

  const handleStep4 = async () => {
    setError(null);
    setProcessingMessage('Analyzing Voices & Matching...');
    setPipelineState('PROCESSING');
    try {
      const parsed = JSON.parse(editableJson);
      const data = await window.electronAPI.localizeStep4Voices({
        projectFolder,
        segments: stepData.segments,
        speakers: stepData.speakers
      });
      
      const finalResult = {
        projectFolder,
        transcript: stepData.transcript,
        transcriptWords: stepData.transcriptWords,
        sceneDescription: parsed.sceneDescription || stepData.sceneDescription,
        speakers: stepData.speakers,
        segments: stepData.segments,
        characters: parsed.characters || stepData.characters,
        frames: stepData.frames.map((f:any) => f.url),
        sceneFrames: stepData.sceneFrames,
        voiceProfiles: data.voiceProfiles,
        speakerVoices: data.speakerVoices,
        videoUrl: stepData.videoUrl
      };
      
      setResult(finalResult as any);
      setTranslatedSegmentsDE(null);
      setTranslatedSegmentsFR(null);
      setTranslatedSegmentsEN(null);
      setSegmentVideosDE({});
      setSegmentVideosFR({});
      setSegmentVideosEN({});
      setPipelineState('RESULTS');
      setResultsMode('segments');
    } catch (err: any) {
      setError(err?.message || 'Step 4 failed');
      setPipelineState('STEP3_DONE');
    }
  };

  const handleTranslate = async (lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    const setTranslating = lang === 'german' ? setTranslatingDE : lang === 'french' ? setTranslatingFR : setTranslatingEN;
    const setTranslated = lang === 'german' ? setTranslatedSegmentsDE : lang === 'french' ? setTranslatedSegmentsFR : setTranslatedSegmentsEN;
    setTranslating(true);
    try {
      const segments = await window.electronAPI.localizeTranslateSegments(
        projectFolder, result.segments,
        lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English'
      );
      setTranslated(segments);
    } catch (err: any) {
      console.error(`Translation to ${lang} failed:`, err);
    } finally { setTranslating(false); }
  };

  const handleGeneratePrompts = async () => {
    if (!result || !projectFolder) return;
    setGeneratingPrompts(true);
    try {
      const promptsData = await window.electronAPI.localizeGenerateVideoPrompts({
        projectFolder,
        segments: result.segments,
        characters: result.characters,
        sceneDescription: result.sceneDescription || ''
      });
      const promptMap: Record<number, string> = {};
      for (const p of promptsData) {
        promptMap[p.segmentIndex] = p.videoPrompt;
      }
      setCustomPrompts(promptMap);
    } catch (err: any) {
      console.error('Failed to generate video prompts:', err);
    } finally {
      setGeneratingPrompts(false);
    }
  };

  const handleGenerateVideo = async (segmentIndex: number, lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    setGeneratingLang(lang);
    setGeneratingIndex(segmentIndex);
    const resolvedSegments = lang === 'german' ? translatedSegmentsDE : lang === 'french' ? translatedSegmentsFR : translatedSegmentsEN;
    const segments = resolvedSegments || result.segments;
    const charImages = (result?.characters || []).map((c, i) => ({
      speakerId: i + 1,
      imageBase64: c.generatedImageUrl || ''
    })).filter(ci => ci.imageBase64);
    try {
      const { videoUrl } = await window.electronAPI.localizeGenerateSegmentVideo({
        projectFolder, segmentIndex, segments,
        targetLanguage: lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English',
        characterImages: charImages,
        sceneFrames: result.sceneFrames || undefined,
        characters: result.characters || undefined,
        sceneDescription: result.sceneDescription || undefined,
        speakerVoices: result.speakerVoices || undefined,
        customPrompt: customPrompts[segmentIndex] || undefined
      });
      if (lang === 'german') setSegmentVideosDE(p => ({ ...p, [segmentIndex]: videoUrl }));
      else if (lang === 'french') setSegmentVideosFR(p => ({ ...p, [segmentIndex]: videoUrl }));
      else setSegmentVideosEN(p => ({ ...p, [segmentIndex]: videoUrl }));
    } catch (err: any) {
      console.error(`Video generation failed for segment ${segmentIndex}:`, err);
    } finally { setGeneratingLang(null); setGeneratingIndex(null); }
  };

  const handleBatchGenerate = async (lang: LanguageTab) => {
    if (!result || !projectFolder) return;
    const segments = lang === 'german' ? translatedSegmentsDE : lang === 'french' ? translatedSegmentsFR : translatedSegmentsEN;
    if (!segments || segments.length === 0) {
      alert('Translate segments first before generating videos.');
      return;
    }
    setGeneratingLang(lang);
    setGeneratingIndex(null);
    const charImages = (result?.characters || []).map((c, i) => ({
      speakerId: i + 1,
      imageBase64: c.generatedImageUrl || ''
    })).filter(ci => ci.imageBase64);
    try {
      const batchResults = await window.electronAPI.localizeBatchGenerateSegments({
        projectFolder, segments,
        targetLanguage: lang === 'german' ? 'German' : lang === 'french' ? 'French' : 'English',
        characterImages: charImages,
        sceneFrames: result.sceneFrames || undefined,
        characters: result.characters || undefined,
        sceneDescription: result.sceneDescription || undefined,
        speakerVoices: result.speakerVoices || undefined
      });
      const videoMap: Record<number, string> = {};
      for (const r of batchResults) { if (r.videoUrl) videoMap[r.segmentIndex] = r.videoUrl; }
      if (lang === 'german') setSegmentVideosDE(p => ({ ...p, ...videoMap }));
      else if (lang === 'french') setSegmentVideosFR(p => ({ ...p, ...videoMap }));
      else setSegmentVideosEN(p => ({ ...p, ...videoMap }));
    } catch (err: any) {
      console.error(`Batch generation failed:`, err);
    } finally { setGeneratingLang(null); }
  };

  const handleRegenerateImage = async (charIndex: number) => {
    if (!result || !projectFolder) return;
    try {
      const newUrl = await window.electronAPI.localizeRegenerateCharacterImage(projectFolder, charIndex);
      const updated = [...result.characters];
      updated[charIndex] = { ...updated[charIndex], generatedImageUrl: newUrl };
      setResult({ ...result, characters: updated });
    } catch (err: any) { console.error('Image regeneration failed:', err); }
  };

  const resetWorkflow = () => {
    setPipelineState('IDLE');
    setVideoBase64(null); setVideoPreviewUrl(null);
    setResult(null); setProjectFolder(''); setError(null);
    setTranslatedSegmentsDE(null); setTranslatedSegmentsFR(null); setTranslatedSegmentsEN(null);
    setSegmentVideosDE({}); setSegmentVideosFR({}); setSegmentVideosEN({});
    setCustomPrompts({}); setGeneratingPrompts(false);
    setResultsMode('overview');
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const segmentsForLang: DialogueSegment[] = (activeLang === 'german' ? translatedSegmentsDE : activeLang === 'french' ? translatedSegmentsFR : translatedSegmentsEN) || result?.segments || [];
  const segmentVids = activeLang === 'german' ? segmentVideosDE : activeLang === 'french' ? segmentVideosFR : segmentVideosEN;
  const isTranslating = activeLang === 'german' ? translatingDE : activeLang === 'french' ? translatingFR : translatingEN;
  const hasTranslations = !!(activeLang === 'german' ? translatedSegmentsDE : activeLang === 'french' ? translatedSegmentsFR : translatedSegmentsEN);
  const vidCount = Object.keys(segmentVids).length;
  const totalSegs = result?.segments?.length || 0;
  const isBatchGenerating = generatingLang === activeLang && generatingIndex === null;

  // ══════════════════════════════════════════════════════════════════════════
  // IDLE
  // ══════════════════════════════════════════════════════════════════════════
  if (pipelineState === 'IDLE') {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ maxWidth: 700, margin: '40px auto', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${C.accent}, ${C.accent2})`, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={36} color="#fff" />
          </div>

          <h1 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>TikTok Video Localizer</h1>
          <p style={{ color: C.subtext, margin: '0 0 32px', fontSize: 14 }}>
            Analyze dialogue videos, identify speakers, translate & generate localized talking-head clips for TikTok
          </p>

          {/* Upload */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            style={{ border: `2px dashed ${C.border}`, borderRadius: 12, padding: '48px 24px', cursor: 'pointer', backgroundColor: C.surface, transition: 'border-color 0.2s', marginBottom: 24 }}
          >
            <Video size={40} color={C.subtext} style={{ marginBottom: 12 }} />
            <p style={{ color: C.subtext, margin: 0, fontSize: 14 }}>
              {videoBase64 ? 'Video loaded ✓ — Click to change' : 'Click or drag & drop a video file (MP4 recommended)'}
            </p>
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoUpload} />

          {/* Preview */}
          {videoPreviewUrl && (
            <div style={{ marginBottom: 24 }}>
              <video src={videoPreviewUrl} controls style={{ width: '100%', maxHeight: 320, borderRadius: 8, backgroundColor: '#000' }} />
            </div>
          )}

          {/* Languages */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
            {[{ flag: '🇩🇪', label: 'German' }, { flag: '🇫🇷', label: 'French' }, { flag: '🇬🇧', label: 'English' }].map(l => (
              <div key={l.label} style={{ backgroundColor: C.surface, borderRadius: 8, padding: '10px 20px', border: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 20, marginRight: 8 }}>{l.flag}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{l.label}</span>
              </div>
            ))}
          </div>

          {/* Analyze button */}
          <button onClick={handleStep1} disabled={!videoBase64}
            style={btn({
              padding: '16px 40px', fontSize: 15,
              background: videoBase64 ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : '#374151',
              cursor: videoBase64 ? 'pointer' : 'not-allowed', opacity: videoBase64 ? 1 : 0.5,
            })}>
            <Zap size={18} /> STEP 1: EXTRACT & TRANSCRIBE
          </button>

          {error && (
            <div style={{ marginTop: 16, color: '#ef4444', backgroundColor: '#1f0000', padding: 12, borderRadius: 8 }}>{error}</div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PROCESSING
  // ══════════════════════════════════════════════════════════════════════════
  if (pipelineState === 'PROCESSING') {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={48} color={C.accent} style={{ animation: 'spin 1.5s linear infinite', marginBottom: 20 }} />
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>{processingMessage || 'Processing...'}</h2>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WIZARD STEPS
  // ══════════════════════════════════════════════════════════════════════════
  if (['STEP1_DONE', 'STEP2_DONE', 'STEP3_DONE'].includes(pipelineState)) {
    return (
      <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ maxWidth: 900, margin: '20px auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>🛠️ Manual Verification Step</h2>
            <button onClick={resetWorkflow} style={btnSm({ backgroundColor: '#374151' })}>🔄 Abort</button>
          </div>
          
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
             <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: pipelineState === 'STEP1_DONE' ? C.accent : (pipelineState === 'STEP2_DONE' || pipelineState === 'STEP3_DONE' ? C.success : C.surface) }} />
             <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: pipelineState === 'STEP2_DONE' ? C.accent : (pipelineState === 'STEP3_DONE' ? C.success : C.surface) }} />
             <div style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: pipelineState === 'STEP3_DONE' ? C.accent : C.surface }} />
          </div>

          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
              {pipelineState === 'STEP1_DONE' && 'Step 1 Complete: Transcription & Utterances'}
              {pipelineState === 'STEP2_DONE' && 'Step 2 Complete: Speaker Diarization'}
              {pipelineState === 'STEP3_DONE' && 'Step 3 Complete: Character Analysis'}
            </h3>
            <p style={{ fontSize: 13, color: C.subtext, marginBottom: 16 }}>
              Review and edit the raw JSON data below. This data will be sent to the next step.
            </p>
            
            <textarea
              value={editableJson}
              onChange={(e) => setEditableJson(e.target.value)}
              spellCheck={false}
              style={{ width: '100%', height: '400px', backgroundColor: '#0d0d1a', color: C.accent, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 13, resize: 'vertical' }}
            />
            {error && <div style={{ marginTop: 16, color: '#ef4444' }}>{error}</div>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            {pipelineState === 'STEP1_DONE' && (
              <button onClick={handleStep2} style={btn({ backgroundColor: C.accent })}>Next: Run Diarization →</button>
            )}
            {pipelineState === 'STEP2_DONE' && (
              <button onClick={handleStep3} style={btn({ backgroundColor: C.accent })}>Next: Analyze Characters →</button>
            )}
            {pipelineState === 'STEP3_DONE' && (
              <button onClick={handleStep4} style={btn({ backgroundColor: C.accent2 })}>Next: Match Voices & Finish →</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════════════════
  const segments = result!.segments;

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', backgroundColor: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800 }}>🌍 Localization Results</h2>
          <span style={{ color: C.subtext, fontSize: 12 }}>{projectFolder}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setResultsMode('overview')} style={btnSm({ backgroundColor: resultsMode === 'overview' ? C.accent : C.surface, color: resultsMode === 'overview' ? '#fff' : C.subtext, border: `1px solid ${C.border}` })}>📊 Overview</button>
          <button onClick={() => setResultsMode('segments')} style={btnSm({ backgroundColor: resultsMode === 'segments' ? C.accent : C.surface, color: resultsMode === 'segments' ? '#fff' : C.subtext, border: `1px solid ${C.border}` })}>🎬 Segments</button>
          <button onClick={resetWorkflow} style={btnSm({ backgroundColor: '#374151' })}>🔄 Reset</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left Side: Video player */}
        <div style={{ flex: '0 0 35%', position: 'sticky', top: '20px' }}>
          <div style={{ ...card, padding: '8px', marginBottom: 0 }}>
            <video src={result!.videoUrl} controls style={{ width: '100%', borderRadius: 8, backgroundColor: '#000' }} />
          </div>
        </div>

        {/* Right Side: Settings & Parameters */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { icon: <Users size={18} />, label: 'Speakers', val: result!.speakers?.length || 2 },
          { icon: <FileVideo size={18} />, label: 'Segments', val: totalSegs },
          { icon: <MessageSquare size={18} />, label: 'Words', val: result!.transcriptWords?.length || 0 },
          { icon: <Clock size={18} />, label: 'Duration', val: segments.length > 0 ? formatDuration(segments[segments.length - 1].endTime) : '—' },
        ].map(item => (
          <div key={item.label} style={card}>
            <div style={{ color: C.subtext, fontSize: 11, marginBottom: 4 }}>{item.label}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.accent }}>{item.icon}</span>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{item.val}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ OVERVIEW ═══ */}
      {resultsMode === 'overview' && (
        <>
          {/* Speakers */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} color={C.accent2} /> Speakers</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {(result!.speakers || []).map((sp, i) => (
                <div key={sp.id} style={{ backgroundColor: '#1a1a2e', borderRadius: 8, padding: 12, borderLeft: `3px solid ${i === 0 ? C.accent : C.accent2}` }}>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', backgroundColor: i === 0 ? C.accent : C.accent2, textAlign: 'center', lineHeight: '24px', fontSize: 12, marginRight: 8 }}>{sp.id}</span>
                    {sp.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.subtext, marginBottom: 6 }}>{sp.description}</div>
                  {sp.voiceProfile && (
                    <div style={{ fontSize: 11, color: C.subtext, borderTop: `1px solid ${C.border}`, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div>🗣️ <strong>Characteristics:</strong> {sp.voiceProfile.gender}, {sp.voiceProfile.ageRange}, {sp.voiceProfile.timbre} timbre ({sp.voiceProfile.style})</div>
                      {sp.voiceName && <div>🎙️ <strong>Matched Voice:</strong> <span style={{ color: C.success }}>{sp.voiceName}</span></div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scene */}
          {result!.sceneDescription && (
            <div style={card}>
              <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>🎬 Scene</h3>
              <p style={{ margin: 0, color: C.subtext, fontSize: 13, lineHeight: 1.5 }}>{result!.sceneDescription}</p>
            </div>
          )}

          {/* Transcript */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>📝 Original Transcript</h3>
              <button onClick={() => triggerCopy('transcript', result!.transcript)} style={btnSm({ backgroundColor: 'transparent', border: `1px solid ${C.border}` })}>
                {copiedId === 'transcript' ? <Check size={14} color={C.success} /> : <Copy size={14} />}
                {copiedId === 'transcript' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 12, lineHeight: 1.6, color: C.subtext, backgroundColor: '#0d0d1a', borderRadius: 8, padding: 12 }}>
              {result!.transcript}
            </div>
          </div>

          {/* Characters */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><User size={18} color={C.accent} /> Characters</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              {(result!.characters || []).map((char, i) => (
                <div key={i} style={{ backgroundColor: '#1a1a2e', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <div style={{ width: 100, height: 140, flexShrink: 0, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000' }}>
                      {char.generatedImageUrl ? (
                        <img src={char.generatedImageUrl} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : char.bestFrameUrl ? (
                        <img src={char.bestFrameUrl} alt={char.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={32} color={C.subtext} /></div>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>{char.name}</div>
                      <div style={{ fontSize: 11, color: C.subtext, marginBottom: 6 }}>{char.description}</div>
                      <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.4, marginBottom: 8 }}><strong>Appearance:</strong> {char.appearance}</div>
                      <div style={{ fontSize: 11, color: C.subtext, lineHeight: 1.4, marginBottom: 8 }}><strong>Prompt:</strong> {char.imagePrompt?.substring(0, 120)}...</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => triggerCopy(`prompt-${i}`, char.imagePrompt || '')} style={btnSm({ backgroundColor: 'transparent', border: `1px solid ${C.border}`, fontSize: 10 })}>
                          {copiedId === `prompt-${i}` ? <Check size={12} color={C.success} /> : <Copy size={12} />}
                          {copiedId === `prompt-${i}` ? '✓' : 'Prompt'}
                        </button>
                        <button onClick={() => handleRegenerateImage(i)} style={btnSm({ backgroundColor: C.accent2, fontSize: 10 })}>
                          <RotateCw size={12} /> Regenerate
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Frames strip */}
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', fontSize: 14 }}>🎞️ Key Frames</h3>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
              {(result!.frames || []).map((url, i) => (
                <img key={i} src={url} alt={`Frame ${i + 1}`} style={{ width: 140, height: 80, objectFit: 'cover', borderRadius: 6, flexShrink: 0, border: `1px solid ${C.border}` }} />
              ))}
            </div>
          </div>

          {/* Quick segment preview */}
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>💬 Dialogue Segments ({totalSegs})</h3>
              <button onClick={() => setResultsMode('segments')} style={btnSm({ backgroundColor: C.accent })}>View All →</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {segments.map((seg, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={chip(seg.speakerId === 1 ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)', seg.speakerId === 1 ? C.accent : C.accent2)}>S{seg.speakerId}</span>
                  <span style={{ fontWeight: 600, fontSize: 12, minWidth: 80 }}>{seg.speakerName}</span>
                  <span style={{ fontSize: 12, color: C.subtext, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{seg.text}</span>
                  <span style={{ fontSize: 11, color: C.subtext, whiteSpace: 'nowrap' }}>{formatDuration(seg.startTime)} — {formatDuration(seg.endTime)} ({seg.duration}s)</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ═══ SEGMENTS ═══ */}
      {resultsMode === 'segments' && (
        <>
          {/* Language Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 0 }}>
            <button onClick={() => setActiveLang('german')} style={tabBtnStyle(activeLang === 'german')}>🇩🇪 German</button>
            <button onClick={() => setActiveLang('french')} style={tabBtnStyle(activeLang === 'french')}>🇫🇷 French</button>
            <button onClick={() => setActiveLang('english')} style={tabBtnStyle(activeLang === 'english')}>🇬🇧 English</button>
          </div>

          {/* Action bar */}
          <div style={{ backgroundColor: C.surface, borderRadius: '0 12px 12px 12px', border: `1px solid ${C.border}`, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{activeLang === 'german' ? '🇩🇪' : activeLang === 'french' ? '🇫🇷' : '🇬🇧'}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{activeLang === 'german' ? 'German' : activeLang === 'french' ? 'French' : 'English'} Localization</span>
              {hasTranslations && <span style={chip('rgba(16,185,129,0.2)', C.success)}>{segmentsForLang.length} translated</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => handleTranslate(activeLang)} disabled={isTranslating}
                style={btnSm({ backgroundColor: isTranslating ? '#374151' : C.accent2, cursor: isTranslating ? 'not-allowed' : 'pointer' })}>
                {isTranslating ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Translating...</> : <><Languages size={12} /> {hasTranslations ? 'Re-translate All' : 'Translate All'}</>}
              </button>
              <button onClick={handleGeneratePrompts} disabled={generatingPrompts || !hasTranslations}
                style={btnSm({ backgroundColor: (hasTranslations && !generatingPrompts) ? C.accent : '#374151', cursor: (hasTranslations && !generatingPrompts) ? 'pointer' : 'not-allowed' })}>
                {generatingPrompts ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Prompts...</> : <><Zap size={12} /> Generate Video Prompts</>}
              </button>
              <button onClick={() => handleBatchGenerate(activeLang)} disabled={isBatchGenerating || !hasTranslations}
                style={btnSm({
                  background: (hasTranslations && !isBatchGenerating) ? `linear-gradient(135deg, ${C.accent}, ${C.accent2})` : '#374151',
                  cursor: (hasTranslations && !isBatchGenerating) ? 'pointer' : 'not-allowed', opacity: (hasTranslations && !isBatchGenerating) ? 1 : 0.5,
                })}>
                {isBatchGenerating ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Generating... ({vidCount}/{totalSegs})</> : <><FileVideo size={12} /> Generate All ({vidCount}/{totalSegs})</>}
              </button>
            </div>
          </div>

          {/* Segments table */}
          <div style={{ ...card, padding: '12px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '40px 80px 100px 1fr 80px 110px', gap: 8, padding: '0 16px 8px', borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, color: C.subtext, textTransform: 'uppercase' }}>
              <span>#</span><span>Frame</span><span>Speaker</span><span>Text</span><span>Duration</span><span>Actions</span>
            </div>

            {segmentsForLang.map((seg, i) => {
              const originalSeg = result!.segments[i];
              const vidUrl = segmentVids[i];
              const isGen = generatingLang === activeLang && (generatingIndex === i || generatingIndex === null);
              const expanded = expandedSegment === i;
              const spId = seg.speakerId || originalSeg?.speakerId || 1;
              const frameUrl = seg.sceneFrameUrl || originalSeg?.sceneFrameUrl || null;

              return (
                <div key={i}>
                  <div onClick={() => setExpandedSegment(expanded ? null : i)}
                    style={{ display: 'grid', gridTemplateColumns: '40px 80px 100px 1fr 80px 110px', gap: 8, padding: '10px 16px', alignItems: 'center', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', backgroundColor: expanded ? C.surfaceHover : 'transparent' }}>
                    <span style={{ fontSize: 12, color: C.subtext }}>{i + 1}</span>
                    <div style={{ width: 64, height: 36, borderRadius: 4, overflow: 'hidden', backgroundColor: '#000', border: `1px solid ${C.border}` }}>
                      {frameUrl ? (
                        <img src={frameUrl} alt={`Scene ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.subtext }}>—</div>
                      )}
                    </div>
                    <span style={chip(spId === 1 ? 'rgba(59,130,246,0.2)' : 'rgba(139,92,246,0.2)', spId === 1 ? C.accent : C.accent2)}>
                      {seg.speakerName || originalSeg?.speakerName || `S${spId}`}
                    </span>
                    <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {seg.translatedText || seg.text}
                    </span>
                    <span style={{ fontSize: 11, color: C.subtext }}>{seg.duration || originalSeg?.duration || '?'}s</span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleGenerateVideo(i, activeLang)} disabled={isGen} style={btnSm({
                        padding: '4px 8px', fontSize: 10,
                        backgroundColor: vidUrl ? C.success : (isGen ? '#374151' : C.accent),
                        cursor: isGen ? 'not-allowed' : 'pointer',
                      })} title={vidUrl ? 'Regenerate' : 'Generate video'}>
                        {isGen ? <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} /> : vidUrl ? <Check size={10} /> : <Play size={10} />}
                      </button>
                      <button onClick={() => setExpandedSegment(expanded ? null : i)} style={btnSm({ padding: '4px 6px', fontSize: 10, backgroundColor: 'transparent', border: `1px solid ${C.border}` })}>
                        {expanded ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {expanded && (
                    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.surfaceHover }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {frameUrl && (
                          <div style={{ width: 140, flexShrink: 0 }}>
                            <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>Scene Start Frame</div>
                            <img src={frameUrl} alt="Start frame" style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>Original ({formatDuration(seg.startTime || 0)}—{formatDuration(seg.endTime || 0)})</div>
                          <div style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 8 }}>{seg.text}</div>
                          {seg.translatedText && (
                            <>
                              <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>{activeLang === 'german' ? 'German' : activeLang === 'french' ? 'French' : 'English'} Translation</div>
                              <div style={{ fontSize: 12, lineHeight: 1.5, color: C.accent2, marginBottom: 8 }}>{seg.translatedText}</div>
                            </>
                          )}
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 10, color: C.subtext, marginBottom: 4, textTransform: 'uppercase' }}>Video Prompt (Omni Flash / Veo)</div>
                            <textarea 
                              value={customPrompts[i] || originalSeg?.videoPrompt || ''}
                              onChange={(e) => setCustomPrompts(p => ({ ...p, [i]: e.target.value }))}
                              placeholder="Enter custom prompt or click 'Generate Video Prompts' to fill automatically..."
                              style={{ width: '100%', minHeight: 60, backgroundColor: '#0d0d1a', border: `1px solid ${C.border}`, borderRadius: 6, padding: 8, color: '#fff', fontSize: 11, fontFamily: 'monospace', resize: 'vertical' }}
                            />
                          </div>
                        </div>
                        {vidUrl && (
                          <div style={{ width: 160, flexShrink: 0 }}>
                            <video src={vidUrl} controls style={{ width: '100%', height: 240, objectFit: 'cover', borderRadius: 8, backgroundColor: '#000' }} />
                            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                              <a href={vidUrl} download style={{ ...btnSm({ backgroundColor: C.success, fontSize: 10 }), textDecoration: 'none', flex: 1, textAlign: 'center' }}><Download size={10} /> Download</a>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {segmentsForLang.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: C.subtext }}>No segments found. Run analysis first.</div>
            )}
          </div>
        </>
      )}
        </div>
      </div>
    </div>
  );
};

export default LocalizeTab;
