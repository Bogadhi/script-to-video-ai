// components/VideoPreview.tsx
"use client";

interface Props {
  videoUrl: string | null;
  thumbnailUrl: string | null;
}

export default function VideoPreview({ videoUrl, thumbnailUrl }: Props) {
  if (!videoUrl) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-black">
      <video
        key={videoUrl}          // forces remount when URL changes
        controls
        autoPlay
        playsInline
        poster={thumbnailUrl ?? undefined}
        className="w-full max-h-[540px] object-contain"
      >
        <source src={videoUrl} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
    </div>
  );
}
