import { Analyzer } from "@/components/analyzer/Analyzer";
import { About, Footer } from "@/components/landing/About";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Intro } from "@/components/landing/Intro";
import { Nav } from "@/components/landing/Nav";
import { ReportSection } from "@/components/landing/ReportSection";
import { RevealObserver } from "@/components/landing/RevealObserver";
import { ShuttleFlight } from "@/components/landing/ShuttleFlight";

export default function Home() {
  return (
    <>
      <Nav />
      <main className="relative">
        <Hero />
        <Intro />
        <HowItWorks />
        <section id="analyze" className="scroll-mt-16 border-t border-line bg-paper-2/50 py-24 md:py-32">
          <div className="container-page grid gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4" data-reveal>
              <p className="eyebrow mb-6">Analyzer</p>
              <h2 className="display relative text-[clamp(38px,5vw,64px)]">
                Measure your <em className="text-accent">smash.</em>
                <span data-shuttle-anchor="analyze" className="absolute -top-8 right-6 hidden h-px w-px lg:block" aria-hidden />
              </h2>
              <div className="mt-8 grid gap-4 text-[14.5px] leading-[1.65] text-ink-2">
                <p className="font-medium text-ink">For a reliable result</p>
                <ul className="grid gap-2.5 text-muted">
                  <li>— Record in slow motion: 240 fps is ideal, 120 fps is the minimum.</li>
                  <li>— Put the phone on a tripod, side-on to the smash, about 6–10 m away.</li>
                  <li>— Keep the net post or a court line in view for calibration.</li>
                  <li>— Good lighting and a plain background help detection.</li>
                </ul>
              </div>
            </div>
            <div className="lg:col-span-8">
              <Analyzer />
            </div>
          </div>
        </section>
        <ReportSection />
        <About />
        <ShuttleFlight />
      </main>
      <Footer />
      <RevealObserver />
    </>
  );
}
