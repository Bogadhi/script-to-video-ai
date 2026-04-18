"use client";

import AdLayout from "@/components/ads/AdLayout";
import { BarChart3, CreditCard, Sparkles } from "lucide-react";

import { GenerateButton } from "@/components/dashboard/GenerateButton";
import { ProcessingStatus } from "@/components/dashboard/ProcessingStatus";
import { ScriptInput } from "@/components/dashboard/ScriptInput";
import { StyleSelector } from "@/components/dashboard/StyleSelector";
import { VideoPlayer } from "@/components/dashboard/VideoPlayer";
import { VoiceSelector } from "@/components/dashboard/VoiceSelector";
import { useGenerationStore } from "@/store/useGenerationStore";
import { useUserPlan } from "@/hooks/useUserPlan";

const DEMO_VIDEOS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
];

export default function DashboardPage() {
  const { credits, plan } = useUserPlan();
  const { status } = useGenerationStore();

  return (
    <AdLayout>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-0">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/55 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2 text-center md:text-left">
                <div className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400 md:justify-start">
                  <Sparkles size={12} className="text-amber-400" />
                  Workspace
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  Generate a video
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-slate-400">
                  Paste a script, choose a look and voice, then generate. Everything here is built for speed and focus.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:min-w-[280px]">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-center">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-amber-400">
                    <CreditCard size={18} />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Credits
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">{credits}</p>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 text-center">
                  <div className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-300">
                    <BarChart3 size={18} />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Plan
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-white">{plan}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-5">
              <ScriptInput />
              <StyleSelector />
              <VoiceSelector />
              <GenerateButton />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-5 text-center md:text-left">
            <h2 className="text-lg font-semibold text-white">Output</h2>
            <p className="mt-1 text-sm text-slate-400">
              Track progress and review the finished result here.
            </p>
          </div>

          <div className="space-y-5">
            <ProcessingStatus />
            <VideoPlayer />
            {status === "idle" ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 px-6 py-10 text-center text-sm leading-6 text-slate-500">
                Your generated video will appear here after processing.
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-sm">
          <div className="mb-5 text-center md:text-left">
            <h2 className="text-lg font-semibold text-white">Demo Preview</h2>
            <p className="mt-1 text-sm text-slate-400">
              Live sample reels to preview output style.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {DEMO_VIDEOS.map((url) => (
              <div key={url} className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/70">
                <video
                  src={url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="h-44 w-full object-cover"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdLayout>
  );
}
