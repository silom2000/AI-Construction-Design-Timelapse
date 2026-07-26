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
  voiceProfile?: {
    gender: 'male' | 'female';
    ageRange: string;
    timbre: string;
    style: string;
    speed: number;
    pitch: string;
    emotionalTone: string;
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
  videoUrl?: string;
  audioUrl?: string;
  sceneFrameUrl?: string;
  sceneFrameBase64?: string;
  videoPrompt?: string;
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
  
  // Cinematic Timelapse
  timelapseGetEnvironments: (mode?: string) => Promise<string[]>,
  timelapseGeneratePrompts: (selectionIndex: number, selectedEnv: string) => Promise<any>,
  timelapseGenerateCustomPrompts: (customIdea: string, images: (string | null)[], video: string | null, mode?: string) => Promise<any>,
  timelapseGenerateReversePrompts: (baseImage: string) => Promise<any>,
  timelapseGenerateImage: (imgIndex: number, prompt: string, model?: string, subFolder?: string, referenceImage?: string | null) => Promise<string>,
  timelapseGenerateVideo: (videoIndex: number, prompt: string, subFolder?: string, referenceImages?: (string | null)[], videoModel?: string) => Promise<string>,
  timelapseAssemble: (subFolder?: string, projectTitle?: string) => Promise<string>,

  // Studio Tabs
  studioGenerateIdeas: (mode: 'health' | 'objects', language: string, provider?: string) => Promise<string[]>,
  studioGenerateScript: (mode: 'health' | 'objects', topic: string, language: string, provider?: string) => Promise<StudioScript>,
  studioAssembleVideo: (data: any) => Promise<string>,
  saveTextFiles: (files: { filename: string; content: string }[]) => Promise<{ success: boolean; error?: string }>,

  // AI Stories
  storyCreateFolder: () => Promise<string>,
  storyGenerateIdeas: (topic: string, language: string) => Promise<any>,
  storyGenerateScript: (params: { idea: any, language: string, projectFolder: string }) => Promise<any>,
  storyGenerateImage: (data: any) => Promise<string>,
  storyGenerateAudio: (data: any) => Promise<string>,
  storyGenerateVideo: (data: any) => Promise<string>,
  onStoryVideoProgress: (callback: (data: any) => void) => void,
  onStoryImageProgress: (callback: (data: any) => void) => void,

  // Survive вЂ” Extreme Survival Scenarios
  surviveGenerateIdeas: (params: { language: string }) => Promise<any[]>,
  surviveGenerateScript: (params: { idea: any, language: string, projectFolder: string }) => Promise<any>,
  surviveGenerateImage: (data: any) => Promise<string>,
  surviveGenerateAudio: (data: any) => Promise<string>,
  surviveGenerateVideo: (data: any) => Promise<string>,

  // TikTok Video Localizer — Dialogue Processing
  localizeStep1STT: (params: { videoBase64: string }) => Promise<{ projectFolder: string, transcript: string, transcriptWords: any[], utterances: any[], frames: any[], videoUrl: string }>,
  localizeStep2Diarize: (params: { projectFolder: string, transcriptWords: any[], utterances: any[], frames: any[] }) => Promise<{ speakers: any[], timeline: any[], segments: any[], sceneFrames: any[] }>,
  localizeStep3Characters: (params: { projectFolder: string, frames: any[], speakers: any[] }) => Promise<{ characters: any[], sceneDescription: string }>,
  localizeStep4Voices: (params: { projectFolder: string, segments: any[], speakers: any[] }) => Promise<{ voiceProfiles: any, speakerVoices: any, speakers: any[] }>,
  localizeTranslateSegments: (projectFolder: string, segments: DialogueSegment[], targetLanguage: string) => Promise<DialogueSegment[]>,
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
  }) => Promise<{ videoUrl: string; audioUrl: string | null; segmentIndex: number; videoPrompt?: string; promptData?: any }>,
  localizeBatchGenerateSegments: (data: {
    projectFolder: string;
    segments: DialogueSegment[];
    targetLanguage: string;
    characterImages: Array<{ speakerId: number; imageBase64: string }>;
    sceneFrames?: Array<{ index: number; timestamp: number; url: string | null }>;
    characters?: LocalizeCharacter[];
    sceneDescription?: string;
    speakerVoices?: Record<number, { voice_id: string; name: string }>;
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
  onGLabsTaskProgress: (callback: (data: GLabsProgressData) => void) => void,
  removeGLabsProgressListener: () => void,

  // FrenchTalk
  frenchtalkGenerateStranger: (data?: { language?: string, exclude?: string[] }) => Promise<{ description: string, voice: string, personality: string, nameHint: string, gender: string }>,
  frenchtalkResetStrangerRef: (data: { episodeTitle: string }) => Promise<{ success: boolean }>,
  frenchtalkGenerateBloggerIdea: (data: { promptText: string, provider: string }) => Promise<any>,
  frenchtalkGenerateBaseImage: (data: { visualPrompt: string, model: string }) => Promise<{ imagePath: string, base64: string }>,
  frenchtalkSaveBlogger: (data: any) => Promise<any>,
  frenchtalkGetBlogger: () => Promise<any | null>,
  frenchtalkDeleteBlogger: () => Promise<null>,
  frenchtalkGetSeoKeywords: (data: { country: string, language: string }) => Promise<{ original: string, ru: string }[]>,
  frenchtalkAutoTopic: (data: { language: string, country: string, bloggerName: string, strangerType?: string, mode?: 'trending' | 'custom_topic' | 'custom_text', customInput?: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, question?: string, script: string, scriptRu?: string, overlongLines?: any[] }>,
  frenchtalkAnalyzeVideo: (data: { videoBase64: string, language: string, bloggerName: string, strangerType?: string, shortVersion?: boolean }) => Promise<{ topic: string, topicEn: string, topicRu?: string, hook: string, hookRu?: string, question?: string, script: string, scriptRu?: string }>,
  frenchtalkGenerateSegment: (data: {
    segmentIndex: number, role: string, dialogueText: string, speakerLabel: string,
    bloggerOutfit?: string, location: string, episodeTitle: string,
    aspectRatio?: string, language?: string, videoModel?: string,
    strangerDescription?: string, strangerVoiceDescription?: string,
    strangerRefBase64?: string
  }) => Promise<{ videoPath: string, videoBase64: string, segmentIndex: number }>,
  frenchtalkSaveAllPrompts: (data: any) => Promise<{ success: boolean }>,
  onFrenchTalkProgress: (callback: (data: { status: string, progress?: number }) => void) => void,
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

