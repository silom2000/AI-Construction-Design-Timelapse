const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  generateThemes: (userContext) => ipcRenderer.invoke('generate-themes', { userContext }),
  generateImage: (themeName, stageCount, aspectRatio) => ipcRenderer.invoke('generate-image', { themeName, stageCount, aspectRatio }),
  generateImageStage: (themeName, index, stageCount, aspectRatio) => ipcRenderer.invoke('generate-image-stage', { themeName, index, stageCount, aspectRatio }),
  regenerateSingleImage: (themeName, index, stageCount, aspectRatio) => ipcRenderer.invoke('regenerate-single-image', { themeName, index, stageCount, aspectRatio }),
  generateVideos: (themeName, stageCount) => ipcRenderer.invoke('generate-videos', { themeName, stageCount }),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', (event, data) => callback(data)),
  assembleFinalVideo: () => ipcRenderer.invoke('assemble-final-video'),
  onAssemblyProgress: (callback) => ipcRenderer.on('assembly-progress', (event, data) => callback(data))
});
