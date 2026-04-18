import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Play,
  Sparkles,
  Star,
  Wand2,
  Captions,
  Gauge,
  Layers3,
  Users,
} from "lucide-react";

const HERO_VIDEO =
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

const DEMO_VIDEOS = [
  "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://storage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackOnStreetAndDirt.mp4",
];

const FEATURES = [
  {
    icon: Wand2,
    title: "AI scene direction",
    description: "Break long scripts into scroll-stopping scenes with motion, framing, and pacing already handled.",
  },
  {
    icon: Captions,
    title: "Auto captions",
    description: "Generate subtitle-ready edits tuned for mobile viewing and silent autoplay.",
  },
  {
    icon: Gauge,
    title: "Fast turnaround",
    description: "Go from rough script to export-ready video in seconds instead of hours.",
  },
  {
    icon: Layers3,
    title: "Style control",
    description: "Switch between cinematic, realistic, and stylized directions without rebuilding the workflow.",
  },
];

export default function LandingPage() {
  return (
    <div className="space-y-8 pb-10 text-slate-100">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_30%),linear-gradient(135deg,#08111f_0%,#0b1220_45%,#05070b_100%)] px-6 py-8 shadow-[0_40px_120px_rgba(0,0,0,0.45)] sm:px-8 lg:px-12 lg:py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.14),transparent_22%),radial-gradient(circle_at_20%_75%,rgba(234,179,8,0.1),transparent_24%)]" />
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-12">
          <div className="max-w-2xl flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-300">
              <Sparkles size={14} className="text-amber-300" />
              Built for creators and growth teams
            </div>

            <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Turn Scripts Into{" "}
              <span
                className="bg-gradient-to-r from-amber-200 via-orange-400 to-cyan-300 bg-clip-text text-transparent"
                style={{ backgroundSize: "200% 200%", animation: "landingGradientShift 7s ease infinite" }}
              >
                Viral Videos
              </span>{" "}
              in Seconds
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              Drop in a script and let AI handle visuals, narration, pacing, and export. Ship premium short-form videos without slowing your content team down.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-3 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-300 px-7 py-4 text-sm font-black text-slate-950 shadow-[0_18px_50px_rgba(251,191,36,0.28)] transition-transform duration-200 hover:-translate-y-0.5"
              >
                Start Creating
                <ArrowRight size={18} />
              </Link>

              <a
                href="#demo-grid"
                className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-7 py-4 text-sm font-semibold text-white backdrop-blur-sm transition-colors duration-200 hover:bg-white/10"
              >
                <Play size={18} />
                Watch Demo
              </a>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3">
              <MetricTile value="10,000+" label="videos generated" />
              <MetricTile value="4.8*" label="creator rating" />
              <MetricTile value="3,200+" label="active creators" />
            </div>
          </div>

          <div className="relative flex-1">
            <div className="absolute -inset-5 rounded-[2rem] bg-gradient-to-r from-amber-400/20 via-orange-400/10 to-cyan-400/15 blur-2xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/70 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-sm text-slate-300">
                <div>
                  <p className="font-semibold text-white">Auto-generated demo</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.28em] text-slate-500">
                    Live preview
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  Looping
                </div>
              </div>

              <video
                src={HERO_VIDEO}
                autoPlay
                loop
                muted
                playsInline
                className="h-[260px] w-full object-cover sm:h-[320px] lg:h-[420px]"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        id="demo-grid"
        className="rounded-[2rem] border border-white/10 bg-slate-950/65 px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-sm sm:px-8"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-amber-300">
              Visual demo grid
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Feels alive the moment the page loads
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-slate-400">
            Multiple looping previews show the product outcome immediately, not just the promise.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DEMO_VIDEOS.map((videoUrl, index) => (
            <div
              key={videoUrl}
              className="group overflow-hidden rounded-[1.6rem] border border-white/10 bg-slate-900/80 transition duration-300 hover:-translate-y-1 hover:border-amber-300/40 hover:shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
            >
              <div className="relative overflow-hidden">
                <video
                  src={videoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-56 w-full object-cover transition duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute left-4 top-4 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur">
                  Demo {index + 1}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-semibold text-white">AI-generated output</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                    Hook-ready pacing
                  </p>
                </div>
                <div className="rounded-full bg-white/5 p-2 text-slate-300 transition-colors group-hover:bg-amber-300/10 group-hover:text-amber-200">
                  <Play size={14} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(2,6,23,0.92))] p-7 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Before vs after
          </p>
          <h2 className="mt-3 text-3xl font-black tracking-tight text-white">
            Script in. Viral-ready video out.
          </h2>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <FlowCard
              title="Script"
              description="Paste a rough idea, launch copy, or a full storyboard."
              accent="border-amber-400/20 bg-amber-400/5 text-amber-200"
            />
            <FlowCard
              title="AI"
              description="The engine picks scenes, visuals, voice, captions, and timing."
              accent="border-cyan-400/20 bg-cyan-400/5 text-cyan-200"
            />
            <FlowCard
              title="Viral Video"
              description="Get a polished short-form asset built to hold attention."
              accent="border-emerald-400/20 bg-emerald-400/5 text-emerald-200"
            />
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">
            Social proof
          </p>
          <h3 className="mt-3 text-2xl font-black text-white">
            Built for teams shipping content every day
          </h3>

          <div className="mt-8 space-y-4">
            <ProofRow icon={Users} label="10,000+ videos generated" />
            <ProofRow icon={Star} label="4.8* average rating from creators" />
            <ProofRow icon={CheckCircle2} label="Used by solo creators, agencies, and growth teams" />
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm leading-7 text-slate-300">
              &quot;We went from one editor bottlenecking the pipeline to shipping daily variations for every campaign. The output feels premium from the first render.&quot;
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Growth team, consumer SaaS
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/10 bg-slate-950/70 px-6 py-8 shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber-300">
              Features
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
              Premium controls without editing overhead
            </h2>
          </div>
          <p className="max-w-lg text-sm leading-7 text-slate-400">
            The product is positioned like a serious creation engine, not a toy. Rich motion, but still clear and conversion-led.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.85),rgba(2,6,23,0.95))] p-5 transition duration-300 hover:-translate-y-1 hover:border-amber-300/35 hover:shadow-[0_0_0_1px_rgba(251,191,36,0.08),0_20px_60px_rgba(245,158,11,0.08)]"
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-amber-300 transition duration-300 group-hover:bg-amber-300/10 group-hover:shadow-[0_0_30px_rgba(251,191,36,0.12)]">
                <Icon size={20} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[2.3rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(15,23,42,0.95)_35%,rgba(8,15,31,0.95)_100%)] px-6 py-10 text-center shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:px-8 sm:py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.34em] text-amber-200">
          Final call to action
        </p>
        <h2 className="mx-auto mt-4 max-w-3xl text-4xl font-black tracking-tight text-white sm:text-5xl">
          Start creating viral videos today
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-200">
          Replace slow editing cycles with a workflow that turns scripts into polished short-form content in seconds.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-3 rounded-full bg-white px-7 py-4 text-sm font-black text-slate-950 transition-transform duration-200 hover:-translate-y-0.5"
          >
            Start Creating
            <ArrowRight size={18} />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-3 rounded-full border border-white/15 bg-white/5 px-7 py-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
          >
            See Pricing
          </Link>
        </div>
      </section>
    </div>
  );
}

function MetricTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] px-4 py-5 backdrop-blur-sm">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
        {label}
      </div>
    </div>
  );
}

function FlowCard({
  title,
  description,
  accent,
}: {
  title: string;
  description: string;
  accent: string;
}) {
  return (
    <div className={`rounded-[1.5rem] border p-5 ${accent}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.24em]">{title}</p>
      <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
    </div>
  );
}

function ProofRow({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-300/10 text-amber-300">
        <Icon size={18} />
      </div>
      <p className="text-sm font-medium text-slate-200">{label}</p>
    </div>
  );
}
