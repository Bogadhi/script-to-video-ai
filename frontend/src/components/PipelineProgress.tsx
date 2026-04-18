// components/PipelineProgress.tsx
"use client";

import { type PipelineStepStatus } from "@/lib/api";

const STEP_LABELS: Record<string, string> = {
  scene_breakdown:  "Scene breakdown",
  voice_generation: "Voice generation",
  visual_selection: "Visual selection",
  scene_assembly:   "Scene assembly",
  background_music: "Background music",
  final_assembly:   "Final assembly",
  subtitles:        "Subtitles",
  thumbnail:        "Thumbnail",
  metadata:         "Metadata",
};

function StatusDot({ status }: { status: string }) {
  const base = "inline-block w-3 h-3 rounded-full flex-shrink-0 mt-0.5";
  if (status === "complete") return <span className={`${base} bg-green-500`} />;
  if (status === "running")  return <span className={`${base} bg-blue-500 animate-pulse`} />;
  if (status === "error")    return <span className={`${base} bg-red-500`} />;
  return <span className={`${base} bg-gray-300 dark:bg-gray-600`} />;
}

interface Props {
  steps: PipelineStepStatus[];
  overallStatus: string;
}

export default function PipelineProgress({ steps, overallStatus }: Props) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Pipeline progress
        </h2>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full
            ${overallStatus === "complete" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : ""}
            ${overallStatus === "running"  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : ""}
            ${overallStatus === "error"    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : ""}
            ${overallStatus === "pending"  ? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" : ""}
          `}
        >
          {overallStatus}
        </span>
      </div>

      <ul className="space-y-2.5">
        {steps.map((step) => (
          <li key={step.name} className="flex items-start gap-3">
            <StatusDot status={step.status} />
            <div className="flex-1 flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {STEP_LABELS[step.name] ?? step.name}
              </span>
              <span
                className={`text-xs
                  ${step.status === "complete" ? "text-green-600 dark:text-green-400" : ""}
                  ${step.status === "running"  ? "text-blue-600 dark:text-blue-400" : ""}
                  ${step.status === "error"    ? "text-red-600 dark:text-red-400" : ""}
                  ${step.status === "pending"  ? "text-gray-400" : ""}
                `}
              >
                {step.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
