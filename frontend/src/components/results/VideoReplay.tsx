"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisResult } from "@/lib/api";

/* Replays the browser-safe proxy video with the detected trajectory drawn on a
   canvas. The proxy keeps the source's frame timestamps, so the overlay uses the
   same clock as the analysis (seconds from the first frame). */
export function VideoReplay({ src, result }: { src: string | null; result: AnalysisResult }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [rate, setRate] = useState(0.25);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const pts = result.track.points;
  const contact = result.speed?.contact ?? null;
  const fps = result.video.container_fps;
  const aspect = (result.video.analysis_width ?? 16) / (result.video.analysis_height ?? 9);

  const draw = useCallback(() => {
    const v = video.current;
    const c = canvas.current;
    if (!v || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const t = v.currentTime + 0.5 / fps;
    const shown = pts.filter((p) => p.t <= t);
    if (contact && contact.contact_t <= t) {
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(contact.contact_xy[0] * w, contact.contact_xy[1] * h, 9, 0, Math.PI * 2);
      g.stroke();
      g.font = "11px ui-monospace, monospace";
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.fillText("contact", contact.contact_xy[0] * w + 13, contact.contact_xy[1] * h - 8);
    }
    if (shown.length > 1) {
      g.strokeStyle = "rgba(20,132,95,0.95)";
      g.lineWidth = 2;
      g.lineJoin = "round";
      g.beginPath();
      shown.forEach((p, i) => (i ? g.lineTo(p.x * w, p.y * h) : g.moveTo(p.x * w, p.y * h)));
      g.stroke();
    }
    shown.forEach((p) => {
      g.beginPath();
      g.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
      if (p.interpolated) {
        g.strokeStyle = "#fff";
        g.lineWidth = 1;
        g.stroke();
      } else {
        g.fillStyle = "#fff";
        g.fill();
      }
    });
    const last = shown[shown.length - 1];
    if (last && t - last.t < 2 / fps) {
      g.strokeStyle = "#14845f";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(last.x * w, last.y * h, 11, 0, Math.PI * 2);
      g.stroke();
    }
  }, [pts, contact, fps]);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    const vv = v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (h: number) => void };
    const tick = () => {
      draw();
      setTime(v.currentTime);
      handle = vv.requestVideoFrameCallback ? vv.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    tick();
    const ro = new ResizeObserver(draw);
    ro.observe(v);
    return () => {
      if (vv.cancelVideoFrameCallback) vv.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      ro.disconnect();
    };
  }, [draw, src]);

  useEffect(() => {
    if (video.current) video.current.playbackRate = rate;
  }, [rate]);

  const seek = (t: number) => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, t);
    draw();
  };
  const step = (dir: number) => seek((video.current?.currentTime ?? 0) + dir / fps);
  const start = contact?.contact_t ?? pts[0]?.t ?? 0;

  if (!src) {
    return (
      <div className="grid aspect-video place-items-center rounded-[14px] bg-ink px-6 text-center text-[13px] text-paper/70">
        The replay video is still being prepared or could not be created. The frame inspector below shows the detections.
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-[14px] bg-ink" style={{ aspectRatio: aspect }}>
        <video
          ref={video}
          src={src}
          playsInline
          muted
          preload="auto"
          className="absolute inset-0 h-full w-full object-fill"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={() => {
            if (video.current) {
              video.current.playbackRate = rate;
              video.current.currentTime = Math.max(0, start - 0.15);
            }
          }}
        />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" />
      </div>
      <div className="no-print mt-3 flex flex-wrap items-center gap-2">
        <button
          className="btn btn-primary btn-sm min-w-[84px]"
          onClick={() => (video.current?.paused ? video.current.play() : video.current?.pause())}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => step(-1)} aria-label="Previous frame">
          ‹ Frame
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => step(1)} aria-label="Next frame">
          Frame ›
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => seek(start - 0.1)}>
          Jump to smash
        </button>
        <div className="ml-auto flex items-center gap-1 rounded-full border border-line p-1" role="group" aria-label="Playback speed">
          {[0.1, 0.25, 1].map((r) => (
            <button
              key={r}
              onClick={() => setRate(r)}
              aria-pressed={rate === r}
              className={`tnum h-7 rounded-full px-3 font-mono text-[12px] ${rate === r ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
            >
              {r}×
            </button>
          ))}
        </div>
      </div>
      <p className="tnum mt-2 font-mono text-[11.5px] text-muted">
        t = {time.toFixed(4)} s · frame ≈ {Math.round(time * fps)}
      </p>
    </div>
  );
}
