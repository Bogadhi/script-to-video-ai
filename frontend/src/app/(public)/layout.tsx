import { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Video SaaS | Viral Content Generator",
  description: "Create viral videos with AI in seconds.",
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-amber-500/30">
      <main className="w-full min-h-screen">
        <div className="xl:px-[180px] 2xl:px-[220px] px-4 py-12 xl:py-24">
          <div className="max-w-5xl mx-auto z-10 transition-all duration-500">
            {children}
          </div>
        </div>
      </main>

      {/* Ambient background glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full -z-0 opacity-20 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-indigo-500/20 blur-[120px] rounded-full" />
      </div>
    </div>
  );
}
