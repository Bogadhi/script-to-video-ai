export interface SceneAssetLocks {
  visual?: boolean;
  audio?: boolean;
}

export interface SceneEditorMetadata {
  sourceType?: string;
  lockedAt?: string | null;
  swapOrigin?: string | null;
  [key: string]: unknown;
}

export interface DraftScene {
  scene_id: number;
  narration?: string;
  visual_prompt?: string;
  image_path?: string | null;
  video_path?: string | null;
  audio_path?: string;
  duration?: number;
  keywords?: string[];
  motion?: Record<string, number>;
  quality_scores?: Record<string, number>;
  assetLocks?: SceneAssetLocks;
  metadata?: SceneEditorMetadata;
  [key: string]: unknown;
}

export interface DraftManifest {
  projectId: string;
  script: string;
  scenes: DraftScene[];
  music_path?: string;
  thumbnailPath?: string;
  duration?: number;
  scenesCount?: number;
  metadata?: Record<string, unknown>;
}

export interface SceneDraftPatch {
  narration?: string;
  visual_prompt?: string;
  image_path?: string | null;
  video_path?: string | null;
  assetLocks?: SceneAssetLocks;
  metadata?: SceneEditorMetadata;
  forceVisualReroll?: boolean;
  regenerateAudio?: boolean;
  [key: string]: unknown;
}
