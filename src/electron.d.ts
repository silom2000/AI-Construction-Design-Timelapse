// TikTok Video Localizer
export interface LocalizeCharacter {
  name: string;
  description: string;
  appearance: string;
  imagePrompt: string;
  generatedImageUrl?: string | null;
  bestFrameUrl?: string | null;
}

export interface DialogueSpeaker {
  id: number;
  name: string;
  description: string;
  gender?: 'male' | 'female';
  vocalPersona?: string;
  emotionalBaseline?: string;
  voiceProfile?: {
    gender: 'male' | 'female';
    ageRange: string;
    timbre: string;
    style: string;
    speed: number;
    pitch: string;
    emotionalTone: string;
    vocalPersona?: string;
    emotionalBaseline?: string;
    voiceSearchKeywords: string[];
  };
  voiceId?: string;
  voiceName?: string;
}

export interface DialogueSegment {
  speakerId: number;
  speakerName: string;
  text: string;
  translatedText?: string;
  startTime: number;
  endTime: number;
  duration: number;
  sceneType?: string;
  emotion?: string;
  vocalDelivery?: string;
  videoUrl?: string;
  audioUrl?: string;
  sceneFrameUrl?: string;
  sceneFrameBase64?: string;
  cleanUrl?: string | null;
  cleanBase64?: string | null;
  videoPrompt?: string;
  lipsyncApplies?: boolean;
  isAnimated?: boolean;
}

export interface DialogueResult {
  projectFolder: string;
  transcript: string;
  transcriptWords: any[];
  sceneDescription: string;
  speakers: DialogueSpeaker[];
  segments: DialogueSegment[];
  characters: LocalizeCharacter[];
  frames: string[];
  sceneFrames?: Array<{ index: number; timestamp: number; url: string | null }>;
  voiceProfiles?: Record<number, any>;
  speakerVoices?: Record<number, { voice_id: string; name: string; public_owner_id: string | null }>;
  videoUrl: string;
}

export interface VideoPromptData {
  segmentIndex: number;
  videoPrompt: string;
  cameraAngle: string;
  emotion: string;
  action: string;
  environmentDescription: string;
  isAnimated: boolean;
  duration: number;
  status: string;
  translatedText?: string;
}

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

export interface SocialPost {
  title: string;
  description: string;
  hashtags: string;
}

export interface StudioScript {
  intro: string;
  socialPost?: SocialPost;
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
  // Image & Video generation (used by StudioTab)
  skeletonGenerateImage: (data: any) => Promise<string>,
  skeletonGenerateVideo: (data: any) => Promise<string>,
  
  // Cinematic Timelapse
  timelapseGetEnvironments: (mode?: string) => Promise<string[]>,
  timelapseGeneratePrompts: (selectionIndex: number, selectedEnv: string, provider?: string) => Promise<any>,
  timelapseGenerateCustomPrompts: (customIdea: string, images: (string | null)[], video: string | null, mode?: string, provider?: string) => Promise<any>,
  timelapseGenerateReversePrompts: (baseImage: string) => Promise<any>,
  timelapseGenerateImage: (imgIndex: number, prompt: string, model?: string, subFolder?: string, referenceImage?: string | null) => Promise<string>,
  timelapseGenerateVideo: (videoIndex: number, prompt: string, subFolder?: string, referenceImages?: (string | null)[], videoModel?: string) => Promise<string>,
  timelapseAssemble: (subFolder?: string, projectTitle?: string) => Promise<string>,

