import Link from "next/link";
import { Wordmark } from "./Nav";

export function About() {
  return (
    <section id="about" className="scroll-mt-16 py-24 md:py-36">
      <div className="container-page grid gap-16 md:grid-cols-12">
        <div className="md:col-span-5" data-reveal>
          <p className="eyebrow mb-6">About</p>
          <h2 className="display text-[clamp(38px,5vw,64px)]">
            Sports science, <em className="text-muted">without the lab.</em>
          </h2>
        </div>
        <div className="grid gap-8 text-[16px] leading-[1.7] text-ink-2 md:col-span-6 md:col-start-7" data-reveal>
          <p>
            Smash Speed began with a simple question every badminton player asks — <em>how fast was that?</em> — and a
            belief that the answer should be honest. The project combines computer vision with the physics of shuttle
            flight so that a single phone camera can produce a measurement with stated uncertainty.
          </p>
          <p>
            The vision is a personal performance record: smash speed tracked over months, compared across rackets and
            techniques, and understood rather than guessed.
          </p>
          <div className="card p-6 text-[14.5px]">
            <p className="font-medium text-ink">Current limits, stated plainly</p>
            <ul className="mt-3 grid gap-2 text-muted">
              <li>— One camera sees motion across the frame, not towards it. Film side-on.</li>
              <li>— Below about 100 frames per second a smash cannot be measured reliably.</li>
              <li>— A court reference must be marked once per clip to convert pixels to metres.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="no-print border-t border-line bg-paper-2/60">
      <div className="container-page grid gap-12 py-16 md:grid-cols-12">
        <div className="md:col-span-5">
          <Wordmark />
          <p className="mt-5 max-w-[340px] text-[14px] leading-[1.65] text-muted">
            Badminton smash speed analysis from slow-motion video: shuttle detection, tracking and drag-model physics.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-8 text-[14px] md:col-span-4 md:col-start-7" aria-label="Footer">
          <ul className="grid gap-2.5">
            <li className="eyebrow mb-1">Product</li>
            <li><Link href="/#analyze" className="text-ink-2 hover:text-ink">Analyzer</Link></li>
            <li><Link href="/history" className="text-ink-2 hover:text-ink">History</Link></li>
            <li><Link href="/#report" className="text-ink-2 hover:text-ink">The report</Link></li>
          </ul>
          <ul className="grid gap-2.5">
            <li className="eyebrow mb-1">Project</li>
            <li><Link href="/#how" className="text-ink-2 hover:text-ink">How it works</Link></li>
            <li><Link href="/#about" className="text-ink-2 hover:text-ink">About</Link></li>
            <li><Link href="/#intro" className="text-ink-2 hover:text-ink">Why speed</Link></li>
          </ul>
        </nav>
        <div className="text-[13px] text-muted md:col-span-3 md:text-right">
          <p className="text-ink">Created by Vyshnav</p>
          <p className="mt-2">Hero photo: Muktasim Azlan on Unsplash</p>
          <p className="mt-2">© {new Date().getFullYear()} Smash Speed</p>
        </div>
      </div>
    </footer>
  );
}
