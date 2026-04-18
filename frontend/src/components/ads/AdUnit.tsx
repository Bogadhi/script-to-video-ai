"use client";

import { useEffect, useRef, useState } from "react";

interface AdUnitProps {
  slot: string;
  className?: string;
}

export function AdUnit({ slot, className }: AdUnitProps) {
  const [isMounted, setIsMounted] = useState(false);
  const adRef = useRef<HTMLModElement>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || hasLoadedRef.current || !adRef.current) {
      return;
    }

    try {
      const adsWindow = window as Window & typeof globalThis & {
        adsbygoogle?: Array<Record<string, unknown>>;
      };
      adsWindow.adsbygoogle = adsWindow.adsbygoogle || [];
      adsWindow.adsbygoogle.push({});
      hasLoadedRef.current = true;
      console.log(`[AdSense] Slot ${slot} pushed successfully.`);
    } catch (err) {
      console.error("[AdSense] Error pushing ad:", err);
    }
  }, [slot]);

  return (
    <div
      className={`bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 text-xs overflow-hidden ${className}`}
      style={{ width: "160px", height: "600px" }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: "block", width: "160px", height: "600px" }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX" // Placeholder
        data-ad-slot={slot}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
        AD SPACE
      </div>
    </div>
  );
}
