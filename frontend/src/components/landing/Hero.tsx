import Image from "next/image";
import Link from "next/link";
import heroImg from "../../../public/images/hero-player.jpg";

/* The photograph sits in a fixed-aspect box so the shuttle anchor (placed just
   above the racket) lines up with the picture at every size. Masks dissolve the
   dark arena into the paper background on the left and bottom edges. */
const mask =
  "linear-gradient(to right, transparent 0%, #000 34%), linear-gradient(to top, transparent 0%, #000 26%), linear-gradient(to bottom, transparent 0%, #000 12%)";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden md:min-h-[min(860px,calc(100svh-64px))]" aria-labelledby="hero-title">
      <div
        className="relative mx-auto aspect-[1360/1273] w-full max-w-[640px] md:absolute md:right-0 md:top-0 md:h-full md:w-auto md:max-w-none"
        style={{ WebkitMaskImage: mask, maskImage: mask, WebkitMaskComposite: "source-in", maskComposite: "intersect" }}
      >
        <Image
          src={heroImg}
          alt="A badminton player leaping into a jump smash on an indoor court"
          fill
          priority
          sizes="(min-width: 768px) 60vw, 100vw"
          className="object-cover"
          placeholder="blur"
        />
        {/* tint toward paper so the dark arena reads as a soft editorial print */}
        <div className="absolute inset-0 bg-paper/10 mix-blend-soft-light" />
        <div data-shuttle-anchor="hero" className="absolute left-[44%] top-[11.5%] h-px w-px" />
      </div>

      <div className="container-page relative">
        <div className="max-w-[560px] pb-14 pt-6 md:pb-28 md:pt-[min(16vh,150px)]">
          <p className="eyebrow mb-7 flex items-center gap-3">
            <span className="inline-block h-px w-8 bg-line-strong" />
            Badminton smash analysis
          </p>
          <h1 id="hero-title" className="display text-[clamp(52px,8.4vw,112px)] text-ink">
            Every smash <br />
            has a <em className="text-accent">number.</em>
          </h1>
          <p className="mt-8 max-w-[440px] text-[17px] leading-[1.6] text-ink-2">
            Upload a slow-motion clip of your smash. Smash Speed finds the shuttlecock, follows it frame by frame and
            measures how fast it really left your racket — with the working shown.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/#analyze" className="btn btn-primary">
              Analyze your smash
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </Link>
            <Link href="/#how" className="btn btn-ghost">
              How it works
            </Link>
          </div>
          <dl className="mt-14 grid max-w-[460px] grid-cols-3 gap-6 border-t border-line pt-6">
            {[
              ["240", "fps slow-motion ready"],
              ["3", "speeds: contact, peak, average"],
              ["95%", "confidence interval on every result"],
            ].map(([k, v]) => (
              <div key={v}>
                <dt className="display tnum text-[32px] text-ink">{k}</dt>
                <dd className="mt-1 text-[12.5px] leading-snug text-muted">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <p className="absolute bottom-3 right-5 hidden text-[10.5px] text-faint md:block">
        Photo: Muktasim Azlan / Unsplash
      </p>
    </section>
  );
}
