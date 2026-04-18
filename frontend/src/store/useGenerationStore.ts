import { create } from "zustand";

type GenerationStatus = "idle" | "processing" | "done" | "error";

interface GenerationState {
  status: GenerationStatus;
  progress: number;
  videoUrl: string | null;
  error: string | null;
  script: string;
  style: string;
  voice: string;

  // Actions
  setStatus: (status: GenerationStatus) => void;
  setProgress: (progress: number) => void;
  setVideoUrl: (url: string | null) => void;
  setError: (error: string | null) => void;
  setScript: (script: string) => void;
  setStyle: (style: string) => void;
  setVoice: (voice: string) => void;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set) => ({
  status: "idle",
  progress: 0,
  videoUrl: null,
  error: null,
  script: "",
  style: "cinematic",
  voice: "male",

  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setVideoUrl: (url) => set({ videoUrl: url ?? null }),
  setError: (error) => set({ error }),
  setScript: (script) => set({ script }),
  setStyle: (style) => set({ style }),
  setVoice: (voice) => set({ voice }),
  reset: () =>
    set({
      status: "idle",
      progress: 0,
      videoUrl: null,
      error: null,
    }),
}));
