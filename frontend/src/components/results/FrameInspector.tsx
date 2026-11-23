"use client";

import { useEffect, useState } from "react";
import { api, type AnalysisResult } from "@/lib/api";

/* Frame-by-frame view of the analysed segment, rendered server-side with every
   motion candidate (grey rings), the chosen track and the current detection. */
export function FrameInspector({ id, result }: { id: string; result: AnalysisResult }) {
  const frames = result.inspection;
  const firstTracked = Math.max(0, frames.findIndex((f) => f.tracked));
  const [i, setI] = useState(firstTracked);
  const f = frames[i];

  useEffect(() => {
    // Warm the cache for neighbours so stepping feels instant.
    [i - 1, i + 1, i + 2].forEach((j) => {
      if (frames[j]) new Image().src = api.inspectUrl(id, frames[j].file);
    });
  }, [i, frames, id]);

  if (!frames.length) return <p className="text-[14px] text-muted">No inspection frames were produced for this analysis.</p>;

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") setI((v) => Math.min(frames.length - 1, v + 1));
        if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      }}
      className="outline-none"
      aria-label="Frame inspector. Use left and right arrow keys to step."
    >
      <div className="overflow-hidden rounded-[12px] bg-ink">
        {/* eslint-disable-next-line @next/next/no-img-element -- server-rendered analysis frames */}
        <img src={api.inspectUrl(id, f.file)} alt={`Frame ${f.frame}`} className="block w-full" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-ghost btn-sm" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>‹ Prev</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setI((v) => Math.min(frames.length - 1, v + 1))} disabled={i === frames.length - 1}>Next ›</button>
        <p className="tnum font-mono text-[12px] text-ink-2">
          frame {f.frame} · t = {f.t.toFixed(4)} s ·{" "}
          <span className={f.tracked ? (f.interpolated ? "text-warn" : "text-accent") : "text-muted"}>
            {f.tracked ? (f.interpolated ? "interpolated" : "shuttle detected") : "outside smash segment"}
          </span>
        </p>
      </div>
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={i}
        onChange={(e) => setI(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--color-accent)]"
        aria-label="Inspection frame"
      />
      <div className="mt-1 flex h-2 gap-px" aria-hidden>
        {frames.map((fr, j) => (
          <span key={fr.frame} className={`flex-1 rounded-[1px] ${j === i ? "bg-ink" : fr.tracked ? (fr.interpolated ? "bg-warn/50" : "bg-accent/60") : "bg-line"}`} />
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">Grey rings: every motion candidate · line: chosen trajectory · ring: this frame&apos;s detection.</p>
    </div>
  );
}
