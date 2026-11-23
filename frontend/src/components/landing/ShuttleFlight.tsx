"use client";

/* Signature scroll-controlled shuttlecock.

   The shuttle is absolutely positioned in *document* coordinates and its state is
   a pure function of scrollY, interpolated between keyframes that are measured
   from real anchor elements ([data-shuttle-anchor]). Consequences:
     - at rest it is stationary, glued to the hero like any other content;
     - scrolling backwards replays the flight exactly in reverse;
     - only transform/opacity change, in one rAF per scroll frame.
   Desktop: rest -> fade -> fly right and exit -> re-enter along the How-it-works
   rail -> land beside the analyzer. Small screens: rest -> fade -> exit.
   Reduced motion: stays at rest in the hero. */

import { useEffect, useRef } from "react";
import { Shuttle } from "./Shuttle";

type Key = { s: number; x: number; y: number; r: number; o: number; k: number };

const W = 112; // rendered width (px) at scale 1
const H = W * (100 / 160);

function anchor(name: string) {
  const el = document.querySelector<HTMLElement>(`[data-shuttle-anchor="${name}"]`);
  if (!el) return null;
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2 + window.scrollX, y: b.top + b.height / 2 + window.scrollY, el };
}

function buildKeys(): Key[] {
  const vh = window.innerHeight;
  const vw = document.documentElement.clientWidth;
  const hero = anchor("hero");
  if (!hero) return [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Size the resting shuttle to the photograph so it stays in proportion with the player.
  const photoW = hero.el.parentElement?.getBoundingClientRect().width ?? 900;
  const restK = Math.min(1, Math.max(0.42, photoW / 900));
  const rest: Key = { s: 0, x: hero.x, y: hero.y, r: -28, o: 1, k: restK };
  if (reduced) return [rest];

  const keys: Key[] = [rest];
  const push = (k: Key) => {
    const prev = keys[keys.length - 1];
    keys.push({ ...k, s: Math.max(k.s, prev.s + 1) });
  };
  // 1. Fade while still resting in the hero.
  push({ ...rest, s: vh * 0.18, o: 0.38, r: -24 });
  // 2. Drift right on a rising arc, then exit the viewport.
  push({ s: vh * 0.45, x: hero.x + (vw - hero.x) * 0.55, y: vh * 0.45 + vh * 0.2, r: -6, o: 0.42, k: restK * 0.95 });
  push({ s: vh * 0.75, x: vw + W * 1.4, y: vh * 0.75 + vh * 0.16, r: 14, o: 0.42, k: restK * 0.9 });

  const small = vw < 900;
  const steps = [1, 2, 3, 4].map((i) => anchor(`step-${i}`)).filter(Boolean) as NonNullable<ReturnType<typeof anchor>>[];
  const land = anchor("analyze");
  if (small || steps.length < 4) {
    push({ s: vh * 0.76, x: vw + W * 1.4, y: vh * 0.76 + vh * 0.16, r: 14, o: 0, k: 0.9 });
    return keys;
  }
  // 3. Wait off-screen, then swap sides (invisible) and fly in along the step rail.
  const enter = steps[0].y - vh * 0.95;
  push({ s: enter, x: vw + W * 1.4, y: enter + vh * 0.3, r: 14, o: 0, k: 0.8 });
  push({ s: enter + 1, x: -W * 1.4, y: enter + vh * 0.25, r: 30, o: 0, k: 0.7 });
  steps.forEach((a, i) => {
    push({ s: a.y - vh * 0.55, x: a.x, y: a.y, r: 90 + (i % 2 ? -6 : 6), o: 1, k: 0.62 });
  });
  // 4. Land next to the analyzer heading.
  if (land) push({ s: land.y - vh * 0.5, x: land.x, y: land.y, r: -18, o: 1, k: 0.8 });
  return keys;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function sample(keys: Key[], s: number): Key {
  if (s <= keys[0].s) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (s <= b.s) {
      const t = ease((s - a.s) / (b.s - a.s));
      const m = (p: keyof Key) => a[p] + (b[p] - a[p]) * t;
      return { s, x: m("x"), y: m("y"), r: m("r"), o: m("o"), k: m("k") };
    }
  }
  return keys[keys.length - 1];
}

export function ShuttleFlight() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let keys: Key[] = [];
    let raf = 0;

    const render = () => {
      raf = 0;
      if (!keys.length) return;
      const k = sample(keys, window.scrollY);
      el.style.transform = `translate3d(${k.x - W / 2}px, ${k.y - H / 2}px, 0) rotate(${k.r}deg) scale(${k.k})`;
      el.style.opacity = String(k.o);
      el.style.visibility = k.o < 0.01 ? "hidden" : "visible";
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };
    const rebuild = () => {
      keys = buildKeys();
      render();
    };

    rebuild();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", rebuild);
    window.addEventListener("load", rebuild);
    document.fonts?.ready.then(rebuild);
    const ro = new ResizeObserver(rebuild);
    ro.observe(document.body);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", rebuild);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", rebuild);
      window.removeEventListener("load", rebuild);
      ro.disconnect();
      mq.removeEventListener("change", rebuild);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30 origin-center will-change-transform"
      style={{ width: W, height: H, opacity: 0, filter: "drop-shadow(0 10px 14px rgb(20 20 18 / 0.18))" }}
    >
      <Shuttle className="h-full w-full" />
    </div>
  );
}
