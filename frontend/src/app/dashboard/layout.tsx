"use client";

import { useUserPlan } from "@/hooks/useUserPlan";
import { clearAuthSession, getStoredToken, redirectToLogin } from "@/lib/api";
import {
  Sparkles,
  LayoutDashboard,
  CreditCard,
  LogOut,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clsx } from "clsx";

const ads = [
  "🚀 Boost your YouTube growth with AI",
  "🎬 Create viral videos instantly",
  "💡 Try AI marketing tools today",
  "🔥 Get more engagement now",
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { plan, credits, loading } = useUserPlan();
  const [adIndex, setAdIndex] = useState(0);

  useEffect(() => {
    if (!loading && !getStoredToken()) {
      redirectToLogin();
    }
  }, [loading]);

  // 🔁 Ad rotation
  useEffect(() => {
    const interval = setInterval(() => {
      setAdIndex((prev) => (prev + 1) % ads.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    clearAuthSession();
    redirectToLogin();
  };

  return (
    <div className="min-h-screen bg-[#0a0d12] text-slate-100 flex flex-col font-sans">

      {/* HEADER */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#0a0d12]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-amber-400">
                <Sparkles size={20} className="text-slate-950" />
              </div>
              <span className="text-base font-semibold text-slate-100">
                ScriptToVideo <span className="text-amber-500">AI</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/70 p-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm text-slate-100"
              >
                <LayoutDashboard size={16} />
                Dashboard
              </Link>
              <Link
                href="/pricing"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-slate-100"
              >
                <CreditCard size={16} />
                Pricing
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
              <span className="text-xs text-slate-400">
                Credits: {credits}
              </span>
              <span
                className={clsx(
                  "text-[10px] px-2 py-1 rounded-full",
                  plan === "FREE"
                    ? "bg-slate-700 text-slate-300"
                    : plan === "STARTER"
                    ? "bg-blue-500/10 text-blue-400"
                    : "bg-amber-500/10 text-amber-400"
                )}
              >
                {plan}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-red-400"
            >
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* LEFT ADS */}
      <div className="hidden xl:flex fixed left-0 top-16 h-[calc(100vh-64px)] w-52 flex-col justify-between p-3 z-10">
        <div className="h-[48%] bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-center p-4">
          {ads[adIndex]}
        </div>
        <div className="h-[48%] bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-center p-4">
          {ads[(adIndex + 1) % ads.length]}
        </div>
      </div>

      {/* RIGHT ADS */}
      <div className="hidden xl:flex fixed right-0 top-16 h-[calc(100vh-64px)] w-52 flex-col justify-between p-3 z-10">
        <div className="h-[48%] bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-center p-4">
          {ads[(adIndex + 2) % ads.length]}
        </div>
        <div className="h-[48%] bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-center p-4">
          {ads[(adIndex + 3) % ads.length]}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full py-8">
        <div className="mx-auto max-w-7xl px-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 p-20">
              <Loader2 className="animate-spin text-amber-500" size={40} />
              <p className="text-xs text-slate-500">Loading workspace</p>
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}