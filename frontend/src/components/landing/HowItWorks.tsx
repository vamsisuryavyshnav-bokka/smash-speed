import type { ReactNode } from "react";

/* Four stages on a vertical rail. Each rail node is a [data-shuttle-anchor] the
   scroll-driven shuttle flies through. */

const Frame = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 240 150" className="h-auto w-full" aria-hidden>
    <rect x="0.5" y="0.5" width="239" height="149" rx="12" fill="#fdfcfa" stroke="#e3e0d8" />
    {children}
  </svg>
);

const visuals = {
  capture: (
    <Frame>
      <rect x="72" y="22" width="96" height="106" rx="14" fill="none" stroke="#141412" strokeWidth="1.5" />
      <rect x="80" y="34" width="80" height="78" rx="4" fill="#efece5" />
      <path d="M80 92 L160 92" stroke="#cfcbc0" />
      <circle cx="120" cy="120" r="3" fill="#141412" />
      <text x="88" y="50" fontFamily="var(--font-mono)" fontSize="9" fill="#0f5c45">● REC</text>
      <text x="120" y="80" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="14" fill="#141412">240 fps</text>
    </Frame>
  ),
  detect: (
    <Frame>
      <path d="M0 112 L240 112" stroke="#e3e0d8" />
      {[[40, 70], [70, 40], [150, 96], [196, 58]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="5" fill="none" stroke="#a9a79f" strokeDasharray="2 2" />
      ))}
      <circle cx="122" cy="60" r="13" fill="none" stroke="#0f5c45" strokeWidth="1.5" />
      <path d="M122 41 v8 M122 71 v8 M103 60 h8 M133 60 h8" stroke="#0f5c45" strokeWidth="1.5" />
      <path d="M116 58 L128 62" stroke="#141412" strokeWidth="3" strokeLinecap="round" />
    </Frame>
  ),
  track: (
    <Frame>
      {Array.from({ length: 11 }, (_, i) => {
        const t = i / 10;
        const x = 28 + 184 * (1 - Math.exp(-2.1 * t)) / (1 - Math.exp(-2.1));
        const y = 34 + 82 * t;
        return <circle key={i} cx={x} cy={y} r={i === 10 ? 4.5 : 3} fill={i === 10 ? "#0f5c45" : "#141412"} opacity={0.35 + 0.65 * t} />;
      })}
      <text x="28" y="134" fontFamily="var(--font-mono)" fontSize="9" fill="#7b7a73">t₀</text>
      <text x="200" y="134" fontFamily="var(--font-mono)" fontSize="9" fill="#7b7a73">tₙ</text>
    </Frame>
  ),
  measure: (
    <Frame>
      <text x="120" y="68" textAnchor="middle" fontFamily="var(--font-instrument)" fontSize="34" fill="#141412">
        v = d / t
      </text>
      <path d="M44 96 H196" stroke="#141412" strokeWidth="1" />
      <path d="M44 90 v12 M196 90 v12" stroke="#141412" />
      <text x="120" y="118" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9" fill="#7b7a73">
        calibrated metres · timestamped frames
      </text>
    </Frame>
  ),
};

const STEPS = [
  {
    key: "capture",
    title: "Capture",
    lead: "Upload your badminton video.",
    body: "Film side-on from a tripod, in slow motion (120–240 fps). MP4, MOV and M4V are accepted, and you can trim the clip down to the smash.",
  },
  {
    key: "detect",
    title: "Detect",
    lead: "Automatically identify the shuttlecock.",
    body: "Three-frame motion analysis isolates small, fast objects — including the blurred streak a shuttle leaves at full speed — and rejects players and rackets by shape.",
  },
  {
    key: "track",
    title: "Track",
    lead: "Follow its movement across video frames.",
    body: "Detections are linked into trajectories using real frame timestamps. Gaps from blur or occlusion are bridged, outliers are removed, and the racket contact is located.",
  },
  {
    key: "measure",
    title: "Measure",
    lead: "Calculate its estimated speed.",
    body: "Pixels become metres through a court reference you mark once. A drag model of shuttle flight is fitted to the track to give peak and contact speed with a confidence interval.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-16 py-24 md:py-36">
      <div className="container-page">
        <div className="grid gap-6 md:grid-cols-12" data-reveal>
          <p className="eyebrow md:col-span-3">How it works</p>
          <h2 className="display text-[clamp(38px,5vw,64px)] md:col-span-8">
            From a phone clip to a number <em className="text-muted">you can trust.</em>
          </h2>
        </div>

        <ol className="relative mt-20 md:mt-28">
          <span className="absolute bottom-6 left-[11px] top-6 w-px bg-line md:left-[calc(25%-1px)]" aria-hidden />
          {STEPS.map((s, i) => (
            <li key={s.key} className="relative grid gap-8 pb-20 pl-12 last:pb-0 md:grid-cols-12 md:pl-0 md:pb-32">
              <div className="md:col-span-3 md:pr-10">
                <span
                  data-shuttle-anchor={`step-${i + 1}`}
                  className="absolute left-0 top-1 grid h-[23px] w-[23px] place-items-center rounded-full border border-line-strong bg-paper md:left-[calc(25%-12px)]"
                  aria-hidden
                >
                  <span className="h-[7px] w-[7px] rounded-full bg-accent" />
                </span>
                <p className="font-mono text-[12px] text-muted" data-reveal>
                  0{i + 1}
                </p>
              </div>
              <div className="md:col-span-4 md:col-start-5" data-reveal>
                <h3 className="display text-[44px] tracking-[-0.02em]">{s.title}</h3>
                <p className="mt-3 text-[16px] font-medium text-ink">{s.lead}</p>
                <p className="mt-3 text-[15px] leading-[1.65] text-muted">{s.body}</p>
              </div>
              <div className="md:col-span-4 md:col-start-9" data-reveal style={{ ["--reveal-delay" as string]: "120ms" }}>
                <div className="overflow-hidden rounded-[14px] shadow-[var(--shadow-card)]">{visuals[s.key]}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
