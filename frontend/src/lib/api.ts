/* Typed client for the Smash Speed Flask API. */

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:5000").replace(/\/$/, "");
export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 500);
export const ACCEPTED_EXT = [".mp4", ".mov", ".m4v"];

export type VideoInfo = {
  width: number;
  height: number;
  rotation: number;
  codec: string;
  frame_count: number;
  duration_s: number;
  container_fps: number;
  nominal_fps: number;
  variable_frame_rate: boolean;
  slowmo_hint: boolean;
  notes: string[];
  analysis_width?: number;
  analysis_height?: number;
};

export type Upload = {
  id: string;
  filename: string;
  size: number;
  info: VideoInfo;
  proxy_status: "pending" | "processing" | "ready" | "failed";
  proxy_error: string | null;
  video_url: string | null;
};

export type Point = [number, number];
export type CalibrationRef = { label: string; distance_m: number; p1: Point; p2: Point };
export type CalibrationPayload = {
  references: CalibrationRef[];
  camera_distance_m: number;
  plane_offset_m: number;
};

export type AnalysisRequest = {
  upload_id: string;
  capture_fps?: number | null;
  start_s?: number | null;
  end_s?: number | null;
  calibration?: CalibrationPayload | null;
};

export type ResultStatus =
  | "ok"
  | "calibration_required"
  | "insufficient_fps"
  | "no_shuttle"
  | "implausible";

export type TrackPoint = { frame: number; t: number; x: number; y: number; interpolated: boolean };

export type SpeedResult = {
  status: ResultStatus;
  peak_kmh: number | null;
  peak_ci_kmh: [number, number] | null;
  avg_kmh: number | null;
  distance_m: number | null;
  elapsed_s: number | null;
  interval: [number, number] | null;
  fit: Record<string, number | string | boolean | null>;
  contact: null | {
    kmh: number;
    ci_kmh: [number, number];
    extrapolated_s: number;
    extrapolated_m: number;
    contact_t: number;
    contact_frame: number;
    contact_xy: Point;
    rel_sigma: number;
  };
  uncertainty: Record<string, number | string>;
  series: { t: number; v: number; model: number | null }[];
  reliability: { grade?: "A" | "B" | "C"; detection_rate?: number; size_ratio?: number; warnings?: string[] };
  messages: string[];
};

export type AnalysisResult = {
  status: ResultStatus;
  video: VideoInfo;
  timing: {
    time_scale: number;
    effective_fps: number;
    capture_fps_override: number | null;
    start_s: number | null;
    end_s: number | null;
  };
  speed: SpeedResult | null;
  calibration: null | {
    method: string;
    scale_m_per_px: number;
    rel_sigma_click: number;
    rel_sigma_spread: number;
    rel_sigma_plane: number;
    rel_sigma_total: number;
    references: { label: string; distance_m: number; length_px: number; p1: Point; p2: Point }[];
    warnings: string[];
  };
  track: {
    points: TrackPoint[];
    hit_frame: number | null;
    hit_t: number | null;
    hit_source: string;
    outliers_removed: number;
    gaps_interpolated: number;
    trajectories_considered: number;
    detection_rate: number;
  };
  detector: { name: string; neural_available: boolean };
  inspection: { frame: number; t: number; file: string; tracked: boolean; interpolated: boolean }[];
  messages: string[];
};

export type Stage = { key: string; label: string };

export type Analysis = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  stage: string | null;
  stage_progress: number;
  progress: number;
  message: string | null;
  error: string | null;
  created: number;
  options: Omit<AnalysisRequest, "upload_id">;
  result: AnalysisResult | null;
  stages: Stage[];
  upload: Upload | null;
};

export type HistoryItem = {
  id: string;
  created: number;
  status: Analysis["status"];
  filename: string | null;
  result_status: ResultStatus | null;
  peak_kmh: number | null;
  contact_kmh: number | null;
  avg_kmh: number | null;
  grade: string | null;
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error?.message ?? `Request failed (${res.status}).`;
    throw new ApiError(msg, res.status, body?.error?.code);
  }
  return body as T;
}

const NETWORK_MSG =
  "Can't reach the analysis server. Make sure the Smash Speed backend is running (see README).";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  } catch {
    throw new ApiError(NETWORK_MSG, 0, "network");
  }
  return json<T>(res);
}

export const api = {
  getUpload: (id: string) => request<Upload>(`/api/uploads/${id}`),
  createAnalysis: (body: AnalysisRequest) =>
    request<{ id: string }>(`/api/analyses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  getAnalysis: (id: string) => request<Analysis>(`/api/analyses/${id}`),
  listAnalyses: () => request<{ items: HistoryItem[] }>(`/api/analyses`),
  frameUrl: (uploadId: string, t: number) => `${API_BASE}/api/uploads/${uploadId}/frame?t=${t.toFixed(3)}`,
  inspectUrl: (analysisId: string, file: string) => `${API_BASE}/api/analyses/${analysisId}/frames/${file}`,
  videoUrl: (u: Upload) => (u.video_url ? `${API_BASE}${u.video_url}` : null),
};

/** Upload with real byte-level progress (fetch has no upload progress events). */
export function uploadVideo(
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Upload> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/uploads`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as Upload);
      else {
        const b = body as { error?: { message?: string; code?: string } } | null;
        reject(new ApiError(b?.error?.message ?? `Upload failed (${xhr.status}).`, xhr.status, b?.error?.code));
      }
    };
    xhr.onerror = () => reject(new ApiError(NETWORK_MSG, 0, "network"));
    xhr.onabort = () => reject(new ApiError("Upload cancelled.", 0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort());
    const fd = new FormData();
    fd.append("file", file);
    xhr.send(fd);
  });
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
