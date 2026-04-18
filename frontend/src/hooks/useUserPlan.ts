"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { api, type UserInfo } from "@/lib/api";
import { PLANS, type PlanTier } from "@/lib/plans";

interface UserPlanState {
  plan: PlanTier;
  credits: number;
  loading: boolean;
  initialized: boolean;
  setPlan: (plan: PlanTier) => void;
  setCredits: (credits: number) => void;
  decrementCredits: (amount?: number) => void;
  hydrate: () => Promise<void>;
}

const FALLBACK_PLAN: PlanTier = "FREE";
const FALLBACK_CREDITS = PLANS.FREE.credits;

function normalizePlan(plan?: string | null): PlanTier {
  if (!plan) return FALLBACK_PLAN;

  const upper = plan.toUpperCase();
  if (upper === "FREE" || upper === "STARTER" || upper === "PRO") {
    return upper;
  }

  return FALLBACK_PLAN;
}

function normalizeCredits(credits?: number | null): number {
  if (typeof credits !== "number" || Number.isNaN(credits)) {
    return FALLBACK_CREDITS;
  }

  return Math.max(0, Math.floor(credits));
}

const useUserPlanStore = create<UserPlanState>((set, get) => ({
  plan: FALLBACK_PLAN,
  credits: FALLBACK_CREDITS,
  loading: false,
  initialized: false,
  setPlan: (plan) => set({ plan }),
  setCredits: (credits) => set({ credits: normalizeCredits(credits) }),
  decrementCredits: (amount = 1) =>
    set((state) => ({
      credits: Math.max(0, state.credits - Math.max(0, Math.floor(amount))),
    })),
  hydrate: async () => {
    if (get().loading) return;

    set({ loading: true });

    try {
      const user: UserInfo = await api.getUser();
      set({
        plan: normalizePlan(user.plan),
        credits: normalizeCredits(user.credits),
        loading: false,
        initialized: true,
      });
    } catch {
      set({
        plan: FALLBACK_PLAN,
        credits: FALLBACK_CREDITS,
        loading: false,
        initialized: true,
      });
    }
  },
}));

export function useUserPlan() {
  const plan = useUserPlanStore((state) => state.plan);
  const credits = useUserPlanStore((state) => state.credits);
  const loading = useUserPlanStore((state) => state.loading);
  const initialized = useUserPlanStore((state) => state.initialized);
  const setPlan = useUserPlanStore((state) => state.setPlan);
  const setCredits = useUserPlanStore((state) => state.setCredits);
  const decrementCredits = useUserPlanStore((state) => state.decrementCredits);
  const hydrate = useUserPlanStore((state) => state.hydrate);

  useEffect(() => {
    if (!initialized && !loading) {
      void hydrate();
    }
  }, [hydrate, initialized, loading]);

  const planFeatures = PLANS[plan];

  return {
    plan,
    credits,
    loading,
    initialized,
    showAds: !loading && planFeatures.ads,
    setPlan,
    setCredits,
    decrementCredits,
    refresh: hydrate,
  };
}
