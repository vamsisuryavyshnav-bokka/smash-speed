"use client";

import { useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/api";

const MEASURED = "var(--color-series-measured)";
const MODEL = "var(--color-series-model)";
const W = 640, H = 280, P = { l: 48, r: 16, t: 16, b: 36 };

function niceTicks(max: number, n = 4) {
  const raw = max / n;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
}

/** Speed vs time: per-interval measured speeds (dots) and the fitted drag model (line). */
export function SpeedChart({ result }: { result: AnalysisResult }) {
  const series = useMemo(() => result.speed?.series ?? [], [result.speed?.series]);
  const contact = result.speed?.contact;
  const [hover, setHover] = useState<number | null>(null);

  const { pts, xMax, yMax, modelPath, xs, ys } = useMemo(() => {
    const ext = contact ? contact.extrapolated_s : 0;
    const pts = series.map((s) => ({ t: (s.t + ext) * 1000, v: s.v * 3.6, m: s.model != null ? s.model * 3.6 : null }));
    const xMax = Math.max(...pts.map((p) => p.t), 1) * 1.04;
    const yTop = Math.max(...pts.map((p) => Math.max(p.v, p.m ?? 0)), contact?.ci_kmh[1] ?? 0, 1);
    const yMax = niceTicks(yTop * 1.08).at(-1)! < yTop * 1.02 ? yTop * 1.15 : niceTicks(yTop * 1.08).at(-1)!;
    const xs = (t: number) => P.l + (t / xMax) * (W - P.l - P.r);
    const ys = (v: number) => H - P.b - (v / yMax) * (H - P.t - P.b);
    // Model curve: v(t) = v0 / (1 + v0 t / L), drawn from contact (if known) to the last point.
    const fit = result.speed?.fit ?? {};
    const v0 = Number(fit.v0_m_s), L = Number(fit.L_m);
    let modelPath = "";
    if (v0 > 0 && L > 0) {
      const t0 = -(contact?.extrapolated_s ?? 0);
      const t1 = (series.at(-1)?.t ?? 0);
      for (let i = 0; i <= 80; i++) {
        const t = t0 + ((t1 - t0) * i) / 80;
        const v = (v0 / (1 + (v0 * t) / L)) * 3.6;
        modelPath += `${i ? "L" : "M"}${xs((t - t0) * 1000).toFixed(1)} ${ys(v).toFixed(1)}`;
      }
    }
    return { pts, xMax, yMax, modelPath, xs, ys };
  }, [series, contact, result.speed?.fit]);

  if (!pts.length) return null;
  const hp = hover != null ? pts[hover] : null;

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-5 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: MEASURED }} />Measured (per frame interval)</span>
        <span className="flex items-center gap-2"><span className="h-[2px] w-4" style={{ background: MODEL }} />Fitted drag model</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Shuttle speed over time after contact"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = ((e.clientX - r.left) / r.width) * W;
            let best = 0;
            pts.forEach((p, i) => Math.abs(xs(p.t) - x) < Math.abs(xs(pts[best].t) - x) && (best = i));
            setHover(best);
          }}
        >
          {niceTicks(yMax).map((v) => (
            <g key={v}>
              <line x1={P.l} x2={W - P.r} y1={ys(v)} y2={ys(v)} stroke="var(--color-line)" />
              <text x={P.l - 8} y={ys(v) + 4} textAnchor="end" fontSize="11" fill="var(--color-muted)" className="tnum">{v}</text>
            </g>
          ))}
          {niceTicks(xMax, 5).map((t) => (
            <text key={t} x={xs(t)} y={H - P.b + 18} textAnchor="middle" fontSize="11" fill="var(--color-muted)" className="tnum">{t}</text>
          ))}
          <text x={W - P.r} y={H - 4} textAnchor="end" fontSize="11" fill="var(--color-muted)">ms after {contact ? "contact" : "first detection"}</text>
          <text x={P.l} y={10} fontSize="11" fill="var(--color-muted)">km/h</text>
          {hp && <line x1={xs(hp.t)} x2={xs(hp.t)} y1={P.t} y2={H - P.b} stroke="var(--color-line-strong)" />}
          <path d={modelPath} fill="none" stroke={MODEL} strokeWidth="2" />
          {contact && (
            <g>
              <line x1={xs(0)} x2={xs(0)} y1={ys(contact.ci_kmh[0])} y2={ys(contact.ci_kmh[1])} stroke="var(--color-ink-2)" strokeWidth="1.5" />
              <circle cx={xs(0)} cy={ys(contact.kmh)} r="5" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="2" />
            </g>
          )}
          {pts.map((p, i) => (
            <circle key={i} cx={xs(p.t)} cy={ys(p.v)} r={hover === i ? 5.5 : 4} fill={MEASURED} stroke="var(--color-surface)" strokeWidth="2" />
          ))}
        </svg>
        {hp && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-card)]"
            style={{ left: `clamp(0px, calc(${(xs(hp.t) / W) * 100}% - 70px), calc(100% - 150px))` }}
          >
            <p className="tnum font-mono text-muted">{hp.t.toFixed(1)} ms</p>
            <p className="tnum">Measured <b>{hp.v.toFixed(0)}</b> km/h</p>
            {hp.m != null && <p className="tnum">Model <b>{hp.m.toFixed(0)}</b> km/h</p>}
          </div>
        )}
      </div>
      <figcaption className="mt-2 text-[12px] leading-[1.5] text-muted">
        Frame-to-frame speeds are noisy by nature; the drag model fitted to all positions gives the reported values.
        {contact && " Hollow marker: extrapolated contact speed with its 95% interval."}
      </figcaption>
      <details className="mt-3 text-[12.5px]">
        <summary className="cursor-pointer text-muted">Show data table</summary>
        <table className="tnum mt-2 w-full text-left">
          <thead className="text-muted"><tr><th className="py-1 font-normal">ms</th><th className="font-normal">measured km/h</th><th className="font-normal">model km/h</th></tr></thead>
          <tbody>
            {pts.map((p, i) => (
              <tr key={i} className="border-t border-line"><td className="py-1">{p.t.toFixed(2)}</td><td>{p.v.toFixed(1)}</td><td>{p.m?.toFixed(1) ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Image-space trajectory (same orientation as the video). */
export function TrajectoryChart({ result }: { result: AnalysisResult }) {
  const pts = result.track.points;
  const contact = result.speed?.contact;
  const aspect = (result.video.analysis_width ?? 16) / (result.video.analysis_height ?? 9);
  const TW = 640, TH = TW / aspect;
  if (!pts.length) return null;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${(p.x * TW).toFixed(1)} ${(p.y * TH).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${TW} ${TH}`} className="w-full rounded-[12px] border border-line bg-paper" role="img" aria-label="Shuttle trajectory in the video frame">
        {[0.25, 0.5, 0.75].map((f) => (
          <g key={f}>
            <line x1={f * TW} x2={f * TW} y1={0} y2={TH} stroke="var(--color-line)" />
            <line x1={0} x2={TW} y1={f * TH} y2={f * TH} stroke="var(--color-line)" />
          </g>
        ))}
        <path d={d} fill="none" stroke={MEASURED} strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={p.x * TW} cy={p.y * TH} r="3.2" fill={p.interpolated ? "var(--color-surface)" : MEASURED} stroke={p.interpolated ? MEASURED : "var(--color-surface)"} strokeWidth="1.5">
            <title>{`frame ${p.frame} · t=${p.t.toFixed(4)} s${p.interpolated ? " · interpolated" : ""}`}</title>
          </circle>
        ))}
        {contact && (
          <g>
            <line x1={contact.contact_xy[0] * TW} y1={contact.contact_xy[1] * TH} x2={pts[0].x * TW} y2={pts[0].y * TH} stroke="var(--color-ink-2)" strokeDasharray="4 4" />
            <circle cx={contact.contact_xy[0] * TW} cy={contact.contact_xy[1] * TH} r="6" fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
            <text x={contact.contact_xy[0] * TW + 10} y={contact.contact_xy[1] * TH - 8} fontSize="12" fill="var(--color-ink-2)">contact</text>
          </g>
        )}
      </svg>
      <figcaption className="mt-2 text-[12px] text-muted">
        {pts.filter((p) => !p.interpolated).length} detected positions, {pts.filter((p) => p.interpolated).length} interpolated (hollow)
        {contact && ", dashed: extrapolated segment back to contact"}.
      </figcaption>
    </figure>
  );
}
