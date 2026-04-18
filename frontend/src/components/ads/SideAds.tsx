"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { api, type AdCreative } from "@/lib/api";
import { useUserPlan } from "@/hooks/useUserPlan";

const ROTATION_INTERVAL = 10000;

function AdSlot({ ad }: { ad: AdCreative | null }) {
  const [hasImpressed, setHasImpressed] = useState(false);

  useEffect(() => {
    if (!ad || hasImpressed) return;
    api.trackAdImpression(ad.id).finally(() => setHasImpressed(true));
  }, [ad, hasImpressed]);

  const handleClick = async () => {
    if (!ad) return;
    await api.trackAdClick(ad.id).catch(() => {});
    if (ad.targetUrl) {
      window.open(ad.targetUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="pointer-events-auto flex-1 w-[160px] max-w-[160px] bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:scale-105 hover:shadow-xl hover:shadow-amber-500/20"
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] font-semibold text-amber-300">
        <Sparkles size={14} />
        Sponsored
      </div>

      <div className="mt-4 flex-1">
        <h3 className="text-sm font-bold text-white leading-snug">
          {ad?.title ?? "Sponsored Content"}
        </h3>
        <p className="mt-3 text-[13px] leading-6 text-slate-200/80">
          {ad?.body ?? "Discover exclusive offers and content from our partners."}
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between text-[12px] text-slate-300">
        <span>{ad?.brand ?? "Partner"}</span>
        <span className="flex items-center gap-1 text-amber-300 font-semibold">
          {ad?.cta ?? "Learn more"}
          <ArrowRight size={14} />
        </span>
      </div>
    </button>
  );
}

export default function SideAds({ side }: { side: "left" | "right" }) {
  const { plan } = useUserPlan();
  const [ads, setAds] = useState<AdCreative[]>([]);
  const [rotationIndex, setRotationIndex] = useState(0);

  useEffect(() => {
    api
      .getAds()
      .then((data) => setAds(data ?? []))
      .catch(() => setAds([]));
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRotationIndex((current) => current + 4);
    }, ROTATION_INTERVAL);

    return () => window.clearInterval(interval);
  }, []);

  const pathname = usePathname();
  if (pathname === "/" || plan !== "FREE") {
    return null;
  }

  const totalAds = Math.max(1, ads.length);
  const sideOffset = side === "left" ? 0 : 2;
  const topAd = ads[(rotationIndex + sideOffset) % totalAds] ?? null;
  const bottomAd = ads[(rotationIndex + sideOffset + 1) % totalAds] ?? null;
  const isLeft = side === "left";

  return (
    <div
      className={`hidden xl:flex fixed top-[80px] h-[calc(100vh-80px)] flex-col z-10 ${isLeft ? "left-4" : "right-4"}`}
    >
      <AdSlot ad={topAd} />
      <AdSlot ad={bottomAd} />
    </div>
  );
}
