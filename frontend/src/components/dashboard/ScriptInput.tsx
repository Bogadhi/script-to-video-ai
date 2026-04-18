"use client";

import { useGenerationStore } from "@/store/useGenerationStore";
import { Terminal } from "lucide-react";

export function ScriptInput() {
  const { script, setScript, status } = useGenerationStore();

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setScript(e.target.value);
  };

  const isDisabled = status === "processing";

  return (
    <div className="flex flex-col gap-3 group">
      <div className="flex items-center gap-2 text-slate-400 group-focus-within:text-amber-400 transition-colors">
        <Terminal size={18} />
        <span className="text-sm font-semibold tracking-wide uppercase">
          Video Script / Storyboard
        </span>
      </div>
      <div className="relative">
        <textarea
          value={script}
          onChange={handleTextChange}
          disabled={isDisabled}
          placeholder="Describe your story or enter a raw script here..."
          className={`w-full h-48 bg-slate-900/50 border ${
            isDisabled ? "border-slate-800 opacity-60" : "border-slate-800 focus:border-amber-500/50"
          } rounded-xl px-5 py-4 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-4 focus:ring-amber-500/10 transition-all resize-none font-mono text-sm leading-relaxed backdrop-blur-xl`}
        />
        <div className="absolute bottom-4 right-5 text-xs text-slate-600 font-mono">
          {script.length} chars
        </div>
      </div>
    </div>
  );
}
