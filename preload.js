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

  // New Cinematic Timelapse Handlers
  timelapseGetEnvironments: (mode) => ipcRenderer.invoke('timelapse-get-environments', { mode }),
  timelapseGeneratePrompts: (selectionIndex, selectedEnv) => ipcRenderer.invoke('timelapse-generate-prompts', { selectionIndex, selectedEnv }),
  timelapseGenerateCustomPrompts: (customIdea, images, video, mode) => ipcRenderer.invoke('timelapse-generate-custom-prompts', { customIdea, images, video, mode }),
  timelapseGenerateReversePrompts: (baseImage) => ipcRenderer.invoke('timelapse-generate-reverse-prompts', { baseImage }),
  timelapseGenerateImage: (imgIndex, prompt, model, subFolder, referenceImage) => ipcRenderer.invoke('timelapse-generate-image', { imgIndex, prompt, model, subFolder, referenceImage }),
  timelapseGenerateVideo: (videoIndex, prompt, subFolder, referenceImages, videoModel) => ipcRenderer.invoke('timelapse-generate-video', { videoIndex, prompt, subFolder, referenceImages, videoModel }),
  timelapseAssemble: (subFolder, projectTitle) => ipcRenderer.invoke('timelapse-assemble', { subFolder, projectTitle }),


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
  studioGenerateIdeas: (mode, language, provider) => ipcRenderer.invoke('studio-generate-ideas', { mode, language, provider }),
  studioGenerateScript: (mode, topic, language, provider) => ipcRenderer.invoke('studio-generate-script', { mode, topic, language, provider }),
  studioAssembleVideo: (data) => ipcRenderer.invoke('studio-assemble-video', data),
  saveTextFiles: (files) => ipcRenderer.invoke('save-text-files', files),

  // AI Stories
  storyCreateFolder: () => ipcRenderer.invoke('story-create-folder'),
  storyGenerateIdeas: (topic, language) => ipcRenderer.invoke('story-generate-ideas', { topic, language }),
  storyGenerateScript: (data) => ipcRenderer.invoke('story-generate-script', data),
  storyGenerateImage: (data) => ipcRenderer.invoke('story-generate-image', data),
  storyGenerateAudio: (data) => ipcRenderer.invoke('story-generate-audio', data),
  storyGenerateVideo: (data) => ipcRenderer.invoke('story-generate-video', data),
  storyAssemble: (data) => ipcRenderer.invoke('story-assemble', data),
  onStoryVideoProgress: (callback) => ipcRenderer.on('story-video-progress', (event, data) => callback(data)),
  onStoryImageProgress: (callback) => ipcRenderer.on('story-image-progress', (event, data) => callback(data)),

  // Cartoon Profession Stories
  cartoonCreateFolder: () => ipcRenderer.invoke('cartoon-create-folder'),
  cartoonGenerateIdeas: (data) => ipcRenderer.invoke('cartoon-generate-ideas', data),
  cartoonGenerateScript: (data) => ipcRenderer.invoke('cartoon-generate-script', data),
  cartoonGenerateImage: (data) => ipcRenderer.invoke('cartoon-generate-image', data),
  cartoonGenerateAudio: (data) => ipcRenderer.invoke('cartoon-generate-audio', data),
  cartoonGenerateVideo: (data) => ipcRenderer.invoke('cartoon-generate-video', data),

  // Survive — Extreme Survival Scenarios
  surviveGenerateIdeas: (data) => ipcRenderer.invoke('survive-generate-ideas', data),
  surviveGenerateScript: (data) => ipcRenderer.invoke('survive-generate-script', data),
  surviveGenerateImage: (data) => ipcRenderer.invoke('survive-generate-image', data),
  surviveGenerateAudio: (data) => ipcRenderer.invoke('survive-generate-audio', data),
  surviveGenerateVideo: (data) => ipcRenderer.invoke('survive-generate-video', data),

  // TikTok Video Localizer — Dialogue Processing
  localizeStep1STT: (params) => ipcRenderer.invoke('localize-step1-stt', params),
  localizeStep2Diarize: (params) => ipcRenderer.invoke('localize-step2-diarize', params),
  localizeStep3Characters: (params) => ipcRenderer.invoke('localize-step3-characters', params),
  localizeStep4Voices: (params) => ipcRenderer.invoke('localize-step4-voices', params),
  localizeTranslateSegments: (projectFolder, segments, targetLanguage) => ipcRenderer.invoke('localize-translate-segments', { projectFolder, segments, targetLanguage }),
  localizeGenerateMetadata: (projectFolder, transcript, targetLanguage, originalTitle) => ipcRenderer.invoke('localize-generate-metadata', { projectFolder, transcript, targetLanguage, originalTitle }),
  localizeGenerateSegmentVideo: (data) => ipcRenderer.invoke('localize-generate-segment-video', data),
  localizeBatchGenerateSegments: (data) => ipcRenderer.invoke('localize-batch-generate-segments', data),
  localizeRegenerateCharacterImage: (projectFolder, characterIndex, customPrompt) => ipcRenderer.invoke('localize-regenerate-character-image', { projectFolder, characterIndex, customPrompt }),
  localizeRetranslate: (projectFolder, transcript, targetLanguage) => ipcRenderer.invoke('localize-retranslate', { projectFolder, transcript, targetLanguage }),
  localizeExtractFrames: (videoBase64, timestamps, projectFolder) => ipcRenderer.invoke('localize-extract-frames', { videoBase64, timestamps, projectFolder }),
  localizeGenerateVideoPrompts: (params) => ipcRenderer.invoke('localize-generate-video-prompts', params),

  // G-Labs Integration
  glabsHealthCheck: () => ipcRenderer.invoke('glabs-health-check'),
  glabsLaunch: () => ipcRenderer.invoke('glabs-launch'),
  glabsListTasks: () => ipcRenderer.invoke('glabs-list-tasks'),
  glabsTaskStatus: (taskId) => ipcRenderer.invoke('glabs-task-status', { taskId }),
  glabsGenerateImage: (data) => ipcRenderer.invoke('glabs-generate-image', data),
  glabsGenerateVideo: (data) => ipcRenderer.invoke('glabs-generate-video', data),
  onGLabsTaskProgress: (callback) => ipcRenderer.on('glabs-task-progress', (event, data) => callback(data)),
  removeGLabsProgressListener: () => ipcRenderer.removeAllListeners('glabs-task-progress'),

  // FrenchTalk
  frenchtalkGenerateStranger: (data) => ipcRenderer.invoke('frenchtalk-generate-stranger', data),
  frenchtalkResetStrangerRef: (data) => ipcRenderer.invoke('frenchtalk-reset-stranger-ref', data),
  frenchtalkGenerateBloggerIdea: (data) => ipcRenderer.invoke('frenchtalk-generate-blogger-idea', data),
  frenchtalkGenerateBaseImage: (data) => ipcRenderer.invoke('frenchtalk-generate-base-image', data),
  frenchtalkSaveBlogger: (data) => ipcRenderer.invoke('frenchtalk-save-blogger', data),
  frenchtalkGetBlogger: () => ipcRenderer.invoke('frenchtalk-get-blogger'),
  frenchtalkDeleteBlogger: () => ipcRenderer.invoke('frenchtalk-delete-blogger'),
  frenchtalkGetSeoKeywords: (data) => ipcRenderer.invoke('frenchtalk-get-seo-keywords', data),
  frenchtalkAutoTopic: (data) => ipcRenderer.invoke('frenchtalk-auto-topic', data),
  frenchtalkAnalyzeVideo: (data) => ipcRenderer.invoke('frenchtalk-analyze-video', data),
  frenchtalkGenerateSegment: (data) => ipcRenderer.invoke('frenchtalk-generate-segment', data),
  frenchtalkSaveAllPrompts: (data) => ipcRenderer.invoke('frenchtalk-save-all-prompts', data),
  frenchtalkGenerateLocationRef: (data) => ipcRenderer.invoke('frenchtalk-generate-location-ref', data),
  frenchtalkGetLocationRefs: () => ipcRenderer.invoke('frenchtalk-get-location-refs'),
  frenchtalkAutoVlogTopic: (data) => ipcRenderer.invoke('frenchtalk-auto-vlog-topic', data),
  onFrenchTalkProgress: (callback) => ipcRenderer.on('frenchtalk-progress', (event, data) => callback(data)),
  removeFrenchTalkProgressListener: () => ipcRenderer.removeAllListeners('frenchtalk-progress'),

  // PrimateCast
  primatecastGenerateCharacterIdea: (data) => ipcRenderer.invoke('primatecast-generate-character-idea', data),
  primatecastGenerateBaseImage: (data) => ipcRenderer.invoke('primatecast-generate-base-image', data),
  primatecastSaveCharacter: (data) => ipcRenderer.invoke('primatecast-save-character', data),
  primatecastGetCharacters: () => ipcRenderer.invoke('primatecast-get-characters'),
  primatecastDeleteCharacter: (id) => ipcRenderer.invoke('primatecast-delete-character', { id }),
  primatecastGenerateEpisode: (data) => ipcRenderer.invoke('primatecast-generate-episode', data),
  primatecastGenerateSegment: (data) => ipcRenderer.invoke('primatecast-generate-segment', data),
  primatecastAutoTopic: (data) => ipcRenderer.invoke('primatecast-auto-topic', data),
  primatecastGetSeoKeywords: (data) => ipcRenderer.invoke('primatecast-get-seo-keywords', data),
  primatecastAnalyzeVideo: (data) => ipcRenderer.invoke('primatecast-analyze-video', data),
  primatecastSaveAllPrompts: (data) => ipcRenderer.invoke('primatecast-save-all-prompts', data),
  onPrimatecastProgress: (callback) => ipcRenderer.on('primatecast-progress', (event, data) => callback(data)),
  removePrimatecastProgressListener: () => ipcRenderer.removeAllListeners('primatecast-progress'),
});
