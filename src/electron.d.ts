export interface IElectronAPI {
  getApiKey: () => Promise<string>,
  generateThemes: (userContext?: string) => Promise<string>,
  generateImage: (themeName: string, stageCount: number, aspectRatio: string) => Promise<string[] | string>,
  generateImageStage: (themeName: string, index: number, stageCount: number, aspectRatio: string) => Promise<string>,
  regenerateSingleImage: (themeName: string, index: number, stageCount: number, aspectRatio: string) => Promise<string>,
  generateVideos: (themeName: string, stageCount: number) => Promise<string[]>,
  onVideoProgress: (callback: (data: any) => void) => void,
  assembleFinalVideo: () => Promise<string>,
  onAssemblyProgress: (callback: (data: any) => void) => void
}

declare global {
  interface Window {
    electronAPI: IElectronAPI
  }
}
