"use client";

import { useGenerationStore } from "@/store/useGenerationStore";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { clsx } from "clsx";

const STEPS = [
  { id: 1, min: 0, text: "Creating scenes" },
  { id: 2, min: 25, text: "Generating voice" },
  { id: 3, min: 60, text: "Generating visuals" },
  { id: 4, min: 85, text: "Stitching video" },
];

export function ProcessingStatus() {
  const { status, progress } = useGenerationStore();

  if (status === "idle") return null;

  return (
    <div className="flex flex-col gap-6 p-8 rounded-3xl bg-slate-900/50 border border-slate-800 backdrop-blur-2xl shadow-2xl">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-100 flex items-center gap-3">
          {status === "processing" ? (
            <Loader2 className="animate-spin text-amber-500" size={20} />
          ) : status === "done" ? (
            <CheckCircle2 className="text-green-500" size={20} />
          ) : (
            <Circle className="text-red-500" size={20} />
          )}
          {status === "processing" ? "Generation Engine Active" : status === "done" ? "Video Ready" : "Generation Failed"}
        </h3>
        <span className="text-3xl font-black text-amber-500 font-mono tracking-tighter">
          {progress}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(245,158,11,0.3)]"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Step Indicators */}
      <div className="grid grid-cols-4 gap-2">
        {STEPS.map((step, index) => {
          const nextStepMin = STEPS[index + 1]?.min ?? 101;
          const isDone = progress >= step.min;
          const isActive = progress >= step.min && progress < nextStepMin;
          
          return (
            <div key={step.id} className="flex flex-col gap-2">
              <div
                className={clsx(
                  "h-1 rounded-full transition-colors duration-500",
                  isActive ? "bg-amber-500/50" : isDone ? "bg-amber-500" : "bg-slate-800"
                )}
              />
              <span
                className={clsx(
                  "text-[10px] font-bold uppercase tracking-widest text-center",
                  isActive ? "text-slate-300" : isDone ? "text-amber-400" : "text-slate-700"
                )}
              >
                {step.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
