"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  toAbsoluteUrl,
  type PipelineStatusResponse,
  api,
} from "@/lib/api";

const POLL_INTERVAL = 3000;

interface PipelineArtifacts {
  final_video?: string | null;
  video?: string | null;
  thumbnail?: string | null;
  subtitles?: string | null;
  metadata?: string | null;
}

function artifactUrl(path?: string | null): string | null {
  return toAbsoluteUrl(path);
}

export function usePipeline(projectId: string | null) {
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stop = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const poll = useCallback(async () => {
    if (!projectId) return;

    try {
      const data = await api.getPipelineStatus(projectId);
      setStatus(data);

      const artifacts: PipelineArtifacts = data.artifacts || {
        final_video: null,
        thumbnail: null,
        subtitles: null,
        metadata: null,
      };

      setVideoUrl(artifactUrl(artifacts.final_video));
      setThumbnailUrl(artifactUrl(artifacts.thumbnail));

      if (data.overall_status === "complete") {
        stop();
        setIsLoading(false);
      }

      if (data.overall_status === "error") {
        stop();
        setIsLoading(false);
        setError(data.error || "Pipeline failed");
      }

    } catch (err: any) {
      setError(err.message || "Polling failed");
      stop();
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;

    setIsLoading(true);
    setError(null);

    poll(); // immediate

    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => stop();
  }, [projectId, poll]);

  return {
    status,
    videoUrl,
    thumbnailUrl,
    isLoading,
    error,
  };
}