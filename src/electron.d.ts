export interface GLabsTask {
  task_id: string;
  type: 'image' | 'video';
  status: 'pending' | 'running' | 'completed' | 'failed';
  prompt: string;
  created_at: number;
  completed_at?: number;
  results?: string[];
  error?: string;
  error_code?: number;
}

export interface GLabsProgressData {
  taskId: string;
  status: string;
  type: 'image' | 'video';
  attempt?: number;
}

export interface SkeletonScene {
  scene: number;
  checkpoint: string;
  environment: string;
  script_line: string;
  visual_detail: string;
  motion_detail: string;
  image_prompt: string;
  video_prompt: string;
  ltx_video_prompt: string;
  audio_url?: string;
}

export interface StudioScene {
  id: number;
  character: string;
  line: string;
  organ?: string;
  action?: string;
  imagePrompt: string;
  videoPrompt: string;
  status: 'idle' | 'generating_images' | 'generating_video' | 'ready';
  generatedImages?: string[];
  selectedImage?: string;
  generatedVideoUrl?: string;
  audio_url?: string;
}

export interface StudioScript {
  intro: string;
  scenes: StudioScene[];
}

export interface IElectronAPI {
  getApiKey: () => Promise<string>,
  generateThemes: (userContext?: string) => Promise<string>,
  generateImage: (themeName: string, stageCount: number, aspectRatio: string, imageModel: string) => Promise<string[] | string>,
  generateImageStage: (themeName: string, index: number, stageCount: number, aspectRatio: string, imageModel: string) => Promise<string>,
  regenerateSingleImage: (themeName: string, index: number, stageCount: number, aspectRatio: string, imageModel: string) => Promise<string>,
  generateVideos: (themeName: string, stageCount: number, resolution: "720p" | "1080p", duration: "5" | "10") => Promise<string[]>,
  onImageProgress: (callback: (data: any) => void) => void,
  onVideoProgress: (callback: (data: any) => void) => void,
  validateApiKeys: () => Promise<any[]>,
  assembleFinalVideo: () => Promise<string>,
  onAssemblyProgress: (callback: (data: any) => void) => void,
  synthesizeUnifiedSpeech: (fullScript: string, language: string, voiceModel?: string) => Promise<string>,
  // Skeleton Shorteners stubs
  skeletonGenerateIdeas: (language: string) => Promise<string>,
  skeletonGenerateScript: (ideaTitle: string, language: string, videoModel: string) => Promise<{ script: string, scenes: SkeletonScene[] }>,
  skeletonGenerateImage: (data: any) => Promise<string>,
  skeletonGenerateAudio: (data: { script: string; scenes: SkeletonScene[]; language: string }) => Promise<{ fullAudioUrl: string; sceneAudioUrls: string[] }>,
  skeletonGenerateVideo: (data: any) => Promise<string>,
  skeletonAssembleVideo: (data: any) => Promise<string>,
  onSkeletonVideoProgress: (callback: (data: any) => void) => void,
  onSkeletonAssemblyProgress: (callback: (data: any) => void) => void,
  // Studio Tabs
  studioGenerateIdeas: (mode: 'health' | 'objects', language: string) => Promise<string[]>,
  studioGenerateScript: (mode: 'health' | 'objects', topic: string, language: string) => Promise<StudioScript>,
  studioAssembleVideo: (data: any) => Promise<string>,

  // G-Labs Integration
  glabsHealthCheck: () => Promise<{ running: boolean; tasks_pending?: number; tasks_running?: number; error?: string }>,
  glabsLaunch: () => Promise<{ success: boolean; error?: string }>,
  glabsListTasks: () => Promise<{ tasks: GLabsTask[] }>,
  glabsTaskStatus: (taskId: string) => Promise<GLabsTask>,
  glabsGenerateImage: (data: {
    prompt: string; model?: string; aspectRatio?: string;
    count?: number; section?: string; sceneIndex?: number;
  }) => Promise<string[]>,
  glabsGenerateVideo: (data: {
    prompt: string; model?: string; aspectRatio?: string;
    section?: string; sceneIndex?: number;
  }) => Promise<string>,
  onGLabsTaskProgress: (callback: (data: GLabsProgressData) => void) => void,
  removeGLabsProgressListener: () => void,
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
