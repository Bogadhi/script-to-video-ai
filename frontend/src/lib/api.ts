// All backend traffic goes through the SaaS Node.js backend on port 5002.
// Port 5001 (Python) is REMOVED — it bypassed JWT auth and credit gating.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5002";

export interface GenerateVideoData {
  script_text: string;
  visual_style?: string;
  voice_style?: string;
  video_category?: string;
}

export interface GenerateVideoResponse {
  jobId: string;
  projectId: string;
  videoUrl: string | null;
}

export interface JobStatusResponse {
  jobId: string;
  state: string;
  progress: number;
  stage?: string | null;
  projectId?: string | null;
  currentStep?: string | null;
  result?: {
    videoUrl?: string | null;
    projectId?: string | null;
    duration?: number;
    scenesCount?: number;
    metadata?: Record<string, unknown>;
  } | null;
  error?: string | null;
  attemptsMade?: number;
  queuedAt?: number;
  finishedAt?: number | null;
}

export interface UserInfo {
  id: string;
  email?: string;
  credits: number;
  plan: string;
}

export interface PipelineStepStatus {
  name: string;
  status: string;
  msg?: string;
}

export interface PipelineStatusResponse {
  overall_status: string;
  progress?: number;
  current_step?: string;
  steps: PipelineStepStatus[];
  artifacts?: {
    final_video?: string | null;
    video?: string | null;
    thumbnail?: string | null;
    subtitles?: string | null;
    metadata?: string | null;
  };
  error?: string | null;
}

export interface PipelineResultResponse {
  status?: string;
  detail?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
  subtitles_url?: string | null;
}

export interface AdCreative {
  id: string;
  title?: string;
  body?: string;
  brand?: string;
  cta?: string;
  targetUrl?: string;
  imageUrl?: string;
}

export interface PaymentOrderResponse {
  id: string;
  amount: number;
  currency: string;
}

export interface PaymentVerificationData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  plan: string;
}

const AUTH_TOKEN_KEY = "token";
const USER_STORAGE_KEY = "user";
const AUTH_ROUTES = new Set(["/login", "/register"]);

/* ================= AUTH HELPERS ================= */

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  window.localStorage.removeItem(USER_STORAGE_KEY);
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  if (AUTH_ROUTES.has(window.location.pathname)) return;
  window.location.replace("/login");
}

export function handleUnauthorizedResponse() {
  clearAuthSession();
  redirectToLogin();
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const [, payload] = token.split(".");
    if (!payload) return false;
    const parsed = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof parsed.exp !== "number") return false;
    return parsed.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

export function getValidatedToken(): string | null {
  const token = getStoredToken();
  if (!token) return null;
  return isTokenExpired(token) ? null : token;
}

