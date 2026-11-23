const POINTS = [
  {
    k: "01",
    title: "Measure progress, not feelings",
    body: "A smash that feels faster isn't always faster. A number you can record session after session shows whether technique work, strength training or a new racket actually changed anything.",
  },
  {
    k: "02",
    title: "See where the speed goes",
    body: "A shuttle loses roughly a fifth of its speed every metre it travels. Seeing the whole decay curve, not just one figure, explains why a steep, early contact point matters.",
  },
  {
    k: "03",
    title: "Know how much to trust it",
    body: "Every result carries a confidence interval and a reliability grade derived from the video itself. If the clip cannot support a measurement, Smash Speed says so instead of guessing.",
  },
];

export function Intro() {
  return (
    <section id="intro" className="scroll-mt-16 border-t border-line bg-surface/60 py-24 md:py-36">
      <div className="container-page grid gap-16 md:grid-cols-12">
        <div className="md:col-span-5" data-reveal>
          <p className="eyebrow mb-6">Why measure speed</p>
          <h2 className="display text-[clamp(38px,5vw,64px)]">
            The fastest shot in racket sport, <em className="text-muted">finally made visible.</em>
          </h2>
        </div>
        <div className="md:col-span-6 md:col-start-7">
          <p className="text-[18px] leading-[1.65] text-ink-2" data-reveal>
            Professional smashes have been clocked well above 400&nbsp;km/h, yet almost every player has no idea how fast
            their own smash is. Radar guns are expensive and court-side systems are out of reach. Smash Speed turns
            the phone in your pocket — recording in slow motion — into a measuring instrument.
          </p>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-[18px] border border-line bg-line">
            {POINTS.map((p, i) => (
              <li key={p.k} className="grid gap-2 bg-surface p-7 sm:grid-cols-[56px_1fr]" data-reveal style={{ ["--reveal-delay" as string]: `${i * 90}ms` }}>
                <span className="font-mono text-[12px] text-accent">{p.k}</span>
                <div>
                  <h3 className="text-[16px] font-medium tracking-[-0.01em]">{p.title}</h3>
                  <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">{p.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
