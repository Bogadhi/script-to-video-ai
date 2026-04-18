"use client";

import { useGenerationStore } from "@/store/useGenerationStore";
import { Download, RefreshCcw, Share2, AlertCircle, Play } from "lucide-react";
import { useState } from "react";

export function VideoPlayer() {
  const { videoUrl, status, reset, error } = useGenerationStore();
  const [isPlaying, setIsPlaying] = useState(false);

  if (status === "idle" || status === "processing") return null;

  if (status === "error" || error) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 p-12 rounded-3xl bg-red-500/5 border border-red-500/20 text-center animate-in fade-in zoom-in duration-500">
        <div className="p-4 bg-red-500/20 rounded-full text-red-500 ring-4 ring-red-500/10">
          <AlertCircle size={32} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xl font-black text-red-500 tracking-tight">Generation Failed</h3>
          <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
            {error || "Something went wrong while stitching your scenes together. Our AI had a momentary glitch."}
          </p>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-2 px-8 py-3 bg-red-500 hover:bg-red-400 text-white font-bold rounded-xl transition-all shadow-lg active:scale-95"
        >
          <RefreshCcw size={18} />
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-12 duration-1000 ease-out">
      {/* Video Container */}
      <div className="relative group aspect-video rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl shadow-amber-500/5">
        <video
          src={videoUrl || ""}
          controls
          className="w-full h-full object-cover"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
        
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500 group-hover:opacity-100 opacity-60">
             <div className="p-6 bg-amber-500 rounded-full text-slate-950 shadow-2xl shadow-amber-500/40 transform scale-125 transition-transform group-hover:scale-110">
               <Play size={40} fill="currentColor" />
             </div>
          </div>
        )}
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between p-6 px-8 rounded-3xl bg-slate-900/50 border border-slate-800 backdrop-blur-2xl">
        <div className="flex items-center gap-6">
          <button
             onClick={() => window.open(videoUrl!, "_blank")}
             className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors group"
          >
            <div className="p-3 bg-slate-800 rounded-xl group-hover:bg-amber-500/10 transition-colors">
              <Download size={20} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Download mp4</span>
          </button>
          
          <button className="flex flex-col items-center gap-1.5 text-slate-400 hover:text-amber-400 transition-colors group">
            <div className="p-3 bg-slate-800 rounded-xl group-hover:bg-amber-500/10 transition-colors">
              <Share2 size={20} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest">Copy Link</span>
          </button>
        </div>

        <button
          onClick={reset}
          className="flex items-center gap-2 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-2xl transition-all shadow-md group border border-slate-700/50"
        >
          <RefreshCcw size={18} className="group-hover:rotate-180 transition-transform duration-700" />
          Regenerate New Video
        </button>
      </div>
    </div>
  );
}
