"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, ApiError, formatBytes, uploadVideo, type CalibrationRef, type Upload } from "@/lib/api";
import { CalibrationTool } from "./CalibrationTool";
import { Dropzone, validateFile } from "./Dropzone";

type State =
  | { kind: "idle"; error?: string | null }
  | { kind: "uploading"; file: File; localUrl: string; progress: number }
  | { kind: "ready"; file: File; localUrl: string; upload: Upload };

const fmt = (s: number) => `${s.toFixed(2)} s`;

function Step({ n, title, children, hint }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-line pt-8 first:border-t-0 first:pt-0 md:grid-cols-[180px_1fr]">
      <div>
        <p className="font-mono text-[11px] text-muted">0{n}</p>
        <h3 className="mt-1 text-[16px] font-medium tracking-[-0.01em]">{title}</h3>
        {hint && <p className="mt-1.5 text-[13px] leading-[1.55] text-muted">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Analyzer() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [localPlayable, setLocalPlayable] = useState(true);
  const [range, setRange] = useState<{ start: string; end: string }>({ start: "", end: "" });
  const [captureFps, setCaptureFps] = useState("");
  const [frameT, setFrameT] = useState(0);
  const [refs, setRefs] = useState<CalibrationRef[]>([]);
  const [cameraDist, setCameraDist] = useState("8");
  const [planeOffset, setPlaneOffset] = useState("0.5");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Release each object URL once it is no longer the current one.
  const localUrl = state.kind === "idle" ? null : state.localUrl;
  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  // Poll until the server-side H.264 preview exists (used if the browser can't play the original).
  const uploadId = state.kind === "ready" ? state.upload.id : null;
  const proxyStatus = state.kind === "ready" ? state.upload.proxy_status : null;
  useEffect(() => {
    if (!uploadId || proxyStatus === "ready" || proxyStatus === "failed") return;
    const t = setInterval(async () => {
      try {
        const u = await api.getUpload(uploadId);
        setState((s) => (s.kind === "ready" && s.upload.id === u.id ? { ...s, upload: u } : s));
      } catch {}
    }, 1500);
    return () => clearInterval(t);
  }, [uploadId, proxyStatus]);

  const reset = (error?: string | null) => {
    abort.current?.abort();
    setState({ kind: "idle", error });
    setRange({ start: "", end: "" });
    setCaptureFps("");
    setRefs([]);
    setFrameT(0);
    setLocalPlayable(true);
    setSubmitError(null);
  };

  const onFile = async (file: File) => {
    const problem = validateFile(file);
    if (problem) return reset(problem);
    reset();
    const localUrl = URL.createObjectURL(file);
    const ctrl = new AbortController();
    abort.current = ctrl;
    setState({ kind: "uploading", file, localUrl, progress: 0 });
    try {
      const upload = await uploadVideo(
        file,
        (p) => setState((s) => (s.kind === "uploading" ? { ...s, progress: p } : s)),
        ctrl.signal,
      );
      setState({ kind: "ready", file, localUrl, upload });
    } catch (e) {
      URL.revokeObjectURL(localUrl);
      if ((e as ApiError).code === "aborted") return;
      setState({ kind: "idle", error: (e as Error).message });
    }
  };

  const submit = async () => {
    if (state.kind !== "ready") return;
    setSubmitting(true);
    setSubmitError(null);
    const complete = refs.filter((r) => r.p1 && r.p2 && r.distance_m > 0);
    try {
      const { id } = await api.createAnalysis({
        upload_id: state.upload.id,
        start_s: range.start === "" ? null : Number(range.start),
        end_s: range.end === "" ? null : Number(range.end),
        capture_fps: captureFps === "" ? null : Number(captureFps),
        calibration: complete.length
          ? { references: complete, camera_distance_m: Number(cameraDist) || 8, plane_offset_m: Number(planeOffset) || 0 }
          : null,
      });
      router.push(`/analysis/${id}`);
    } catch (e) {
      setSubmitError((e as Error).message);
      setSubmitting(false);
    }
  };

  if (state.kind === "idle") return <Dropzone onFile={onFile} error={state.error} />;

  const info = state.kind === "ready" ? state.upload.info : null;
  const lowFps = info ? info.container_fps < 100 : false;
  const proxyUrl = state.kind === "ready" ? api.videoUrl(state.upload) : null;
  const videoSrc = localPlayable ? state.localUrl : proxyUrl;
  const fpsNum = Number(captureFps);
  const effFps = captureFps && fpsNum > 0 ? fpsNum : info?.container_fps ?? 0;

  return (
    <div className="card overflow-hidden">
      {/* File bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-medium">{state.file.name}</p>
          <p className="tnum text-[12.5px] text-muted">
            {formatBytes(state.file.size)}
            {info && ` · ${info.width}×${info.height} · ${info.container_fps.toFixed(0)} fps · ${info.duration_s.toFixed(2)} s · ${info.frame_count} frames`}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="btn btn-ghost btn-sm cursor-pointer">
            Replace
            <input type="file" accept=".mp4,.mov,.m4v" className="sr-only" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </label>
          <button className="btn btn-ghost btn-sm" onClick={() => reset()}>
            Remove
          </button>
        </div>
      </div>

      {state.kind === "uploading" && (
        <div className="px-6 py-10" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="text-[14px] font-medium">Uploading</p>
            <p className="tnum font-mono text-[13px] text-muted">{Math.round(state.progress * 100)}%</p>
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(state.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${state.progress * 100}%` }} />
          </div>
          <p className="mt-3 text-[12.5px] text-muted">
            {formatBytes(state.file.size * state.progress)} of {formatBytes(state.file.size)}
            {state.progress >= 1 && " — reading video metadata on the server…"}
          </p>
          <button className="btn btn-ghost btn-sm mt-6" onClick={() => reset()}>
            Cancel upload
          </button>
        </div>
      )}

      {state.kind === "ready" && info && (
        <div className="grid gap-10 p-6 md:p-8">
          <Step n={1} title="Preview & trim" hint="Keep only the second or two around the smash. Shorter clips analyse faster.">
            <div className="overflow-hidden rounded-[12px] bg-ink">
              {videoSrc ? (
                <video
                  ref={video}
                  key={videoSrc}
                  src={videoSrc}
                  controls
                  playsInline
                  muted
                  preload="metadata"
                  className="aspect-video w-full bg-ink object-contain"
                  onError={() => localPlayable && setLocalPlayable(false)}
                />
              ) : (
                <div className="grid aspect-video place-items-center px-6 text-center text-[13px] text-paper/70">
                  {state.upload.proxy_status === "failed"
                    ? "A browser preview couldn't be created, but the video can still be analysed."
                    : "Your browser can't play this format directly. Preparing a compatible preview…"}
                </div>
              )}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(["start", "end"] as const).map((k) => (
                <label key={k} className="grid gap-1.5">
                  <span className="label">{k === "start" ? "Start" : "End"} (seconds)</span>
                  <div className="flex gap-2">
                    <input
                      className="field tnum"
                      type="number"
                      min={0}
                      max={info.duration_s}
                      step={0.01}
                      placeholder={k === "start" ? "0.00" : info.duration_s.toFixed(2)}
                      value={range[k]}
                      onChange={(e) => setRange((r) => ({ ...r, [k]: e.target.value }))}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm shrink-0"
                      onClick={() => video.current && setRange((r) => ({ ...r, [k]: video.current!.currentTime.toFixed(2) }))}
                    >
                      Use playhead
                    </button>
                  </div>
                </label>
              ))}
            </div>
          </Step>

          <Step n={2} title="Frame rate" hint="Speed is only as good as the timing. Slow-motion files often store a lower playback rate.">
            <div className={`rounded-[12px] p-4 text-[14px] leading-[1.6] ${lowFps ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-ink"}`}>
              {lowFps ? (
                <>
                  This file plays at <b className="tnum">{info.container_fps.toFixed(0)} fps</b>. If you recorded in slow
                  motion, enter the capture rate below (e.g. 120 or 240). Otherwise the shuttle moves too far between
                  frames to measure, and the analysis will say so.
                </>
              ) : (
                <>
                  Timing comes from per-frame timestamps: <b className="tnum">{info.container_fps.toFixed(1)} fps</b>
                  {info.variable_frame_rate && " (variable frame rate)"}. Only override this if the file was
                  re-encoded from a higher capture rate.
                </>
              )}
            </div>
            {info.notes.length > 0 && !lowFps && (
              <ul className="mt-3 grid gap-1 text-[13px] text-muted">
                {info.notes.map((n) => <li key={n}>— {n}</li>)}
              </ul>
            )}
            <label className="mt-4 grid max-w-[260px] gap-1.5">
              <span className="label">Capture frame rate (optional)</span>
              <input className="field tnum" type="number" min={15} max={2000} placeholder={`${info.container_fps.toFixed(0)} (detected)`} value={captureFps} onChange={(e) => setCaptureFps(e.target.value)} />
            </label>
            {captureFps && fpsNum > 0 && (
              <p className="mt-2 text-[12.5px] text-muted">
                Real time per frame: {(1000 / fpsNum).toFixed(2)} ms (file stores {(1000 / info.container_fps).toFixed(2)} ms).
              </p>
            )}
          </Step>

          <Step n={3} title="Calibrate distance" hint="One reference converts pixels into metres. Without it you get the trajectory but no km/h.">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-muted">
              <span>Frame at {fmt(frameT)}</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => video.current && setFrameT(video.current.currentTime)}>
                Use current video frame
              </button>
            </div>
            <CalibrationTool frameSrc={api.frameUrl(state.upload.id, frameT)} value={refs} onChange={setRefs} />
            <details className="mt-5 rounded-[12px] border border-line p-4">
              <summary className="cursor-pointer text-[13.5px] font-medium">Camera geometry (affects the uncertainty)</summary>
              <p className="mt-3 text-[13px] leading-[1.6] text-muted">
                A reference that is nearer to or farther from the camera than the shuttle&apos;s flight path scales
                distances by roughly offset ÷ camera distance. These values widen the confidence interval honestly;
                they don&apos;t change the central estimate.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="label">Camera to flight path (m)</span>
                  <input className="field tnum" type="number" min={1} step={0.5} value={cameraDist} onChange={(e) => setCameraDist(e.target.value)} />
                </label>
                <label className="grid gap-1.5">
                  <span className="label">Reference offset from flight path (m)</span>
                  <input className="field tnum" type="number" min={0} step={0.1} value={planeOffset} onChange={(e) => setPlaneOffset(e.target.value)} />
                </label>
              </div>
            </details>
          </Step>

          <div className="flex flex-col gap-4 border-t border-line pt-8 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-[1.55] text-muted">
              {refs.length === 0
                ? "No calibration yet — the analysis will track the shuttle but cannot report km/h."
                : effFps < 100
                  ? "Effective frame rate is below 100 fps — expect the analysis to decline a speed."
                  : `${refs.length} reference${refs.length > 1 ? "s" : ""} · ${effFps.toFixed(0)} fps effective.`}
            </p>
            <button className="btn btn-primary" onClick={submit} disabled={submitting}>
              {submitting ? "Starting…" : "Start analysis"}
            </button>
          </div>
          {submitError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
              {submitError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
