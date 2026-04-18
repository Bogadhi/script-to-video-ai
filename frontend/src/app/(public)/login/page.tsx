"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { Sparkles, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useUserPlan } from "@/hooks/useUserPlan";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { refresh } = useUserPlan();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.message || "Login failed");

      localStorage.setItem("token", data.token);
      await refresh();
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-gradient-to-br from-black via-slate-950 to-black">
      <div className="w-full max-w-md p-10 space-y-8 bg-slate-900/50 border border-slate-800 rounded-3xl backdrop-blur-3xl shadow-2xl">

        {/* HEADER */}
        <div className="text-center space-y-4">
          <div className="inline-flex p-3 bg-amber-500/10 rounded-2xl border border-amber-500/20 text-amber-500">
            <Sparkles size={28} />
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">
            Welcome <span className="text-amber-500">Back</span>
          </h1>

          <p className="text-slate-400 text-sm font-medium">
            Log in to manage your AI video projects and credits.
          </p>
        </div>

        {/* FORM */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">

            <div className="relative bg-slate-950 border border-slate-800 rounded-xl focus-within:ring-4 focus-within:ring-amber-500/10 focus-within:border-amber-500/60 transition-all">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <Mail size={18} className="text-slate-500" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                autoComplete="email"
                className="w-full rounded-xl bg-transparent border-none py-3 pl-11 pr-4 text-slate-100 placeholder:text-slate-600 font-medium outline-none"
              />
            </div>

            {/* PASSWORD FIELD */}
            <div className="relative bg-slate-950 border border-slate-800 rounded-xl focus-within:ring-4 focus-within:ring-amber-500/10 focus-within:border-amber-500/60 transition-all">
              <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center">
                <Lock size={18} className="text-slate-500" />
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your Password"
                autoComplete="current-password"
                className="w-full rounded-xl bg-transparent border-none py-3 pl-11 pr-4 text-slate-100 placeholder:text-slate-600 font-medium outline-none"
              />
            </div>

          </div>

          {/* ERROR */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl text-center">
              ❌ {error}
            </div>
          )}

          {/* BUTTON */}
          <button
            type="submit"
            disabled={loading}
            className="w-full group flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-4 rounded-xl transition-all shadow-xl shadow-amber-500/10 active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Continue to Dashboard
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* FOOTER */}
        <div className="text-center pt-4 border-t border-slate-800/50">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-amber-500 hover:text-amber-400 transition-colors"
            >
              Join for Free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
