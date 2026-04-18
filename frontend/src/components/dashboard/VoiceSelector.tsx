"use client";

import { useGenerationStore } from "@/store/useGenerationStore";
import { Mic2, User } from "lucide-react";
import { clsx } from "clsx";

const VOICES = [
  { id: "male", name: "Male Narrator", gender: "M" },
  { id: "female", name: "Female Narrator", gender: "F" },
];

export function VoiceSelector() {
  const { voice, setVoice, status } = useGenerationStore();

  const isDisabled = status === "processing";

  return (
    <div className="flex flex-col gap-3 group">
      <div className="flex items-center gap-2 text-slate-400 group-focus-within:text-amber-400 transition-colors">
        <Mic2 size={18} />
        <span className="text-sm font-semibold tracking-wide uppercase">
          Narration Voice
        </span>
      </div>
      <div className="flex gap-4">
        {VOICES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVoice(v.id)}
            disabled={isDisabled}
            className={clsx(
              "flex items-center gap-4 px-6 py-4 rounded-xl border transition-all duration-300 flex-1",
              voice === v.id
                ? "bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/5"
                : "bg-slate-900/50 border-slate-800 hover:border-slate-700",
              isDisabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div
              className={clsx(
                "p-2 rounded-full",
                voice === v.id ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-500"
              )}
            >
              <User size={18} />
            </div>
            <span
              className={clsx(
                "text-sm font-semibold tracking-tight",
                voice === v.id ? "text-amber-400" : "text-slate-400"
              )}
            >
              {v.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
