"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { API_BASE, fetchWithSessionHandling, getAuthHeaders, getStoredToken, redirectToLogin } from "@/lib/api";

const API_URL = API_BASE;

interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  hashtags?: string[];
  category?: string;
}

interface PipelineArtifacts {
  final_video: string | null;
  thumbnail: string | null;
  subtitles: string | null;
  metadata: string | null;
}

interface ProjectStatus {
  overall_status: string;
  steps: { name: string; status: string }[];
  artifacts: PipelineArtifacts;
  error: string | null;
  progress?: number;
  current_step?: string;
  current_scene_index?: number;
  completed_scenes?: number[];
  failed_scenes?: number[];
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function PreviewPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const projectId    = searchParams.get("project");

  const [project, setProject]     = useState<ProjectStatus | null>(null);
  const [metadata, setMetadata]   = useState<YouTubeMetadata | null>(null);
  const [videoError, setVideoError]   = useState(false);
  const [thumbError, setThumbError]   = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [rotatingMsgIndex, setRotatingMsgIndex] = useState(0);
  const [retrying, setRetrying]       = useState(false);
  const [backendHealth, setBackendHealth] = useState("ok");
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const [feedbackIssue, setFeedbackIssue] = useState<string>("");
  const [showMagicMoment, setShowMagicMoment] = useState(false);
  const [anticipationIndex, setAnticipationIndex] = useState(0);
  const [hasRevealed, setHasRevealed] = useState(false);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const token = getStoredToken();
    if (!token) {
      redirectToLogin();
      return;
    }
    if (mounted) {
      setTimeout(() => setAuthChecked(true), 0);
    }
    return () => { mounted = false; };
  }, [router]);

  const videoUrl     = project?.artifacts?.final_video ? `${API_URL}${project.artifacts.final_video}` : null;
  const thumbnailUrl = project?.artifacts?.thumbnail   ? `${API_URL}${project.artifacts.thumbnail}` : null;
  const subtitlesUrl = project?.artifacts?.subtitles   ? `${API_URL}${project.artifacts.subtitles}` : null;
  const videoReady   = !!videoUrl && project?.overall_status === "complete";

  const fetchData = useCallback(async () => {
    if (!projectId || !authChecked) return;
    try {
      const hRes = await fetch(`${API_URL}/api/health`);
      if (hRes.ok) {
        const hData = await parseJsonSafe(hRes);
        setBackendHealth(hData.celery);
      }

      const statusRes = await fetchWithSessionHandling(`${API_URL}/api/pipeline/${projectId}/status`, {
        headers: getAuthHeaders(),
      });
      if (statusRes.status === 401 || statusRes.status === 403) {
        setProject(prev => prev ? { ...prev, overall_status: "error", error: "Authentication required." } : {
          overall_status: "error",
          steps: [],
          artifacts: { final_video: null, thumbnail: null, subtitles: null, metadata: null },
          error: "Authentication required.",
        });
        return;
      }

      if (statusRes.ok) {
        const data = await parseJsonSafe(statusRes) as ProjectStatus;
        setProject(data);

        if (data.overall_status === "complete" && !metadata) {
          const metaRes = await fetchWithSessionHandling(`${API_URL}/api/pipeline/${projectId}/metadata`, {
            headers: getAuthHeaders(),
          });
          if (metaRes.status === 401 || metaRes.status === 403) {
            return;
          }

          if (metaRes.ok) {
            setMetadata(await parseJsonSafe(metaRes) as YouTubeMetadata);
          }
        }
      } else {
        setProject(prev => prev ? { ...prev, overall_status: "error", error: "Failed to fetch project status." } : {
          overall_status: "error",
          steps: [],
          artifacts: { final_video: null, thumbnail: null, subtitles: null, metadata: null },
          error: "Failed to fetch project status.",
        });
      }
    } catch {
      setProject(prev => prev ? { ...prev, overall_status: "error", error: "Failed to fetch project status." } : {
        overall_status: "error",
        steps: [],
        artifacts: { final_video: null, thumbnail: null, subtitles: null, metadata: null },
        error: "Failed to fetch project status.",
      });
    }
  }, [projectId, metadata, authChecked]);

  useEffect(() => {
    let mounted = true;
    if (mounted) {
      setTimeout(() => fetchData(), 0);
    }
    const interval = setInterval(() => {
      if (project?.overall_status !== "complete" && project?.overall_status !== "error") fetchData();
    }, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchData, project?.overall_status]);

  // Magic Moment Trigger
  useEffect(() => {
    if (project?.overall_status === "complete" && !hasRevealed) {
      setTimeout(() => {
        setShowMagicMoment(true);
        setHasRevealed(true);
      }, 0);
      setTimeout(() => setShowMagicMoment(false), 5000);
    }
  }, [project?.overall_status, hasRevealed]);

  // Anticipation Loop
  useEffect(() => {
    if (project?.overall_status === "running") {
      const msgs = ["✨ Finalizing cinematic edit...", "🎵 Syncing audio & visuals...", "🎬 Rendering final output..."];
      const interval = setInterval(() => {
        setAnticipationIndex(prev => (prev + 1) % msgs.length);
      }, 3500);
      return () => clearInterval(interval);
    }
  }, [project?.overall_status]);

  // (removed arbitrary rotation interval)

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetchWithSessionHandling(`${API_URL}/api/pipeline/${projectId}/retry`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) {
        return;
      }

      if (res.ok) {
        setProject(prev => prev ? { ...prev, overall_status: "pending", error: null } : null);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
    setRetrying(false);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch {/* ignore */}
  };

  const handleFeedback = async (rating: string, issueType?: string) => {
    try {
      if (rating !== "needs_feedback") {
        setFeedbackGiven(rating);
        const res = await fetchWithSessionHandling(`${API_URL}/api/pipeline/${projectId}/feedback`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ rating, issueType: issueType || null })
        });
        if (res.status === 401) {
          return;
        }
      } else {
        setFeedbackGiven("needs_feedback");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!authChecked) {
    return (
      <div style={{ textAlign: "center", padding: "100px", color: "var(--text-muted)" }}>
        <span className="spin" style={{ fontSize: "32px" }}>⟳</span>
      </div>
    );
  }

  if (!projectId) {
    return (
      <div style={{ textAlign: "center", padding: "100px 24px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎬</div>
        <h2>No project found</h2>
        <button className="btn btn-primary" style={{ marginTop: "24px" }} onClick={() => router.push("/")}>
          ← Create a Video
        </button>
      </div>
    );
  }

  // ── UX Logic ──────────────────────────────────────────────────────────────
  const steps = project?.steps || [];
  
  // Mappings
  const UX_STEPS = [
    { id: "scene_breakdown", label: "🎬 Writing your story...", eta: "~10s" },
    { id: "voice_generation", label: "🎙️ Generating emotional voiceover...", eta: "~30s" },
    { id: "visual_selection", label: "🎥 Fetching cinematic visuals...", eta: "~40s" },
    { id: "scene_assembly", label: "✂️ Editing dynamic scenes...", eta: "~60–90s" },
    { id: "qa_check", label: "✨ Applying final polish...", eta: "~10s" }
  ];

  let currentActiveId = "scene_breakdown";
  let percent = 10;
  
  // Find current step from backend state or steps array
  if (project?.current_step) {
    currentActiveId = project.current_step;
  } else {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status === "running" || steps[i].status === "complete") {
        currentActiveId = steps[i].name;
        break;
      }
    }
  }

  // Override mapping for final steps
  if (["final_assembly", "subtitles", "thumbnail", "metadata"].includes(currentActiveId)) {
    currentActiveId = "qa_check";
  }

  const activeIndex = UX_STEPS.findIndex(s => s.id === currentActiveId);
  
  // Use backend progress if available, else fallback to estimation
  if (project?.progress !== undefined) {
    percent = project.progress > 1.1 ? Math.round(project.progress) : Math.round(project.progress * 100);
  } else if (activeIndex >= 0) {
    if (project?.overall_status === "complete") percent = 100;
    else percent = Math.min(95, (activeIndex / UX_STEPS.length) * 100 + 10);
  }

  // Smart Retry Detection
  // If qa_check is complete/error, but an earlier step like voice/visuals is running
  const qaStep = steps.find(s => s.name === "qa_check");
  const voiceStep = steps.find(s => s.name === "voice_generation");
  const visualsStep = steps.find(s => s.name === "visual_selection");
  const isRetrying = qaStep && (qaStep.status === "complete" || qaStep.status === "error") && 
                     (voiceStep?.status === "running" || visualsStep?.status === "running");

  const currentEta = UX_STEPS[activeIndex >= 0 ? activeIndex : 0].eta;
  const isComplete = project?.overall_status === "complete";
  const isError = project?.overall_status === "error";

  // Friendly error mapping
  const getFriendlyError = (err: string | null) => {
    if (!err) return "We hit a snag while generating your video.";
    const e = err.toLowerCase();
    if (e.includes("assembly")) return "We hit a small issue while assembling your video.";
    if (e.includes("voice")) return "Voice generation had a temporary issue.";
    if (e.includes("media") || e.includes("visual")) return "We couldn't fetch some visuals — recovering.";
    if (e.includes("regenerating")) return "Quality check flagged a few scenes. Please try regenerating.";
    return "Something went wrong — but your progress is safe.";
  };

  const ANTICIPATION_MSGS = ["✨ Finalizing cinematic edit...", "🎵 Syncing audio & visuals...", "🎬 Rendering final output..."];

  const handleDownloadAll = async () => {
    if (!videoUrl || !thumbnailUrl || !subtitlesUrl) return;
    const links = [
      { url: videoUrl, name: "video.mp4" },
      { url: thumbnailUrl, name: "thumbnail.jpg" },
      { url: subtitlesUrl, name: "subtitles.srt" }
    ];
    for (const link of links) {
      const a = document.createElement("a");
      a.href = link.url;
      a.download = link.name;
      a.click();
      await new Promise(r => setTimeout(r, 800)); // Gap to avoid browser blocking
    }
  };

  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Magic Moment Overlay */}
      {showMagicMoment && (
        <div className="magic-moment-overlay" onClick={() => setShowMagicMoment(false)}>
          <div style={{ fontSize: "64px", marginBottom: "24px" }}>🎬</div>
          <h1 style={{ fontSize: "3rem", margin: 0, background: "linear-gradient(to right, #4ade80, #3b82f6)", WebkitBackgroundClip: "text", color: "transparent" }}>
            Your video is ready
          </h1>
          <p style={{ fontSize: "1.4rem", color: "var(--text-secondary)", marginTop: "16px" }}>
            ✨ Optimized for engagement • 🚀 Ready to upload
          </p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: "40px" }}>
            Take me to my content kit
          </button>
        </div>
      )}

      <nav className="navbar">
        <div className="container">
          <div className="navbar-inner">
            <a href="/" className="logo">
              <div className="logo-icon">🎬</div>
              <span>ScriptToVideo</span>
              <span className="logo-badge">AI</span>
            </a>
            <button className="btn btn-secondary" onClick={() => router.push("/")}>
              ← Create New Video
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero" style={{ paddingBottom: isComplete ? "60px" : "40px" }}>
        <div className="container">
          {isComplete ? (
            <div style={{ animation: "fadeInUp 0.6s ease-out" }}>
              <div className="hero-tag" style={{ background: "var(--success)", color: "#000", border: "none" }}>
                ✅ Pipeline Complete
              </div>
              <h1 style={{ fontSize: "3.5rem", marginTop: "16px", background: "linear-gradient(to right, #4ade80, #3b82f6)", WebkitBackgroundClip: "text", color: "transparent" }}>
                🚀 Your Content Pack is Ready
              </h1>
              <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "12px" }}>
                 <div className="trust-badge">🛡️ AI optimized for retention</div>
                 <div className="trust-badge">⚡ Cinematic rendering enabled</div>
              </div>
            </div>
          ) : isError ? (
            <div style={{ animation: "fadeInUp 0.6s ease-out" }}>
              <div className="hero-tag" style={{ background: "rgba(239, 68, 68, 0.1)", color: "var(--error)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                ⚠️ Pipeline Interrupted
              </div>
              <h1 style={{ marginTop: "16px", color: "var(--error)" }}>
                {getFriendlyError(project?.error)}
              </h1>
              <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
                {(project as any)?.retry_attempt >= 3 ? "Recovery limits reached. Please create a new video." : "Don't worry, we saved your progress safely. You won't be charged extra credits to resume."}
              </p>
              <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "32px" }}>
                <button 
                  className="btn btn-primary" 
                  disabled={retrying || (project as any)?.retry_attempt >= 3}
                  onClick={handleRetry}
                  style={{ background: "var(--error)", borderColor: "transparent" }}
                >
                  {retrying ? "Resuming..." : "⟳ Resume from Failed Step"}
                </button>
              </div>
              {process.env.NODE_ENV === "development" && (
                <div style={{ marginTop: "32px", background: "rgba(0,0,0,0.5)", padding: "16px", borderRadius: "8px", fontFamily: "monospace", fontSize: "12px", textAlign: "left", display: "inline-block" }}>
                  <div style={{ color: "var(--accent)", marginBottom: "8px" }}>DEV DEBUG STATE</div>
                  <div>Failed Step: {(project as any)?.failed_step || "None"}</div>
                  <div>Last Success: {(project as any)?.last_successful_step || "None"}</div>
                  <div>Retry Attempt: {(project as any)?.retry_attempt || 0}/2</div>
                  <div style={{ color: "var(--error)", marginTop: "8px" }}>Raw: {project?.error}</div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="hero-tag">
                <span className="pulsing-dot" style={{ display: "inline-block", width: "8px", height: "8px", background: "var(--accent)", borderRadius: "50%", marginRight: "8px" }}></span>
                {backendHealth === "down" ? "⚠️ Processing service is inactive" : isRetrying ? "Improving quality..." : ANTICIPATION_MSGS[anticipationIndex]}
              </div>
              <h1 style={{ marginTop: "16px" }}>⏳ Generating Your Video...</h1>
              <p style={{ color: "var(--text-muted)" }}>⏳ Optimized for 99% retention... please wait</p>
              
              {/* Progress UI */}
              <div style={{ marginTop: "40px", maxWidth: "700px", margin: "40px auto 0", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>Generation Progress</span>
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>{Math.round(percent)}%</span>
                </div>
                <div style={{ height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "10px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${percent}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2))", transition: "width 0.5s ease-out" }}></div>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${UX_STEPS.length}, 1fr)`, gap: "8px", marginTop: "24px" }}>
                  {UX_STEPS.map((step, i) => {
                    const isActive = i === activeIndex && !isComplete;
                    const isDone = isComplete || i < activeIndex;
                    return (
                      <div key={step.id} style={{ display: "flex", flexDirection: "column", gap: "8px", opacity: (isDone || isActive) ? 1 : 0.4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          {isDone ? (
                            <span style={{ color: "var(--success)" }}>✓</span>
                          ) : isActive ? (
                            <span className="spin" style={{ color: "var(--accent)", fontSize: "12px" }}>⟳</span>
                          ) : (
                            <span style={{ width: "12px", height: "12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%" }}></span>
                          )}
                          <span style={{ fontSize: "12px", fontWeight: isActive ? 600 : 400, color: isActive ? "var(--accent)" : "var(--text-secondary)" }}>
                            {step.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="container" style={{ paddingBottom: "80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px", alignItems: "start" }}>

          {/* Left: Video + Thumbnail */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Video Card */}
            <div className="card" style={isComplete ? { borderColor: "rgba(74,222,128,0.3)", boxShadow: "0 0 30px rgba(74,222,128,0.05)" } : {}}>
              <div className="card-title">{isComplete ? "🎉 Final Video" : "🎬 Visual Output"}</div>

              <div className="video-player-wrap">
                {!videoReady ? (
                  <div className="video-placeholder">
                    <div style={{ fontSize: "36px", marginBottom: "16px", animation: "pulse 2s infinite" }}>
                      {UX_STEPS[activeIndex >= 0 ? activeIndex : 0].label.substring(0, 2)}
                    </div>
                    <span style={{ fontWeight: 600 }}>{isRetrying ? "Improving quality..." : UX_STEPS[activeIndex >= 0 ? activeIndex : 0].label.replace(/^[^\s]+\s/,'')}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "8px" }}>Please wait while we assemble your media...</span>
                    {project?.overall_status === "error" && (
                      <span style={{ color: "var(--error)", marginTop: "12px" }}>Pipeline error — check logs</span>
                    )}
                  </div>
                ) : !videoError && videoUrl ? (
                  <video
                    key={videoUrl}
                    controls
                    autoPlay
                    src={videoUrl}
                    className={isComplete ? "reveal-anim" : ""}
                    onError={() => setVideoError(true)}
                  />
                ) : (
                  <div className="video-placeholder">
                    <span style={{ fontSize: "32px" }}>⚠️</span>
                    <span>Video failed to load</span>
                    {videoUrl && <a href={videoUrl} style={{ color: "var(--accent)" }}>Direct link ↗</a>}
                  </div>
                )}
              </div>

            {/* Content Pack Grouping */}
            {isComplete && (
              <div className="card" style={{ background: "rgba(124,106,247,0.02)", borderColor: "rgba(124,106,247,0.2)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div className="card-title" style={{ margin: 0 }}>📦 Your Content Pack</div>
                  <div className="value-label">📈 Optimized for engagement</div>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <button className="btn btn-primary btn-lg btn-full primary-glow" style={{ fontSize: "1.2rem", padding: "20px" }}>
                    🚀 Download & Upload to YouTube
                  </button>
                  
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <button className="btn btn-secondary" onClick={handleDownloadAll}>
                      📂 Download All Assets
                    </button>
                    <button className="btn btn-secondary" onClick={() => copyToClipboard(window.location.href, "link")}>
                      🔗 {copySuccess === "link" ? "Copied!" : "Copy Project Link"}
                    </button>
                  </div>
                  
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", textAlign: "center", marginTop: "8px" }}>
                    ⏱ Created in under 2 minutes • No credits lost on retry
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* Thumbnail */}
            {thumbnailUrl && (
              <div className="card">
                <div className="card-title">🖼️ Thumbnail</div>
                <div className="thumbnail-preview">
                  {!thumbError ? (
                    <img src={thumbnailUrl} onError={() => setThumbError(true)} alt="Video thumbnail" />
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
                      Thumbnail not ready
                    </div>
                  )}
                </div>
                <a href={thumbnailUrl} download="thumbnail.jpg" className="btn btn-secondary btn-full" style={{ marginTop: "12px" }}>
                  ⬇ Download Thumbnail
                </a>
              </div>
            )}
          </div>

          {/* Right: Metadata + Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", position: "sticky", top: "80px" }}>

            {/* Metadata */}
            {metadata ? (
              <div className="card">
                <div className="card-title">📊 YouTube Metadata</div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Title</div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.4 }}>{metadata.title}</div>
                  <button
                    onClick={() => copyToClipboard(metadata.title, "title")}
                    style={{ marginTop: "6px", fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {copySuccess === "title" ? "✓ Copied!" : "Copy ↗"}
                  </button>
                </div>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "6px", textTransform: "uppercase" }}>Description</div>
                  <div style={{
                    fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6,
                    maxHeight: "120px", overflow: "hidden auto",
                    background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "10px",
                  }}>
                    {metadata.description}
                  </div>
                  <button
                    onClick={() => copyToClipboard(metadata.description, "description")}
                    style={{ marginTop: "6px", fontSize: "11px", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {copySuccess === "description" ? "✓ Copied!" : "Copy ↗"}
                  </button>
                </div>

                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Tags</div>
                  <div className="tags-list">
                    {(metadata.tags || []).map(tag => (
                      <span key={tag} className="tag">{tag}</span>
                    ))}
                  </div>
                </div>

                {metadata.hashtags && (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-muted)", marginBottom: "8px", textTransform: "uppercase" }}>Hashtags</div>
                    <div className="tags-list">
                      {metadata.hashtags.map(h => (
                        <span key={h} className="tag" style={{ color: "var(--accent-2)", borderColor: "rgba(224,90,238,0.3)" }}>{h}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card" style={{ textAlign: "center", padding: "32px" }}>
                <span className="spin" style={{ fontSize: "24px", color: "var(--text-muted)", display: "inline-block", marginBottom: "12px" }}>⟳</span>
                <p style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>
                  {project?.overall_status === "complete" ? "Metadata not available." : "Metadata will appear here..."}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="card" style={{ background: "rgba(34,209,122,0.04)", border: "1px solid rgba(34,209,122,0.15)" }}>
              <div className="card-title" style={{ color: "var(--success)" }}>🚀 Publish</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <button
                  className="btn btn-success btn-full"
                  disabled={!videoReady}
                  title="YouTube upload requires API credentials in .env"
                >
                  ▶ Upload to YouTube
                </button>
                <button className="btn btn-secondary btn-full" onClick={() => router.push("/")}>
                  🔄 Create New Video
                </button>
              </div>
              <p style={{ marginTop: "12px", fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.5 }}>
                YouTube upload requires GOOGLE_REFRESH_TOKEN in backend .env
              </p>
            </div>

            {/* Feedback Loop */}
            {isComplete && (
              <div className="card" style={{ marginTop: "0px" }}>
                <div className="card-title">✨ How is the video?</div>
                {!feedbackGiven ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div style={{ display: "flex", gap: "10px" }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleFeedback("thumbs_up")}>
                        👍 Amazing
                      </button>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => handleFeedback("needs_feedback")}>
                        👎 Needs Work
                      </button>
                    </div>
                  </div>
                ) : feedbackGiven === "needs_feedback" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: 0 }}>What went wrong?</p>
                    <select
                      className="form-input"
                      value={feedbackIssue}
                      onChange={e => setFeedbackIssue(e.target.value)}
                      style={{ fontSize: "14px", padding: "8px", background: "rgba(0,0,0,0.2)" }}
                    >
                      <option value="">Select issue...</option>
                      <option value="voice">🤖 Voice/Pronunciation</option>
                      <option value="visuals">🖼️ Irrelevant Visuals</option>
                      <option value="script">📝 Script Quality</option>
                      <option value="thumbnail">🖼️ Bad Thumbnail</option>
                    </select>
                    <button
                      className="btn btn-primary btn-full"
                      disabled={!feedbackIssue}
                      onClick={() => handleFeedback("thumbs_down", feedbackIssue)}
                    >
                      Submit Feedback
                    </button>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "12px 0" }}>
                    <div style={{ color: "var(--success)", marginBottom: "16px" }}>✓ Thank you for your feedback!</div>
                    <button className="btn btn-primary btn-full" onClick={() => router.push("/")}>
                      🚀 Generate Another Video
                    </button>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "12px" }}>
                      🔥 Want more like this? <span style={{ color: "var(--accent)", cursor: "pointer" }} onClick={() => router.push("/")}>Generate 3 videos instantly</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Project info */}
            <div style={{ padding: "12px", background: "rgba(0,0,0,0.2)", borderRadius: "10px", textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
                Project: {projectId?.slice(0, 8)}...
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense fallback={
      <div style={{ textAlign: "center", padding: "100px", color: "var(--text-muted)" }}>
        <span className="spin" style={{ fontSize: "32px" }}>⟳</span>
      </div>
    }>
      <PreviewPageInner />
    </Suspense>
  );
}
