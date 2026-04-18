"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { Sparkles, Mail, Lock, Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useUserPlan } from "@/hooks/useUserPlan";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { refresh } = useUserPlan();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email, password }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) throw new Error(data.message || "Registration failed");

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

        <div className="text-center space-y-4">
          <div className="inline-flex p-3 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-indigo-400">
            <UserPlus size={28} />
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white uppercase italic">
            Create <span className="text-indigo-400">Account</span>
          </h1>

          <p className="text-slate-400 text-sm font-medium">
            Join thousands of creators automating their viral content.
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-6">
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

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider rounded-xl text-center">
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full group flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-indigo-500/10 active:scale-95 disabled:opacity-50 disabled:grayscale"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                Start Generating for Free
                <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
              </>
            )}
          </button>
        </form>

        <div className="text-center pt-4 border-t border-slate-800/50">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">
            Already have an account?{" "}
            <Link href="/login" className="text-amber-500 hover:text-amber-400 transition-colors">
              Log in Now
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
