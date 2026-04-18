"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { usePathname } from "next/navigation";

import { api, getStoredToken, type AdCreative } from "@/lib/api";

const ROTATION_INTERVAL = 7000;

function AdCard({
  ad,
  side,
  position,
}: {
  ad: AdCreative | null;
  side: "left" | "right";
  position: "top" | "bottom";
}) {
  const [hasImpressed, setHasImpressed] = useState(false);

  useEffect(() => {
    if (!ad || hasImpressed) {
      return;
    }

    api.trackAdImpression(ad.id).finally(() => setHasImpressed(true));
  }, [ad, hasImpressed]);

  const handleClick = async () => {
    if (!ad) {
      return;
    }

    await api.trackAdClick(ad.id).catch(() => {});

    if (ad.targetUrl) {
      window.open(ad.targetUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed z-10 hidden w-[168px] flex-col overflow-hidden rounded-[1.35rem] border border-amber-500/20 bg-slate-950/72 p-4 text-left shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl transition duration-300 hover:border-amber-400/35 hover:bg-slate-950/82 hover:shadow-[0_18px_80px_rgba(245,158,11,0.12)] lg:flex ${
        side === "left" ? "left-3 xl:left-4" : "right-3 xl:right-4"
      } ${position === "top" ? "" : "bottom-3 xl:bottom-4"}`}
      style={{
        height: "50vh",
        top: position === "top" ? "80px" : undefined,
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),transparent_30%,transparent)]" />
      <div className="relative flex h-full flex-col">
        <div className="mb-4 inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-300">
          Sponsored Content
        </div>

        <div className="flex-1">
          <h3 className="text-sm font-semibold leading-6 text-white">
            {ad?.title ?? "Sponsored placement"}
          </h3>
          <p className="mt-3 text-xs leading-6 text-slate-300/85">
            {ad?.body ?? "Discover premium tools, creator offers, and partner promotions tailored for this workspace."}
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {ad?.brand ?? "Partner"}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs font-medium text-amber-300">
            <span>{ad?.cta ?? "Learn more"}</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </div>
    </button>
  );
}

export default function AdLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ads, setAds] = useState<AdCreative[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [rotationIndex, setRotationIndex] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isAuthenticated = !!getStoredToken();
  const showAds =
    isMounted &&
    (pathname === "/pricing" || pathname.startsWith("/dashboard"));

  useEffect(() => {
    if (!showAds) {
      return;
    }

    api
      .getAds()
      .then((data) => setAds(data ?? []))
      .catch(() => setAds([]));
  }, [showAds]);

  useEffect(() => {
    if (!showAds) {
      return;
    }

    const interval = window.setInterval(() => {
      setRotationIndex((current) => current + 4);
    }, ROTATION_INTERVAL);

    return () => window.clearInterval(interval);
  }, [showAds]);

  const slots = useMemo(() => {
    if (!ads.length) {
      return {
        leftTop: null,
        leftBottom: null,
        rightTop: null,
        rightBottom: null,
      };
    }

    const totalAds = ads.length;

    return {
      leftTop: ads[rotationIndex % totalAds] ?? null,
      leftBottom: ads[(rotationIndex + 1) % totalAds] ?? null,
      rightTop: ads[(rotationIndex + 2) % totalAds] ?? null,
      rightBottom: ads[(rotationIndex + 3) % totalAds] ?? null,
    };
  }, [ads, rotationIndex]);

  return (
    <div className="relative">
      {showAds ? (
        <>
          <AdCard ad={slots.leftTop} side="left" position="top" />
          <AdCard ad={slots.leftBottom} side="left" position="bottom" />
          <AdCard ad={slots.rightTop} side="right" position="top" />
          <AdCard ad={slots.rightBottom} side="right" position="bottom" />
        </>
      ) : null}

      <div className="mx-auto w-full max-w-[1400px] px-6">
        {children}
      </div>
    </div>
  );
}
