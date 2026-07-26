import React, { useState } from 'react';
import './App.css';
import SkeletonTab from './SkeletonTab';
import StudioTab from './StudioTab';
import GLabsTab from './GLabsTab';
import TimelapseTab from './TimelapseTab';
import { StoryTab } from './StoryTab';
import { SurviveTab } from './SurviveTab';
import CartoonTab from './CartoonTab';
import LocalizeTab from './LocalizeTab';
import PrimateCastTab from './PrimateCastTab';
import FrenchTalkTab from './FrenchTalkTab';
import './TimelapseTab.css';

type AppTab = 'timelapse' | 'skeleton' | 'health' | 'objects' | 'glabs' | 'story' | 'cartoon' | 'survive' | 'localize' | 'primatecast' | 'frenchtalk';

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('timelapse');

  React.useEffect(() => {
    // Leftover API validation if needed globally
  }, []);

  // Tab styles
  const tabStyle = (tab: AppTab): React.CSSProperties => ({
    padding: '10px 22px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
    border: 'none',
    borderBottom: activeTab === tab ? '2px solid #007acc' : '2px solid transparent',
    backgroundColor: 'transparent',
    color: activeTab === tab ? '#fff' : '#888',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div className="app" style={{ flexDirection: 'column' }}>

      {/* ── TOP TAB BAR ────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        backgroundColor: '#111', borderBottom: '1px solid #333',
        padding: '0 16px', height: '44px', flexShrink: 0, gap: '4px'
      }}>
        <button style={tabStyle('timelapse')} onClick={() => setActiveTab('timelapse')}>
          🏗️ AI Timelapse
        </button>
        <button style={tabStyle('skeleton')} onClick={() => setActiveTab('skeleton')}>
          💀 Skeleton Shorts
        </button>
        <button style={tabStyle('health')} onClick={() => setActiveTab('health')}>
          🩺 HealthTalk
        </button>
        <button style={tabStyle('objects')} onClick={() => setActiveTab('objects')}>
          📦 ObjectWars
        </button>
        <button style={tabStyle('story')} onClick={() => setActiveTab('story')}>
          📖 AI Stories
        </button>
        <button style={tabStyle('survive')} onClick={() => setActiveTab('survive')}>
          🆘 Survive
        </button>
        <button style={tabStyle('cartoon')} onClick={() => setActiveTab('cartoon')}>
          🎨 Cartoon Pro
        </button>
        <button style={tabStyle('localize')} onClick={() => setActiveTab('localize')}>
          🌍 Localize
        </button>
        {/*
        <button style={tabStyle('glabs')} onClick={() => setActiveTab('glabs')}>
          🧪 G-Labs
        </button>
        */}
        <button style={tabStyle('primatecast')} onClick={() => setActiveTab('primatecast')}>
          🎙️ PrimateCast
        </button>
        <button style={tabStyle('frenchtalk')} onClick={() => setActiveTab('frenchtalk')}>
          🇫🇷 FrenchTalk
        </button>
      </div>

      {/* ── TIMELAPSE TAB (CINEMATIC) ──────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'timelapse' ? 'flex' : 'none', flexDirection: 'column' }}>
        <TimelapseTab />
      </div>

      {/* ── STUDIO TABS ────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'health' ? 'flex' : 'none', flexDirection: 'column' }}>
        <StudioTab mode="health" />
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'objects' ? 'flex' : 'none', flexDirection: 'column' }}>
        <StudioTab mode="objects" />
      </div>

      {/* ── SKELETON TAB ───────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'skeleton' ? 'flex' : 'none', flexDirection: 'column' }}>
        <SkeletonTab />
      </div>

      {/* ── STORY TAB ──────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'story' ? 'flex' : 'none', flexDirection: 'column' }}>
        <StoryTab />
      </div>

      {/* ── CARTOON TAB ────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'cartoon' ? 'flex' : 'none', flexDirection: 'column' }}>
        <CartoonTab />
      </div>

      {/* ── SURVIVE TAB ────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'survive' ? 'flex' : 'none', flexDirection: 'column' }}>
        <SurviveTab />
      </div>

      {/* ── G-LABS TAB ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'glabs' ? 'flex' : 'none', flexDirection: 'column' }}>
        <GLabsTab />
      </div>

      {/* ── LOCALIZE TAB ─────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'localize' ? 'flex' : 'none', flexDirection: 'column' }}>
        <LocalizeTab />
      </div>

      {/* ── PRIMATECAST TAB ──────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'primatecast' ? 'flex' : 'none', flexDirection: 'column', backgroundColor: '#1e1e1e' }}>
        <PrimateCastTab />
      </div>

      {/* ── FRENCHTALK TAB ───────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: activeTab === 'frenchtalk' ? 'flex' : 'none', flexDirection: 'column', backgroundColor: '#0d0d1a' }}>
        <FrenchTalkTab />
      </div>

    </div>
  );
}

export default App;
