"use client";

import { useGenerationStore } from "@/store/useGenerationStore";
import { Film, Image, Palette } from "lucide-react";
import { clsx } from "clsx";

const STYLES = [
  { id: "cinematic", name: "Cinematic", icon: Film, color: "text-amber-400" },
  { id: "anime", name: "Anime", icon: Palette, color: "text-purple-400" },
  { id: "realistic", name: "Realistic", icon: Image, color: "text-blue-400" },
];

export function StyleSelector() {
  const { style, setStyle, status } = useGenerationStore();

  const isDisabled = status === "processing";

  return (
    <div className="flex flex-col gap-3 group">
      <div className="flex items-center gap-2 text-slate-400 group-focus-within:text-amber-400 transition-colors">
        <Film size={18} />
        <span className="text-sm font-semibold tracking-wide uppercase">
          Art Direction / Style
        </span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {STYLES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStyle(s.id)}
            disabled={isDisabled}
            className={clsx(
              "flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300",
              style === s.id
                ? "bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className={clsx("p-3 rounded-xl bg-slate-800/50", style === s.id && s.color)}>
              <s.icon size={24} />
            </div>
            <span className={clsx("text-sm font-medium", style === s.id ? "text-amber-400" : "text-slate-400")}>
              {s.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
