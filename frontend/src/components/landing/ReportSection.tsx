/* Explains what the report contains. Deliberately shows no example numbers:
   every figure Smash Speed displays comes from an actual analysis. */

const ITEMS = [
  {
    name: "Contact speed",
    tag: "Extrapolated",
    body: "The speed as the shuttle left the racket, estimated by running the fitted drag model back to the point where the incoming shuttle met the racket. Shown only when that contact point is visible.",
  },
  {
    name: "Peak observed speed",
    tag: "Measured",
    body: "The fitted speed at the first frame in which the shuttle is clearly tracked after contact. Usually a few centimetres to a metre after the racket.",
  },
  {
    name: "Average speed",
    tag: "Measured",
    body: "Distance travelled divided by elapsed time over the whole tracked interval. Always lower than the peak because the shuttle decelerates hard.",
  },
];

export function ReportSection() {
  return (
    <section id="report" className="scroll-mt-16 border-t border-line bg-surface/60 py-24 md:py-36">
      <div className="container-page grid gap-16 md:grid-cols-12">
        <div className="md:col-span-5" data-reveal>
          <p className="eyebrow mb-6">The report</p>
          <h2 className="display text-[clamp(38px,5vw,64px)]">
            Three speeds, <em className="text-muted">clearly labelled.</em>
          </h2>
          <p className="mt-8 max-w-[420px] text-[16px] leading-[1.65] text-ink-2">
            Alongside the numbers you get a replay with the detected trajectory drawn over your video, a speed-decay
            chart, a frame-by-frame inspector, the calibration used and a breakdown of every source of uncertainty.
          </p>
          <figure className="mt-12 max-w-[440px]" data-reveal>
            <svg viewBox="0 0 440 200" className="w-full" role="img" aria-label="Illustration: speed falls quickly after contact">
              <path d="M40 170 H420 M40 20 V170" stroke="#cfcbc0" />
              <path
                d={Array.from({ length: 60 }, (_, i) => {
                  const t = i / 59;
                  const v = 1 / (1 + 3.2 * t);
                  return `${i ? "L" : "M"}${40 + 380 * t} ${170 - 140 * v}`;
                }).join(" ")}
                fill="none"
                stroke="#141412"
                strokeWidth="2"
              />
              <circle cx="40" cy="30" r="5" fill="#0f5c45" />
              <text x="52" y="26" fontSize="11" fill="#3d3c38" fontFamily="var(--font-mono)">contact</text>
              <text x="412" y="188" fontSize="11" textAnchor="end" fill="#7b7a73" fontFamily="var(--font-mono)">time →</text>
              <text x="34" y="20" fontSize="11" textAnchor="end" fill="#7b7a73" fontFamily="var(--font-mono)">v</text>
            </svg>
            <figcaption className="mt-2 text-[12px] text-muted">Illustration of the drag-limited speed decay. Not a measurement.</figcaption>
          </figure>
        </div>
        <ul className="grid gap-4 md:col-span-6 md:col-start-7">
          {ITEMS.map((it, i) => (
            <li key={it.name} className="card p-7" data-reveal style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}>
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="display text-[30px]">{it.name}</h3>
                <span className="rounded-full border border-line px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted">
                  {it.tag}
                </span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.65] text-muted">{it.body}</p>
            </li>
          ))}
          <li className="rounded-[18px] border border-dashed border-line-strong p-7" data-reveal>
            <h3 className="text-[15px] font-medium">When a clip can&apos;t support a number</h3>
            <p className="mt-2 text-[14.5px] leading-[1.65] text-muted">
              Too few frames per second, no calibration, no clear shuttle path or a physically implausible result —
              each produces an explanation and advice for re-filming, never an invented figure.
            </p>
          </li>
        </ul>
      </div>
    </section>
  );
}
