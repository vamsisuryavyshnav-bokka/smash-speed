"use client";

import Link from "next/link";
import type { Analysis, AnalysisResult } from "@/lib/api";
import { api } from "@/lib/api";
import { SpeedChart, TrajectoryChart } from "./Charts";
import { FrameInspector } from "./FrameInspector";
import { VideoReplay } from "./VideoReplay";

const STATUS_COPY: Record<string, { title: string; body: string; advice: string[] }> = {
  calibration_required: {
    title: "Tracked — but no distance reference",
    body: "The shuttle was found and tracked, but without a calibration reference pixels can't be converted to metres, so no speed in km/h is reported.",
    advice: ["Run the analysis again and mark a court feature of known length, such as the net post (1.55 m)."],
  },
  insufficient_fps: {
    title: "The frame rate is too low to measure a smash",
    body: "At smash speeds the shuttle travels more than half a metre between frames below about 100 fps. A speed from this footage would be a guess, so none is given.",
    advice: [
      "Record using your phone's slow-motion mode (120 or 240 fps).",
      "If this clip was slow motion, enter its capture frame rate when you analyse it.",
    ],
  },
  no_shuttle: {
    title: "No smash trajectory was found",
    body: "No fast, straight-moving small object was detected consistently across frames.",
    advice: [
      "Film side-on with the full flight path in frame, from a tripod.",
      "Use brighter light and a plainer background; avoid busy scenes behind the shuttle.",
      "Trim the clip so it contains the smash.",
    ],
  },
  implausible: {
    title: "The result was physically implausible",
    body: "The computed speed exceeds what any human has achieved, which almost always means the capture frame rate or calibration is wrong.",
    advice: ["Check the capture frame rate you entered.", "Check that the calibration points and distance are correct."],
  },
};

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="border-t border-line pt-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="tnum mt-1 text-[26px] font-medium tracking-[-0.02em]">
        {value}
        {unit && <span className="ml-1 text-[14px] font-normal text-muted">{unit}</span>}
      </p>
      {sub && <p className="tnum mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-6 md:p-8 ${className}`}>
      <h2 className="eyebrow mb-5">{title}</h2>
      {children}
    </section>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-6 border-t border-line py-2.5 text-[13.5px] first:border-t-0">
      <dt className="text-muted">{k}</dt>
      <dd className="tnum text-right text-ink">{v}</dd>
    </div>
  );
}

const pct = (x: unknown) => (typeof x === "number" ? `±${(x * 100).toFixed(1)}%` : "—");

