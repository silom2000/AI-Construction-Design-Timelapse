const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  generateThemes: (userContext) => ipcRenderer.invoke('generate-themes', { userContext }),
  generateImage: (themeName, stageCount, aspectRatio, imageModel) => ipcRenderer.invoke('generate-image', { themeName, stageCount, aspectRatio, imageModel }),
  generateImageStage: (themeName, index, stageCount, aspectRatio, imageModel) => ipcRenderer.invoke('generate-image-stage', { themeName, index, stageCount, aspectRatio, imageModel }),
  regenerateSingleImage: (themeName, index, stageCount, aspectRatio, imageModel) => ipcRenderer.invoke('regenerate-single-image', { themeName, index, stageCount, aspectRatio, imageModel }),
  generateVideos: (themeName, stageCount, resolution, duration) => ipcRenderer.invoke('generate-videos', { themeName, stageCount, resolution, duration }),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', (event, data) => callback(data)),
  assembleFinalVideo: () => ipcRenderer.invoke('assemble-final-video'),
  onAssemblyProgress: (callback) => ipcRenderer.on('assembly-progress', (event, data) => callback(data)),

  // ── П.2: Прогресс генерации изображений ────────────────────────────────────
  onImageProgress: (callback) => ipcRenderer.on('image-progress', (event, data) => callback(data)),
  removeImageProgressListener: () => ipcRenderer.removeAllListeners('image-progress'),

  // ── П.3: Валидация API-ключей ───────────────────────────────────────────────
  validateApiKeys: () => ipcRenderer.invoke('validate-api-keys'),

  // ── П.1: Управление очередью задач ─────────────────────────────────────────
  getQueueTasks: () => ipcRenderer.invoke('get-queue-tasks'),
  cancelQueueTask: (taskId) => ipcRenderer.invoke('cancel-queue-task', { taskId }),

  // ── П.5: Управление кешем промптов ─────────────────────────────────────────
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  clearPromptCache: () => ipcRenderer.invoke('clear-prompt-cache'),

  // Skeleton Shorts
  skeletonGenerateIdeas: (language) => ipcRenderer.invoke('skeleton-generate-ideas', { language }),
  skeletonGenerateScript: (ideaTitle, language, videoModel) => ipcRenderer.invoke('skeleton-generate-script', { ideaTitle, language, videoModel }),
  skeletonGenerateImage: (data) => ipcRenderer.invoke('skeleton-generate-image', data),
  skeletonGenerateAudio: (data) => ipcRenderer.invoke('skeleton-generate-audio', data),
  skeletonGenerateVideo: (data) => ipcRenderer.invoke('skeleton-generate-video', data),
  skeletonAssembleVideo: (data) => ipcRenderer.invoke('skeleton-assemble-video', data),
  onSkeletonVideoProgress: (callback) => ipcRenderer.on('skeleton-video-progress', (event, data) => callback(data)),
  onSkeletonAssemblyProgress: (callback) => ipcRenderer.on('skeleton-assembly-progress', (event, data) => callback(data)),

  // Studio Tabs
  studioGenerateIdeas: (mode, language) => ipcRenderer.invoke('studio-generate-ideas', { mode, language }),
  studioGenerateScript: (mode, topic, language) => ipcRenderer.invoke('studio-generate-script', { mode, topic, language }),
  studioAssembleVideo: (data) => ipcRenderer.invoke('studio-assemble-video', data),

  // G-Labs Integration
  glabsHealthCheck: () => ipcRenderer.invoke('glabs-health-check'),
  glabsLaunch: () => ipcRenderer.invoke('glabs-launch'),
  glabsListTasks: () => ipcRenderer.invoke('glabs-list-tasks'),
  glabsTaskStatus: (taskId) => ipcRenderer.invoke('glabs-task-status', { taskId }),
  glabsGenerateImage: (data) => ipcRenderer.invoke('glabs-generate-image', data),
  glabsGenerateVideo: (data) => ipcRenderer.invoke('glabs-generate-video', data),
  onGLabsTaskProgress: (callback) => ipcRenderer.on('glabs-task-progress', (event, data) => callback(data)),
  removeGLabsProgressListener: () => ipcRenderer.removeAllListeners('glabs-task-progress'),
});
