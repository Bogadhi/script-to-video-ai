"use client";

import { Loader2, Sparkles } from "lucide-react";

import { api, toAbsoluteUrl } from "@/lib/api";
import { useUserPlan } from "@/hooks/useUserPlan";
import { useGenerationStore } from "@/store/useGenerationStore";

const POLL_INTERVAL_MS = 2500;

export function GenerateButton() {
  const {
    status,
    setStatus,
    setProgress,
    setError,
    setVideoUrl,
    script,
    style,
    voice,
  } = useGenerationStore();
  const { credits, loading: planLoading, decrementCredits } = useUserPlan();

  const handleGenerate = async () => {
    let poller: ReturnType<typeof setInterval> | null = null;
    const trimmedScript = script.trim();

    if (!trimmedScript) {
      setError("Please enter a script before generating.");
      return;
    }

    if (credits <= 0) {
      setError("No credits remaining. Upgrade your plan to continue.");
      return;
    }

    setVideoUrl(null);
    setStatus("processing");
    setProgress(0);
    setError(null);

    try {
      const { jobId } = await api.generateVideo({
        script_text: trimmedScript,
        visual_style: style,
        voice_style: voice,
      });

      console.log("[Generate] Job queued:", jobId);

      poller = setInterval(async () => {
        try {
          const job = await api.getJob(jobId);
          const progress = Math.round(job.progress || 0);
          setProgress(progress);

          console.log(`[Generate] Job ${jobId} state=${job.state} progress=${progress}%`);

          if (job.state === "completed") {
            clearInterval(poller!);
            setProgress(100);
            setStatus("done");

            // Extract video URL — worker returns result.videoUrl (typed in JobStatusResponse)
            const rawVideoUrl = job.result?.videoUrl ?? null;

            const absoluteUrl = toAbsoluteUrl(rawVideoUrl);
            console.log("[Generate] Video URL:", absoluteUrl);
            setVideoUrl(absoluteUrl || null);
            decrementCredits(1);
          }

          if (job.state === "failed") {
            clearInterval(poller!);
            setStatus("error");
            setError(job.error || "Video generation failed. Please try again.");
          }
        } catch (pollErr) {
          clearInterval(poller!);
          setStatus("error");
          setError(
            pollErr instanceof Error
              ? pollErr.message
              : "Unable to fetch job status.",
          );
        }
      }, POLL_INTERVAL_MS);
    } catch (err: unknown) {
      if (poller) clearInterval(poller);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  const isProcessing = status === "processing";
  const isDisabled = isProcessing || planLoading || !script.trim() || credits <= 0;
  const helperText = !script.trim()
    ? "Add a script to start generation."
    : credits <= 0
      ? "No credits left. Upgrade to keep generating."
      : null;

  return (
    <div className="space-y-3">
      <button
        onClick={handleGenerate}
        disabled={isDisabled}
        className={`w-full group relative overflow-hidden bg-gradient-to-br from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-bold py-5 rounded-2xl transition-all duration-500 transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:grayscale disabled:scale-100 ${
          isProcessing ? "cursor-wait" : ""
        }`}
      >
        <div className="flex items-center justify-center gap-3 relative z-10 transition-all duration-500">
          {isProcessing ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <Sparkles className="group-hover:rotate-12 transition-transform" size={24} />
          )}
          <span className="text-xl tracking-tight">
            {isProcessing ? "AI Generation Engine Working..." : "Generate AI Video Now"}
          </span>
        </div>

        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <div className="absolute -inset-1 bg-amber-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity -z-10" />
      </button>

      {helperText ? (
        <p className="text-sm font-medium text-amber-400">{helperText}</p>
      ) : null}
    </div>
  );
}
