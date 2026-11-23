/* A feather shuttlecock, drawn pointing right (cork leads), so a CSS rotation
   equals its direction of travel. */

const TIPS = 9;
const SKIRT_NEAR = { x: 118, top: 40, bottom: 60 };
const SKIRT_FAR = { x: 16, top: 6, bottom: 94 };

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function skirtPath() {
  let d = `M${SKIRT_NEAR.x} ${SKIRT_NEAR.top} L${SKIRT_FAR.x} ${SKIRT_FAR.top}`;
  for (let i = 0; i < TIPS - 1; i++) {
    const y1 = lerp(SKIRT_FAR.top, SKIRT_FAR.bottom, (i + 1) / (TIPS - 1));
    const ym = lerp(SKIRT_FAR.top, SKIRT_FAR.bottom, (i + 0.5) / (TIPS - 1));
    d += ` Q${SKIRT_FAR.x - 9} ${ym} ${SKIRT_FAR.x} ${y1}`;
  }
  return d + ` L${SKIRT_NEAR.x} ${SKIRT_NEAR.bottom} Z`;
}

function band(t: number) {
  const x = lerp(SKIRT_NEAR.x, SKIRT_FAR.x, t);
  const y0 = lerp(SKIRT_NEAR.top, SKIRT_FAR.top, t);
  const y1 = lerp(SKIRT_NEAR.bottom, SKIRT_FAR.bottom, t);
  return `M${x} ${y0} Q${x - 5} 50 ${x} ${y1}`;
}

export function Shuttle({ className, title }: { className?: string; title?: string }) {
  const rachis = Array.from({ length: TIPS }, (_, i) => {
    const t = i / (TIPS - 1);
    return [lerp(SKIRT_NEAR.top + 2, SKIRT_NEAR.bottom - 2, t), lerp(SKIRT_FAR.top, SKIRT_FAR.bottom, t)];
  });
  return (
    <svg viewBox="0 0 160 100" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id="ss-skirt" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ebe7de" />
        </linearGradient>
        <radialGradient id="ss-cork" cx="0.35" cy="0.35" r="0.9">
          <stop offset="0" stopColor="#fbf6ec" />
          <stop offset="1" stopColor="#d9ccb4" />
        </radialGradient>
      </defs>
      <path d={skirtPath()} fill="url(#ss-skirt)" stroke="#c9c4b8" strokeWidth="1" strokeLinejoin="round" />
      {rachis.map(([y0, y1], i) => (
        <line key={i} x1={SKIRT_NEAR.x} y1={y0} x2={SKIRT_FAR.x + 1} y2={y1} stroke="#d2cdc1" strokeWidth="0.8" />
      ))}
      <path d={band(0.22)} fill="none" stroke="#0f5c45" strokeWidth="2.2" strokeLinecap="round" />
      <path d={band(0.4)} fill="none" stroke="#0f5c45" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <rect x="116" y="38" width="10" height="24" rx="2" fill="#0f5c45" />
      <path d="M125 38 C150 37 152 63 125 62 Z" fill="url(#ss-cork)" stroke="#bfae8f" strokeWidth="0.8" />
    </svg>
  );
}