export function getAuthHeaders(): Record<string, string> {
  const token = getValidatedToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ================= UTIL ================= */

export function toAbsoluteUrl(urlOrPath?: string | null): string | null {
  if (!urlOrPath) return null;
  // Already absolute URL
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  // Relative path — prepend API_BASE
  return `${API_BASE}${urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`}`;
}

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/* ================= FETCH WRAPPER ================= */

export async function fetchWithSessionHandling(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    handleUnauthorizedResponse();
  }
  return response;
}

/* ================= MAIN REQUEST FUNCTION ================= */

export async function request<T = any>(url: string, options: RequestInit = {}) {
  const token = getValidatedToken();

  const res = await fetchWithSessionHandling(
    url.startsWith("/") ? `${API_BASE}${url}` : url,
    {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    },
  );

  if (!res.ok) {
    const error = await parseJsonSafe(res);
    throw new Error(error.message || `Request failed with status ${res.status}`);
  }

  return (await parseJsonSafe(res)) as T;
}

/* ================= HELPERS ================= */

function extractPlan(data: Record<string, unknown> | null | undefined): string {
  const candidates = [data?.plan, data?.plan_id, data?.tier, data?.subscription_plan];
  const plan = candidates.find((v) => typeof v === "string");
  return typeof plan === "string" ? plan : "FREE";
}

function extractCredits(data: Record<string, unknown> | null | undefined): number {
  const candidates = [data?.credits, data?.remaining_credits, data?.daily_remaining];
  const credits = candidates.find((v) => typeof v === "number");
  return typeof credits === "number" ? credits : 3;
}

/* ================= API ================= */

export const api = {
  /**
   * Submit a video generation job.
   * Routes to POST /generate-video on port 5002 (SaaS backend with auth + credit gating).
   */
  async generateVideo(data: GenerateVideoData): Promise<GenerateVideoResponse> {
    const token = getValidatedToken();
    if (!token) {
      redirectToLogin();
      throw new Error("Session expired. Please login again.");
    }

    const payload = {
      script: data.script_text,
      voice: data.voice_style || "calm",
      style: data.visual_style || "realistic",
      category: data.video_category || "storytelling",
    };

    // Uses request() which targets API_BASE (port 5002) — NOT the old 5001 Python backend
    const response = await request<{ jobId: string; success?: boolean; state?: string }>(
      "/generate-video",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );

    return {
      jobId: String(response.jobId),
      projectId: String(response.jobId),
      videoUrl: null,
    };
  },

  /**
   * Poll job status.
   * Routes to GET /job/:id on port 5002.
   */
  async getJob(jobId: string): Promise<JobStatusResponse> {
    return request<JobStatusResponse>(`/job/${jobId}`);
  },

  async getUser(): Promise<UserInfo> {
    if (typeof window === "undefined") {
      return { id: "guest", credits: 3, plan: "FREE" };
    }

    const token = getStoredToken();
    if (!token) {
      return { id: "guest", credits: 3, plan: "FREE" };
    }

    const me = await request<{ user: Record<string, unknown> }>("/api/auth/me");

    let creditsData: Record<string, unknown> | null = null;
    try {
      creditsData = await request<Record<string, unknown>>("/api/credits/status");
    } catch {
      creditsData = null;
    }

    return {
      id: String(me.user.id ?? "guest"),
      email: typeof me.user.email === "string" ? me.user.email : undefined,
      plan: extractPlan(creditsData) || extractPlan(me.user),
      credits: extractCredits(creditsData),
    };
  },

  async getPipelineStatus(projectId: string): Promise<PipelineStatusResponse> {
    return request(`/api/pipeline/${projectId}/status`);
  },

  async getPipelineResult(projectId: string): Promise<PipelineResultResponse> {
    return request(`/api/pipeline/${projectId}/result`);
  },

  async applyCoupon(code: string) {
    return request("/api/credits/redeem", {
      method: "POST",
      body: JSON.stringify({ coupon: code }),
    });
  },

  async createPaymentOrder(amount: number, plan: string): Promise<PaymentOrderResponse> {
    const response = await request<Record<string, any>>("/api/payments/create-order", {
      method: "POST",
      body: JSON.stringify({ amount, plan }),
    });

    const id = response.id || response.order_id;
    if (!id) throw new Error("Payment order missing ID");

    return {
      id,
      amount: response.amount || amount * 100,
      currency: response.currency || "INR",
    };
  },

  async verifyPayment(data: PaymentVerificationData) {
    return request("/api/payments/verify", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getAds(): Promise<AdCreative[]> {
    return request("/api/ads");
  },

  /**
   * Track ad impression — POST /api/ads/impression (now implemented, no longer 404).
   */
  async trackAdImpression(adId: string) {
    return request("/api/ads/impression", {
      method: "POST",
      body: JSON.stringify({ adId }),
    }).catch(() => ({ success: false })); // Non-fatal — ad tracking failures don't break UI
  },

  /**
   * Track ad click — POST /api/ads/click (now implemented, no longer 404).
   */
  async trackAdClick(adId: string) {
    return request("/api/ads/click", {
      method: "POST",
      body: JSON.stringify({ adId }),
    }).catch(() => ({ success: false })); // Non-fatal
  },
};