export function ResultsDashboard({ a, result }: { a: Analysis; result: AnalysisResult }) {
  const s = result.speed;
  const ok = result.status === "ok" && s?.peak_kmh != null;
  const contact = s?.contact ?? null;
  const headline = contact?.kmh ?? s?.peak_kmh ?? null;
  const headlineCi = contact?.ci_kmh ?? s?.peak_ci_kmh ?? null;
  const copy = STATUS_COPY[result.status];
  const grade = s?.reliability?.grade;
  const warnings = [...(s?.reliability?.warnings ?? []), ...(result.calibration?.warnings ?? [])];
  const uniqueWarnings = Array.from(new Set(warnings));
  const videoSrc = a.upload ? api.videoUrl(a.upload) : null;
  const pts = result.track.points;

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Analysis · {new Date(a.created * 1000).toLocaleString()}</p>
          <p className="mt-2 truncate text-[14px] text-ink-2">{a.upload?.filename}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Download PDF report</button>
          <Link href="/history" className="btn btn-ghost btn-sm">History</Link>
          <Link href="/#analyze" className="btn btn-primary btn-sm">New analysis</Link>
        </div>
      </div>

      {/* Speed hero */}
      {ok && headline != null ? (
        <section className="card grid gap-10 p-8 md:grid-cols-12 md:p-12">
          <div className="md:col-span-7">
            <p className="eyebrow">{contact ? "Estimated speed at racket contact" : "Peak observed speed"}</p>
            <p className="display tnum mt-4 text-[clamp(88px,15vw,184px)] leading-[0.85] tracking-[-0.03em]">
              {Math.round(headline)}
              <span className="ml-3 align-top font-sans text-[22px] tracking-normal text-muted">km/h</span>
            </p>
            {headlineCi && (
              <p className="tnum mt-6 text-[15px] text-ink-2">
                95% interval {Math.round(headlineCi[0])}–{Math.round(headlineCi[1])} km/h
              </p>
            )}
            <p className="mt-2 max-w-[460px] text-[13.5px] leading-[1.6] text-muted">
              {contact
                ? `Extrapolated ${(contact.extrapolated_s * 1000).toFixed(1)} ms (${contact.extrapolated_m.toFixed(2)} m) back from the first clear detection, using the drag model fitted to this shot.`
                : "Fitted speed at the first frame where the shuttle is clearly tracked after the hit. The contact point wasn't visible, so no extrapolation to the racket was made."}
            </p>
          </div>
          <div className="grid content-end gap-5 md:col-span-4 md:col-start-9">
            {contact && (
              <Stat label="Peak observed (measured)" value={s!.peak_kmh!.toFixed(0)} unit="km/h" sub={s!.peak_ci_kmh ? `95%: ${s!.peak_ci_kmh[0].toFixed(0)}–${s!.peak_ci_kmh[1].toFixed(0)}` : undefined} />
            )}
            <Stat label="Average over tracked interval" value={s!.avg_kmh!.toFixed(0)} unit="km/h" sub={`${s!.distance_m!.toFixed(2)} m in ${(s!.elapsed_s! * 1000).toFixed(1)} ms`} />
            <div className="border-t border-line pt-4">
              <p className="text-[12.5px] text-muted">Reliability</p>
              <p className="mt-1 flex items-center gap-3">
                <span className={`grid h-9 w-9 place-items-center rounded-full font-mono text-[15px] ${grade === "A" ? "bg-accent text-paper" : grade === "B" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-warn"}`}>{grade}</span>
                <span className="text-[13px] leading-[1.45] text-ink-2">
                  {grade === "A" ? "Tight interval, well-tracked, no warnings." : grade === "B" ? "Usable; see the notes below." : "Low confidence; treat as indicative."}
                  <span className="block text-[11.5px] text-muted">Graded on the {contact ? "contact" : "peak"} estimate.</span>
                </span>
              </p>
            </div>
          </div>
        </section>
      ) : (
        copy && (
          <section className="card border-warn/30 p-8 md:p-12">
            <p className="eyebrow text-warn">No speed reported</p>
            <h1 className="display mt-3 text-[clamp(36px,5vw,56px)]">{copy.title}</h1>
            <p className="mt-4 max-w-[640px] text-[15.5px] leading-[1.65] text-ink-2">{copy.body}</p>
            {result.messages.map((m) => <p key={m} className="mt-3 max-w-[640px] text-[13.5px] text-muted">{m}</p>)}
            <ul className="mt-6 grid gap-2 text-[14px] text-ink-2">
              {copy.advice.map((x) => <li key={x}>→ {x}</li>)}
            </ul>
          </section>
        )
      )}

      {uniqueWarnings.length > 0 && (
        <div className="rounded-[14px] bg-warn-soft px-5 py-4 text-[13.5px] text-warn">
          <p className="font-medium">Notes on this measurement</p>
          <ul className="mt-2 grid gap-1">{uniqueWarnings.map((w) => <li key={w}>— {w}</li>)}</ul>
        </div>
      )}

      {pts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Panel title="Replay with detected trajectory" className="lg:col-span-7">
            <VideoReplay src={videoSrc} result={result} />
          </Panel>
          <Panel title="Trajectory" className="lg:col-span-5">
            <TrajectoryChart result={result} />
          </Panel>
        </div>
      )}

      {ok && (
        <Panel title="Speed after contact">
          <SpeedChart result={result} />
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Measurements">
          <dl>
            {contact && <Row k="Contact (racket) time" v={`${contact.contact_t.toFixed(4)} s · frame ${contact.contact_frame}`} />}
            {s?.interval && <Row k="First / last tracked" v={`${s.interval[0].toFixed(4)} s → ${s.interval[1].toFixed(4)} s`} />}
            {s?.distance_m != null && <Row k="Distance (tracked interval)" v={`${s.distance_m.toFixed(3)} m`} />}
            {s?.elapsed_s != null && <Row k="Elapsed time (real)" v={`${(s.elapsed_s * 1000).toFixed(2)} ms`} />}
            <Row k="Effective frame rate" v={`${result.timing.effective_fps.toFixed(1)} fps${result.timing.capture_fps_override ? " (user-entered)" : ""}`} />
            {result.timing.time_scale !== 1 && <Row k="Time scale (file → real)" v={`× ${result.timing.time_scale.toFixed(4)}`} />}
            <Row k="Frames tracked / interpolated" v={`${pts.filter((p) => !p.interpolated).length} / ${result.track.gaps_interpolated}`} />
            <Row k="Detection rate in segment" v={`${(result.track.detection_rate * 100).toFixed(0)}%`} />
            <Row k="Outliers rejected" v={result.track.outliers_removed} />
            <Row k="Candidate trajectories considered" v={result.track.trajectories_considered} />
            <Row k="Detector" v={result.detector.name} />
          </dl>
        </Panel>
        <Panel title="Calibration & uncertainty">
          {result.calibration ? (
            <dl>
              {result.calibration.references.map((r) => (
                <Row key={r.label + r.length_px} k={r.label} v={`${r.distance_m} m = ${r.length_px.toFixed(1)} px`} />
              ))}
              <Row k="Scale" v={`${(result.calibration.scale_m_per_px * 1000).toFixed(3)} mm / px`} />
              <Row k="Marking precision" v={pct(result.calibration.rel_sigma_click)} />
              {result.calibration.rel_sigma_spread > 0 && <Row k="Reference disagreement" v={pct(result.calibration.rel_sigma_spread)} />}
              <Row k="Reference / flight-plane offset" v={pct(result.calibration.rel_sigma_plane)} />
              {s?.uncertainty && <Row k="Model fit" v={pct(s.uncertainty.rel_fit)} />}
              {s?.uncertainty && Number(s.uncertainty.rel_drag) > 0 && <Row k="Drag constant range" v={pct(s.uncertainty.rel_drag)} />}
              {s?.uncertainty && <Row k="Combined (1σ, peak)" v={pct(s.uncertainty.rel_total)} />}
              {contact && <Row k="Combined (1σ, contact, incl. extrapolation)" v={pct(contact.rel_sigma)} />}
            </dl>
          ) : (
            <p className="text-[14px] text-muted">No calibration was supplied for this analysis.</p>
          )}
          <p className="mt-4 text-[12px] leading-[1.55] text-muted">
            Intervals are 95% (1.96σ). They do not include motion toward or away from the camera, which a single side-on view cannot see; that component can only make the true speed higher.
          </p>
        </Panel>
      </div>

      {ok && s && (
        <Panel title="How this number was calculated">
          <ol className="grid gap-5 text-[14px] leading-[1.65] text-ink-2 md:grid-cols-2">
            <li>
              <p className="font-medium text-ink">1 · Time from timestamps</p>
              Each frame&apos;s presentation timestamp gives its time; the effective rate is {result.timing.effective_fps.toFixed(1)} fps, i.e. {(1000 / result.timing.effective_fps).toFixed(2)} ms between frames.
            </li>
            <li>
              <p className="font-medium text-ink">2 · Pixels to metres</p>
              {result.calibration && `The reference gives ${(result.calibration.scale_m_per_px * 1000).toFixed(3)} mm per pixel in the flight plane. `}
              Distances are measured along the shuttle&apos;s path from its first tracked position.
            </li>
            <li>
              <p className="font-medium text-ink">3 · Average speed</p>
              <span className="tnum font-mono text-[13px]">
                v̄ = d / t = {s.distance_m!.toFixed(3)} m / {s.elapsed_s!.toFixed(4)} s = {(s.distance_m! / s.elapsed_s!).toFixed(2)} m/s × 3.6 = {s.avg_kmh!.toFixed(1)} km/h
              </span>
            </li>
            <li>
              <p className="font-medium text-ink">4 · Peak speed from the drag model</p>
              A shuttle decelerates as dv/dt = −v²/L. Fitting s(t) = s₀ + L·ln(1 + v₀t/L) to all {String(s.fit.points_used)} positions gives
              <span className="tnum font-mono text-[13px]"> v₀ = {Number(s.fit.v0_m_s).toFixed(2)} m/s = {s.peak_kmh!.toFixed(1)} km/h</span>
              , with L = {Number(s.fit.L_m).toFixed(2)} m {s.fit.L_fitted ? "(fitted to this shot)" : "(standard feather-shuttle value)"} and RMS residual {(Number(s.fit.rms_residual_m) * 1000).toFixed(1)} mm.
            </li>
            {contact && (
              <li className="md:col-span-2">
                <p className="font-medium text-ink">5 · Back to the racket</p>
                The incoming shuttle&apos;s path ends {contact.extrapolated_m.toFixed(2)} m before the first clear smash detection. Along the fitted model, speed there is v₀·e^(Δs/L) = <span className="tnum font-mono text-[13px]">{contact.kmh.toFixed(1)} km/h</span>, reached {(contact.extrapolated_s * 1000).toFixed(1)} ms earlier. Its interval also includes uncertainty in L and in the calibration scale.
              </li>
            )}
          </ol>
        </Panel>
      )}

      {result.inspection.length > 0 && (
        <Panel title="Frame-by-frame inspection" className="no-print">
          <FrameInspector id={a.id} result={result} />
        </Panel>
      )}
    </div>
  );
}
