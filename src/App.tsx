import React, { useState } from 'react';
import './App.css';

interface Theme {
  id: number;
  name: string;
}

function App() {
  const [themes, setThemes] = useState<Theme[]>(() => {
    const saved = localStorage.getItem('themes');
    return saved ? JSON.parse(saved) : Array.from({ length: 15 }, (_, i) => ({
      id: i,
      name: `Тема ${i + 1}`,
    }));
  });

  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);
  const [isLoadingThemes, setIsLoadingThemes] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [stageCount, setStageCount] = useState(6);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [generatedImageUrls, setGeneratedImageUrls] = useState<(string | null)[]>(new Array(6).fill(null));
  const [loadingStages, setLoadingStages] = useState<boolean[]>(new Array(6).fill(false));
  const [regeneratingStages, setRegeneratingStages] = useState<boolean[]>(new Array(6).fill(false));

  // Video generation state
  const [isGeneratingVideos, setIsGeneratingVideos] = useState(false);
  const [videoProgress, setVideoProgress] = useState({ current: 0, total: 5, status: '' });
  const [generatedVideos, setGeneratedVideos] = useState<string[]>([]);

  // Assembly state
  const [isAssemblingVideo, setIsAssemblingVideo] = useState(false);
  const [assemblyProgress, setAssemblyProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  const [userContext, setUserContext] = useState("Luxury Interior Renovation");

  React.useEffect(() => {
    // Listen for video progress updates
    window.electronAPI.onVideoProgress((data) => {
      console.log('[Video Progress]', data);
      setVideoProgress({
        current: data.current,
        total: data.total,
        status: data.status || ''
      });
    });

    // Listen for assembly progress updates
    window.electronAPI.onAssemblyProgress((data) => {
      setAssemblyProgress(data.progress);
    });
  }, []);

  React.useEffect(() => {
    localStorage.setItem('themes', JSON.stringify(themes));
  }, [themes]);

  const handleResetThemes = () => {
    setThemes([]);
    setSelectedTheme(null);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    localStorage.removeItem('themes');
  };

  const handleThemeSelection = (theme: Theme) => {
    setSelectedTheme(theme);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    setLoadingStages(new Array(stageCount).fill(false));
    setRegeneratingStages(new Array(stageCount).fill(false));
  };

  const handleGenerateThemes = async () => {
    setIsLoadingThemes(true);
    setSelectedTheme(null);
    setGeneratedImageUrls(new Array(stageCount).fill(null));
    try {
      const content = await window.electronAPI.generateThemes(userContext);

      const newThemes = content
        .split('\n')
        .map((line: string) => line.trim())
        .filter((line: string) => /^\d+\./.test(line))
        .map((line: string, index: number) => {
          // Extract text between ** if present, or just take everything after Number.
          const boldMatch = line.match(/\*\*(.*?)\*\*/);
          let name = "";
          if (boldMatch) {
            name = boldMatch[1];
          } else {
            name = line.replace(/^\d+\.\s*/, '');
          }

          // Clean up potential trailing colons or extra labels
          name = name.replace(/Project Type.*$/i, '').replace(/:\s*$/, '').trim();

          return {
            id: index,
            name: name || `Вариант ${index + 1}`,
          };
        });

      if (newThemes.length > 0) {
        setThemes(newThemes);
      } else {
        console.warn("Could not parse themes from response:", content);
        if (content) {
          setThemes([{ id: 0, name: content.substring(0, 100).replace(/\*\*/g, '') + "..." }]);
        }
      }

    } catch (error) {
      console.error("Failed to generate themes:", error);
      alert("Ошибка генерации тем. Проверьте API ключи.");
    } finally {
      setIsLoadingThemes(false);
    }
  };

  const _generateStageInternal = async (index: number) => {
    if (!selectedTheme) return;

    setLoadingStages(prev => {
      const newArr = [...prev];
      if (newArr.length < stageCount) {
        const temp = new Array(stageCount).fill(false);
        prev.forEach((v, i) => temp[i] = v);
        temp[index] = true;
        return temp;
      }
      newArr[index] = true;
      return newArr;
    });

    try {
      const rawUrl = await window.electronAPI.generateImageStage(selectedTheme.name, index, stageCount, aspectRatio);
      const newUrl = `${rawUrl}?t=${Date.now()}`;

      setGeneratedImageUrls(prev => {
        const newArr = [...prev];
        if (newArr.length < stageCount) {
          const temp = new Array(stageCount).fill(null);
          prev.forEach((v, i) => temp[i] = v);
          temp[index] = newUrl;
          return temp;
        }
        newArr[index] = newUrl;
        return newArr;
      });
      return newUrl;
    } catch (err) {
      console.error(`Failed to generate stage ${index + 1}:`, err);
      throw err;
    } finally {
      setLoadingStages(prev => {
        const newArr = [...prev];
        if (newArr[index] !== undefined) newArr[index] = false;
        return newArr;
      });
    }
  };

  const handleGenerateImage = async () => {
    if (!selectedTheme) return;
    setIsGeneratingImage(true);
    setGeneratedImageUrls(new Array(stageCount).fill(null));

    try {
      // 1. Generate prompts and Stage 1
      const imageUrls = await window.electronAPI.generateImage(selectedTheme.name, stageCount, aspectRatio);
      const timestamp = Date.now();

      let stage1Url = null;
      if (Array.isArray(imageUrls)) {
        stage1Url = imageUrls[0] ? `${imageUrls[0]}?t=${timestamp}` : null;
      } else if (typeof imageUrls === 'string') {
        stage1Url = `${imageUrls}?t=${timestamp}`;
      }

      setGeneratedImageUrls(() => {
        const newArr = new Array(stageCount).fill(null);
        newArr[0] = stage1Url;
        return newArr;
      });

      if (!stage1Url) throw new Error("Stage 1 failed to generate");

      // 2. Automatically loop through remaining stages
      for (let i = 1; i < stageCount; i++) {
        console.log(`Auto-advancing to stage ${i + 1}...`);
        await _generateStageInternal(i);
      }

    } catch (error) {
      console.error("Failed full sequence generation:", error);
      alert("Сбой при автоматической генерации. Попробуйте сгенерировать оставшиеся этапы вручную.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleGenerateStage = async (index: number) => {
    try {
      await _generateStageInternal(index);
    } catch (err) {
      alert("Не удалось сгенерировать изображение этапа.");
    }
  };

  const handleRegenerateSingle = async (index: number) => {
    if (!selectedTheme) return;
    setRegeneratingStages(prev => {
      const newArr = [...prev];
      if (newArr.length < stageCount) {
        const temp = new Array(stageCount).fill(false);
        prev.forEach((v, i) => temp[i] = v);
        temp[index] = true;
        return temp;
      }
      newArr[index] = true;
      return newArr;
    });

    try {
      const rawUrl = await window.electronAPI.regenerateSingleImage(selectedTheme.name, index, stageCount, aspectRatio);
      const newUrl = `${rawUrl}?t=${Date.now()}`;
      setGeneratedImageUrls(prev => {
        const newArr = [...prev];
        if (newArr.length < stageCount) {
          const temp = new Array(stageCount).fill(null);
          prev.forEach((v, i) => temp[i] = v);
          temp[index] = newUrl;
          return temp;
        }
        newArr[index] = newUrl;
        return newArr;
      });
    } catch (err) {
      console.error("Failed to regenerate single image:", err);
      alert("Не удалось перегенерировать изображение.");
    } finally {
      setRegeneratingStages(prev => {
        const newArr = [...prev];
        if (newArr[index] !== undefined) newArr[index] = false;
        return newArr;
      });
    }
  };

  const handleGenerateVideos = async () => {
    if (!selectedTheme) return;

    const allImagesGenerated = generatedImageUrls.slice(0, stageCount).every(url => url !== null);
    if (!allImagesGenerated) {
      alert(`Сначала сгенерируйте все ${stageCount} изображений!`);
      return;
    }

    setIsGeneratingVideos(true);
    setVideoProgress({ current: 0, total: stageCount - 1, status: 'starting' });

    try {
      const videos = await window.electronAPI.generateVideos(selectedTheme.name, stageCount);
      setGeneratedVideos(videos);
      alert(`Все ${stageCount - 1} видео успешно сгенерированы!`);
    } catch (error) {
      console.error('Failed to generate videos:', error);
      alert(`Ошибка генерации видео: ${error}`);
    } finally {
      setIsGeneratingVideos(false);
    }
  };

  const handleAssembleVideo = async () => {
    if (generatedVideos.length === 0) {
      // Small fallback: check if we have urls even if state is empty (e.g. on reload)
      const hasVideos = generatedVideos.length > 0;
      if (!hasVideos) {
        alert('Сначала сгенерируйте видео!');
        return;
      }
    }

    setIsAssemblingVideo(true);
    setAssemblyProgress(0);

    try {
      const resultUrl = await window.electronAPI.assembleFinalVideo();
      setFinalVideoUrl(resultUrl);
      alert('Финальное видео успешно собрано!');
    } catch (error) {
      console.error('Failed to assemble video:', error);
      alert(`Ошибка сборки видео: ${error}`);
    } finally {
      setIsAssemblingVideo(false);
    }
  };

  return (
    <div className="app">
      <div className="sidebar">
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#aaa' }}>
            Контекст проекта (что строим?):
          </label>
          <input
            type="text"
            value={userContext}
            onChange={(e) => setUserContext(e.target.value)}
            placeholder="Например: Пирамиды Египта или Постройка Небоскреба"
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              color: '#fff',
              borderRadius: '4px',
              fontSize: '14px',
              marginBottom: '15px'
            }}
          />

          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Сцены:</label>
              <select
                value={stageCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setStageCount(val);
                  setGeneratedImageUrls(new Array(val).fill(null));
                }}
                style={{ width: '100%', padding: '8px', backgroundColor: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              >
                {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => <option key={n} value={n}>{n} стадий</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Формат:</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                style={{ width: '100%', padding: '8px', backgroundColor: '#222', color: '#fff', border: '1px solid #444', borderRadius: '4px' }}
              >
                <option value="9:16">Portrait 9:16</option>
                <option value="16:9">Landscape 16:9</option>
              </select>
            </div>
          </div>
        </div>
        <button className="generate-button" onClick={handleGenerateThemes} disabled={isLoadingThemes}>
          {isLoadingThemes ? 'Генерация тем...' : 'Генерировать Темы Shorts'}
        </button>
        <button className="reset-button" onClick={handleResetThemes} style={{ marginTop: '10px', backgroundColor: '#d9534f' }}>
          Сброс (Очистить список)
        </button>


        <div className="theme-list">
          {themes.map((theme) => (
            <div
              key={theme.id}
              className={`theme-item ${selectedTheme?.id === theme.id ? 'selected' : ''}`}
              onClick={() => handleThemeSelection(theme)}
            >
              <label>{theme.name}</label>
            </div>
          ))}
        </div>
      </div>
      <div className="main-content">
        <header className="app-header">
          <h1>AI Construction & Design Timelapse</h1>
        </header>
        <div className="image-generation-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', overflowY: 'auto' }}>
          {isGeneratingImage ? (
            <div className="loading-indicator" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>
              Генерация начального изображения...
            </div>
          ) : generatedImageUrls.length > 0 || selectedTheme ? (
            Array.from({ length: stageCount }).map((_, idx) => {
              const url = generatedImageUrls[idx];
              const prevUrl = idx > 0 ? generatedImageUrls[idx - 1] : true;
              const isPreviousReady = !!prevUrl;

              return (
                <div key={idx} className="image-card" style={{ display: 'flex', flexDirection: 'column', gap: '5px', minHeight: '350px', backgroundColor: '#222', borderRadius: '8px', padding: '10px' }}>

                  <div style={{ flexGrow: 1, height: '0', minHeight: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '8px', backgroundColor: '#333' }}>
                    {url ? (
                      <img
                        src={url}
                        alt={`Stage ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onError={(e) => console.error(`Failed to load image: ${url}`, e)}
                      />
                    ) : (
                      <span style={{ color: '#666' }}>
                        {!isPreviousReady ? "Ожидание..." : "Нет изображения"}
                      </span>
                    )}
                  </div>

                  <p style={{ textAlign: 'center', color: '#ccc', margin: '5px 0' }}>Stage {idx + 1}</p>

                  <div style={{ display: 'flex', gap: '5px', marginTop: 'auto' }}>
                    <button
                      onClick={() => idx === 0 ? handleGenerateImage() : handleGenerateStage(idx)}
                      disabled={!!url || !isPreviousReady || loadingStages[idx]}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: loadingStages[idx] ? '#ffa500' : ((!!url || !isPreviousReady) ? '#444' : '#007bff'),
                        color: (!!url || !isPreviousReady) ? '#888' : 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: (!!url || !isPreviousReady || loadingStages[idx]) ? 'default' : 'pointer',
                        fontSize: '0.8rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                    >
                      {loadingStages[idx] && (
                        <span className="spinner" style={{
                          width: '12px',
                          height: '12px',
                          border: '2px solid #fff',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                      )}
                      {loadingStages[idx] ? 'Генерация...' : 'Генерировать'}
                    </button>
                    <button
                      onClick={() => handleRegenerateSingle(idx)}
                      disabled={!url || regeneratingStages[idx]}
                      className={url ? "regenerate-btn" : ""}
                      style={{
                        flex: 1,
                        padding: '8px',
                        backgroundColor: regeneratingStages[idx] ? '#ff8c00' : (!url ? '#444' : '#555'),
                        color: !url ? '#888' : '#fff',
                        border: !url ? 'none' : '1px solid #777',
                        borderRadius: '4px',
                        cursor: (!url || regeneratingStages[idx]) ? 'default' : 'pointer',
                        fontSize: '0.8rem',
                        transition: 'all 0.1s ease',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '5px'
                      }}
                      onMouseDown={(e) => url && !regeneratingStages[idx] && (e.currentTarget.style.transform = 'scale(0.95)')}
                      onMouseUp={(e) => url && (e.currentTarget.style.transform = 'scale(1)')}
                      onMouseLeave={(e) => url && (e.currentTarget.style.transform = 'scale(1)')}
                    >
                      {regeneratingStages[idx] && (
                        <span className="spinner" style={{
                          width: '12px',
                          height: '12px',
                          border: '2px solid #fff',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                      )}
                      {regeneratingStages[idx] ? 'Обработка...' : 'Перегенерировать'}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="placeholder" style={{ gridColumn: '1 / -1' }}>
              Выберите тему и нажмите "Генерировать изображения"
            </div>
          )}
        </div>
        {selectedTheme && (
          <button
            className="generate-image-button"
            onClick={handleGenerateImage}
            disabled={isGeneratingImage}
            style={{
              backgroundColor: isGeneratingImage ? '#ffa500' : '#28a745',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              margin: '0 auto'
            }}
          >
            {isGeneratingImage && (
              <span className="spinner" />
            )}
            {isGeneratingImage ? 'Генерация изображений...' : 'Генерировать изображения'}
          </button>
        )}
        {selectedTheme && generatedImageUrls.slice(0, stageCount).every(url => url !== null) && (
          <button
            className="generate-image-button"
            onClick={handleGenerateVideos}
            disabled={isGeneratingVideos}
            style={{
              backgroundColor: isGeneratingVideos ? '#ff8c00' : '#17a2b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              margin: '10px auto 0'
            }}
          >
            {isGeneratingVideos && (
              <span className="spinner" />
            )}
            {isGeneratingVideos
              ? `Генерация видео ${videoProgress.current + 1}/${videoProgress.total}... (${videoProgress.status})`
              : `Генерировать видео (${stageCount - 1} шт)`
            }
          </button>
        )}
        {(generatedVideos.length > 0 || generatedImageUrls.every(url => url !== null)) && (
          <button
            className="generate-image-button"
            onClick={handleAssembleVideo}
            disabled={isAssemblingVideo || isGeneratingVideos}
            style={{
              backgroundColor: isAssemblingVideo ? '#6f42c1' : '#6610f2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              margin: '10px auto 0'
            }}
          >
            {isAssemblingVideo && <span className="spinner" />}
            {isAssemblingVideo
              ? `Сборка видео... ${assemblyProgress}%`
              : 'Собрать финальное видео с музыкой'
            }
          </button>
        )}

        {finalVideoUrl && (
          <div style={{ marginTop: '20px', textAlign: 'center', backgroundColor: '#2a2a2a', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
            <h3 style={{ color: '#28a745', margin: '0 0 10px 0', fontSize: '1.1rem' }}>✅ Финальное видео готово!</h3>
            <video
              src={finalVideoUrl}
              controls
              style={{ width: '100%', borderRadius: '4px', marginBottom: '10px' }}
            />
            <a
              href={finalVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#007acc', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 'bold' }}
            >
              📂 Открыть финальный ролик
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;