  // Studio Tabs
  studioGenerateIdeas: (mode: 'health' | 'objects' | 'psychology', language: string, provider?: string) => Promise<string[]>,
  studioGenerateScript: (
    modeOrParams: 'health' | 'objects' | 'psychology' | {
      mode: 'health' | 'objects' | 'psychology';
      topic?: string;
      language: string;
      provider?: string;
      projectFolder?: string;
      referenceUrl?: string;
      screenshotBase64?: string;
      videoBase64?: string;
      durationMode?: '30s' | 'full';
    },
    topic?: string,
    language?: string,
    provider?: string,
    projectFolder?: string,
    referenceUrl?: string,
    durationMode?: '30s' | 'full'
  ) => Promise<StudioScript>,
  studioParseReferenceVideo: (referenceUrl: string) => Promise<{ url: string; transcript: string } | null>,
  studioParseScreenshot: (screenshotBase64: string) => Promise<{ text: string } | null>,
  onStudioProgress: (callback: (data: { status: string; progress?: number }) => void) => void,
  removeStudioProgressListener: () => void,
  studioSaveScript: (data: { projectFolder: string; script: StudioScript; mode?: string; topic?: string; language?: string }) => Promise<{ success: boolean; error?: string }>,
  studioAssembleVideo: (data: any) => Promise<string>,
  saveTextFiles: (files: { filename: string; content: string }[]) => Promise<{ success: boolean; error?: string }>,

  // AI Stories
  storyCreateFolder: () => Promise<string>,
  storyGenerateIdeas: (topic: string, language: string, provider?: string) => Promise<any>,
  storyGenerateScript: (params: { idea: any, language: string, projectFolder: string, provider?: string }) => Promise<any>,
  storyGenerateImage: (data: any) => Promise<string>,
  storyGenerateAudio: (data: any) => Promise<string>,
  storyGenerateVideo: (data: any) => Promise<string>,
  onStoryVideoProgress: (callback: (data: any) => void) => void,
  onStoryImageProgress: (callback: (data: any) => void) => void,

  // Survive вЂ” Extreme Survival Scenarios
  surviveGenerateIdeas: (params: { language: string, aiModel?: string }) => Promise<any[]>,
  surviveGenerateScript: (params: { idea: any, language: string, projectFolder: string, aiModel?: string }) => Promise<any>,
  surviveGenerateImage: (data: any) => Promise<string>,
  surviveGenerateAudio: (data: any) => Promise<string>,
  surviveGenerateVideo: (data: any) => Promise<string>,

  // TikTok Video Localizer — Dialogue Processing
  localizeStep1STT: (params: { videoBase64: string }) => Promise<{ projectFolder: string, transcript: string, transcriptWords: any[], utterances: any[], frames: any[], videoUrl: string }>,
  localizeStep2Diarize: (params: { projectFolder: string, transcriptWords: any[], utterances: any[], frames: any[] }) => Promise<{ speakers: any[], timeline: any[], segments: any[], sceneFrames: any[] }>,
  localizeStep3Characters: (params: { projectFolder: string, frames: any[], sceneFrames?: any[], segments?: any[], speakers: any[] }) => Promise<{ characters: any[], sceneDescription: string, sceneFrames?: any[] }>,
  localizeStep4Voices: (params: { projectFolder: string, segments: any[], speakers: any[] }) => Promise<{ voiceProfiles: any, speakerVoices: any, speakers: any[] }>,
  localizeTranslateSegments: (projectFolder: string, segments: DialogueSegment[], targetLanguage: string, provider?: string) => Promise<DialogueSegment[]>,
  localizeGenerateMetadata: (projectFolder: string, transcript: string, targetLanguage: string, originalTitle: string, provider?: string) => Promise<{ title: string, description: string, hashtags: string }>,
  localizeGenerateSegmentVideo: (params: {
    projectFolder: string;
    segmentIndex: number;
    segments: DialogueSegment[];
    targetLanguage: string;
    characterImages: Array<{ speakerId: number; imageBase64: string }>;
    sceneFrames?: Array<{ index: number; timestamp: number; url: string | null; base64?: string | null }>;
    characters?: LocalizeCharacter[];
    sceneDescription?: string;
    speakerVoices?: Record<number, { voice_id: string; name: string }>;
    customPrompt?: string;
    isMusicVideoMode?: boolean;
    videoModel?: 'omni_flash' | 'veo3_fast';
  }) => Promise<{ videoUrl: string; audioUrl: string | null; segmentIndex: number; videoPrompt?: string; promptData?: any; translatedText?: string }>,
  localizeBatchGenerateSegments: (data: {
    projectFolder: string;
    segments: DialogueSegment[];
    targetLanguage: string;
    characterImages: Array<{ speakerId: number; imageBase64: string }>;
    sceneFrames?: Array<{ index: number; timestamp: number; url: string | null }>;
    characters?: LocalizeCharacter[];
    sceneDescription?: string;
    speakerVoices?: Record<number, { voice_id: string; name: string }>;
    isMusicVideoMode?: boolean;
    videoModel?: 'omni_flash' | 'veo3_fast';
  }) => Promise<Array<{ segmentIndex: number; videoUrl: string | null; audioUrl: string | null; status?: string; error?: string }>>,
  localizeRegenerateCharacterImage: (projectFolder: string, characterIndex: number, customPrompt?: string) => Promise<string>,
  localizeRetranslate: (projectFolder: string, transcript: string, targetLanguage: string) => Promise<{ translatedText: string }>,
  localizeExtractFrames: (videoBase64: string, timestamps: number[], projectFolder?: string) => Promise<(string | null)[]>,
  localizeGenerateVideoPrompts: (params: {
    projectFolder: string;
    segments: DialogueSegment[];
    characters: LocalizeCharacter[];
    sceneDescription: string;
  }) => Promise<VideoPromptData[]>,
  localizeRemergeProject: (projectFolder: string) => Promise<{ segments: DialogueSegment[]; sceneFrames?: any[] }>,

