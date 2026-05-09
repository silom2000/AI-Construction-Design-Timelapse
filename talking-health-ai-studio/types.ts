
export type Language = 'Polish' | 'German' | 'French' | 'Spanish' | 'Russian' | 'English';
export type AppMode = 'health' | 'objects';

export interface Scene {
  id: number;
  character: string;
  line: string;
  imagePrompt: string;
  videoPrompt: string;
  organ?: string;
  action?: string;
  tool?: string;
  generatedImages?: string[]; // Base64 strings
  selectedImage?: string;
  generatedVideoUrl?: string;
  status: 'idle' | 'generating_script' | 'generating_images' | 'generating_video' | 'ready';
}

export interface Script {
  intro: string;
  scenes: Scene[];
}

export interface Project {
  id: string;
  name: string;
  mode: AppMode;
  lang: Language;
  script: Script | null;
  characterRefs: Record<string, string>;
  lastModified: number;
}
