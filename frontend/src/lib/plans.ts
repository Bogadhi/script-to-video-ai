export type PlanTier = "FREE" | "STARTER" | "PRO";

export interface PlanFeatures {
  ads: boolean;
  maxDuration: number;
  credits: number;
  quality: "720p" | "1080p" | "4k";
}

export const PLANS: Record<PlanTier, PlanFeatures> = {
  FREE: {
    ads: true,
    maxDuration: 60,
    credits: 3,
    quality: "720p",
  },
  STARTER: {
    ads: false,
    maxDuration: 300,
    credits: 20,
    quality: "1080p",
  },
  PRO: {
    ads: false,
    maxDuration: 600,
    credits: 100,
    quality: "4k",
  },
};