  // G-Labs Integration
  glabsHealthCheck: () => Promise<{ running: boolean; tasks_pending?: number; tasks_running?: number; error?: string }>,
  glabsLaunch: () => Promise<{ success: boolean; error?: string }>,
  glabsListTasks: () => Promise<{ tasks: GLabsTask[] }>,
  glabsTaskStatus: (taskId: string) => Promise<GLabsTask>,
  glabsGenerateImage: (data: {
    prompt: string; model?: string; aspectRatio?: string;
    count?: number; section?: string; subFolder?: string; sceneIndex?: number;
  }) => Promise<string[]>,
  glabsGenerateVideo: (data: {
    prompt: string; model?: string; aspectRatio?: string; resolution?: string;
    section?: string; subFolder?: string; sceneIndex?: number;
  }) => Promise<string>,
  glabsGetMultiThread: () => Promise<{ isMultiThread: boolean; concurrency: number; activeRunning: number; queueLength: number }>,
  glabsSetMultiThread: (enabled: boolean, concurrency?: number) => Promise<{ isMultiThread: boolean; concurrency: number; activeRunning: number; queueLength: number }>,
  onGLabsTaskProgress: (callback: (data: GLabsProgressData) => void) => void,
  removeGLabsProgressListener: () => void,

  // FrenchTalk
  frenchtalkGenerateStranger: (data?: { language?: string, exclude?: string[] }) => Promise<{ description: string, voice: string, personality: string, nameHint: string, gender: string }>,
  frenchtalkResetStrangerRef: (data: { episodeTitle: string }) => Promise<{ success: boolean }>,
  frenchtalkResetOutfitCache: (data: { episodeTitle: string; bloggerOutfit: string; aspectRatio: string }) => Promise<{ success: boolean }>,
  frenchtalkGenerateOutfitReference: (data: { episodeTitle: string; bloggerOutfit: string; aspectRatio: string }) => Promise<{ imagePath: string; base64: string }>,
  frenchtalkGenerateBloggerIdea: (data: { promptText: string, provider: string }) => Promise<any>,
  frenchtalkGenerateBaseImage: (data: { visualPrompt: string, model: string }) => Promise<{ imagePath: string, base64: string }>,
  frenchtalkSaveBlogger: (data: any) => Promise<any>,
  frenchtalkGetBlogger: () => Promise<any | null>,
  frenchtalkDeleteBlogger: () => Promise<null>,
  frenchtalkGetSeoKeywords: (data: { country: string, language: string }) => Promise<{ original: string, ru: string }[]>,
  frenchtalkAutoTopic: (data: { language: string, country: string, bloggerName: string, strangerType?: string, mode?: 'trending' | 'custom_topic' | 'custom_text', customInput?: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, question?: string, script: string, scriptRu?: string, overlongLines?: any[] }>,
  frenchtalkAnalyzeVideo: (data: { videoBase64: string, language: string, bloggerName: string, strangerType?: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, question?: string, script: string, scriptRu?: string }>,
  frenchtalkGenerateSegment: (data: any) => Promise<{ videoPath: string, videoBase64: string, segmentIndex: number }>,
  frenchtalkSaveAllPrompts: (data: any) => Promise<{ success: boolean }>,
  frenchtalkGenerateLocationRef: (data: { locationName: string, visualPrompt: string, model?: string }) => Promise<{ imagePath: string, base64: string }>,
  frenchtalkGetLocationRefs: () => Promise<Array<{ name: string, path: string, url: string, base64: string }>>,
  frenchtalkAutoVlogTopic: (data: { language: string, country: string, bloggerName: string, vlogTopic: string, outfit: string, location: string, customInput?: string, useWebSearch?: boolean, referenceUrl?: string, screenshotBase64?: string, videoBase64?: string }) => Promise<{ script: string, scriptRu?: string, metadata?: { title: string, description: string, hashtags: string } }>,
  frenchtalkTranslateScript: (data: { script: string, bloggerName: string }) => Promise<{ scriptRu: string }>,
  frenchtalkGetStreamPacks: () => Promise<Record<string, any>>,
  frenchtalkSaveStreamPackDaysInfo: (data: Record<string, any>) => Promise<{ success: boolean, daysInfo: Record<string, any> }>,
  frenchtalkGenerateStreamPackScript: (data: { day: string }) => Promise<{ day: string, clips: any[] }>,
  frenchtalkGenerateStreamPackImage: (data: { day: string, type: 'room' | 'scene' }) => Promise<{ success: boolean, bgRoomBase64?: string, sceneBase64?: string }>,
  frenchtalkGenerateStreamPackClip: (data: { day: string, clipIndex: number, videoModel?: string, aspectRatio?: string }) => Promise<{ videoPath: string, videoBase64: string, clipIndex: number }>,
  frenchtalkParseRecipe: (data: { url: string }) => Promise<{ url: string, site: string, title: string, servings: string, time: string, ingredients: string[], steps: string[], images: string[] }>,
  onFrenchTalkProgress: (callback: (data: { status: string, progress: number }) => void) => void,
  removeFrenchTalkProgressListener: () => void,

  // PrimateCast
  primatecastGenerateCharacterIdea: (data: { promptText: string, provider: string }) => Promise<any>,
  primatecastGenerateBaseImage: (data: { visualPrompt: string, model: string }) => Promise<{ imagePath: string, base64: string }>,
  primatecastSaveCharacter: (data: any) => Promise<any[]>,
  primatecastGetCharacters: () => Promise<any[]>,
  primatecastDeleteCharacter: (id: string) => Promise<any[]>,
  primatecastGenerateEpisode: (data: any) => Promise<{ folder: string, clips: string[] }>,
  primatecastGenerateSegment: (data: any) => Promise<{ videoPath: string, videoBase64: string, segmentIndex: number }>,
  primatecastAutoTopic: (data: { language: string, country: string, host1Name: string, host2Name: string, mode?: 'trending' | 'custom_topic' | 'custom_text', customInput?: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, script: string, scriptRu?: string, overlongLines?: any[] }>,
  primatecastGetSeoKeywords: (data: { country: string, language: string }) => Promise<string[]>,
  primatecastAnalyzeVideo: (data: { videoBase64: string, language: string, host1Name: string, host2Name: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, script: string, scriptRu?: string, overlongLines?: any[] }>,
  primatecastSaveAllPrompts: (data: any) => Promise<{ success: boolean }>,
  onPrimatecastProgress: (callback: (data: { status: string, progress?: number }) => void) => void,
  removePrimatecastProgressListener: () => void,
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}

