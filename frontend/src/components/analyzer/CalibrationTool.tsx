"use client";

import { useCallback, useRef, useState } from "react";
import type { CalibrationRef, Point } from "@/lib/api";

/* Court references (BWF dimensions). The user marks both ends of one of these in a
   still frame; that sets metres-per-pixel for the plane of the reference. */
export const PRESETS = [
  { label: "Net post height (floor to top)", distance_m: 1.55 },
  { label: "Net to short service line", distance_m: 1.98 },
  { label: "Back boundary to long doubles service line", distance_m: 0.76 },
  { label: "Net to back boundary (half court)", distance_m: 6.7 },
  { label: "Doubles court width", distance_m: 6.1 },
  { label: "Custom distance", distance_m: 1.0 },
];

type Props = {
  frameSrc: string;
  value: CalibrationRef[];
  onChange: (refs: CalibrationRef[]) => void;
};

const COLORS = ["#0f5c45", "#b8562a", "#3d3c38"];

export function CalibrationTool({ frameSrc, value, onChange }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState<Point | null>(null);
  const [drag, setDrag] = useState<{ ref: number; end: "p1" | "p2" } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const toNorm = useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = box.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    ];
  }, []);

  const place = (p: Point) => {
    if (!pending) {
      setPending(p);
      return;
    }
    const preset = PRESETS[0];
    const existing = value[active];
    const next: CalibrationRef = {
      label: existing?.label ?? preset.label,
      distance_m: existing?.distance_m ?? preset.distance_m,
      p1: pending,
      p2: p,
    };
    const refs = [...value];
    refs[active] = next;
    onChange(refs);
    setPending(null);
  };

  const update = (i: number, patch: Partial<CalibrationRef>) => {
    const refs = [...value];
    refs[i] = { ...refs[i], ...patch };
    onChange(refs);
  };

  return (
    <div className="grid gap-5">
      <div
        ref={box}
        className="relative cursor-crosshair select-none overflow-hidden rounded-[12px] border border-line bg-paper-2"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).dataset.handle) return;
          place(toNorm(e));
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          update(drag.ref, { [drag.end]: toNorm(e) } as Partial<CalibrationRef>);
        }}
        onPointerUp={() => setDrag(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic frame from the analysis server */}
        <img
          src={frameSrc}
          alt="Still frame from your video for marking a court reference"
          className={`block w-full transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
          draggable={false}
          onLoad={() => {
            setLoaded(true);
            setFailed(false);
          }}
          onError={() => setFailed(true)}
        />
        {!loaded && !failed && <div className="absolute inset-0 grid place-items-center text-[13px] text-muted">Loading frame…</div>}
        {failed && <div className="absolute inset-0 grid place-items-center text-[13px] text-danger">Couldn&apos;t load this frame.</div>}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {value.map((r, i) => (
            <line key={i} x1={r.p1[0]} y1={r.p1[1]} x2={r.p2[0]} y2={r.p2[1]} stroke={COLORS[i]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {value.flatMap((r, i) =>
          (["p1", "p2"] as const).map((end) => (
            <span
              key={`${i}${end}`}
              data-handle="1"
              role="button"
              aria-label={`Reference ${i + 1} ${end === "p1" ? "start" : "end"} point at ${(r[end][0] * 100).toFixed(1)}%, ${(r[end][1] * 100).toFixed(1)}%. Drag or use arrow keys to move.`}
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation();
                (e.currentTarget.parentElement as HTMLElement).setPointerCapture(e.pointerId);
                setDrag({ ref: i, end });
              }}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.01 : 0.002;
                const d: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                if (!d[e.key]) return;
                e.preventDefault();
                update(i, { [end]: [r[end][0] + d[e.key][0], r[end][1] + d[e.key][1]] } as Partial<CalibrationRef>);
              }}
              className="absolute h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 bg-white/90 shadow"
              style={{ left: `${r[end][0] * 100}%`, top: `${r[end][1] * 100}%`, borderColor: COLORS[i] }}
            />
          )),
        )}
        {pending && (
          <span
            className="absolute h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-ink"
            style={{ left: `${pending[0] * 100}%`, top: `${pending[1] * 100}%` }}
          />
        )}
      </div>
      <p className="text-[13px] text-muted" aria-live="polite">
        {pending
          ? "Now click the other end of the reference."
          : value[active]
            ? "Drag the handles (or focus one and use arrow keys) to refine. Click twice on the image to redraw."
            : "Click both ends of a court feature whose real length you know — ideally one in the same plane as the shuttle's flight."}
      </p>

      {value.map((r, i) => (
        <div key={i} className="grid gap-3 rounded-[12px] border border-line p-4 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="label flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} /> Reference {i + 1}
            </span>
            <select
              className="field"
              value={PRESETS.find((p) => p.label === r.label)?.label ?? "Custom distance"}
              onChange={(e) => {
                const p = PRESETS.find((x) => x.label === e.target.value)!;
                update(i, { label: p.label, distance_m: p.distance_m });
              }}
            >
              {PRESETS.map((p) => (
                <option key={p.label}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="label">Length (m)</span>
            <input
              className="field tnum"
              type="number"
              min={0.05}
              step={0.01}
              value={r.distance_m}
              onChange={(e) => {
                const v = Number(e.target.value);
                const keep = PRESETS.some((p) => p.label === r.label && p.distance_m === v);
                update(i, { distance_m: v, label: keep ? r.label : "Custom distance" });
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              onChange(value.filter((_, j) => j !== i));
              setActive(Math.max(0, Math.min(active, value.length - 2)));
            }}
          >
            Remove
          </button>
        </div>
      ))}
      {value.length > 0 && value.length < 3 && (
        <button
          type="button"
          className="justify-self-start text-[13px] text-accent underline underline-offset-4"
          onClick={() => {
            setActive(value.length);
            setPending(null);
          }}
        >
          {active === value.length ? "Click two points on the image for the new reference" : "+ Add another reference (checks consistency)"}
        </button>
      )}
    </div>
  );
}
