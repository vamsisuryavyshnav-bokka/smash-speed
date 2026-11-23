"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/landing/Nav";
import { api, type HistoryItem } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  ok: "Measured",
  calibration_required: "Needs calibration",
  insufficient_fps: "Frame rate too low",
  no_shuttle: "No smash found",
  implausible: "Implausible",
};

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    api.listAnalyses().then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, []);

  const measured = (items ?? []).filter((i) => i.result_status === "ok");
  const best = measured.reduce<HistoryItem | null>((b, i) => ((i.contact_kmh ?? i.peak_kmh ?? 0) > (b?.contact_kmh ?? b?.peak_kmh ?? 0) ? i : b), null);
  const compare = (items ?? []).filter((i) => picked.includes(i.id));
  const maxV = Math.max(1, ...compare.map((c) => c.contact_kmh ?? c.peak_kmh ?? 0));

  return (
    <>
      <Nav />
      <main className="container-page min-h-[80vh] py-12 md:py-16">
        <p className="eyebrow">History</p>
        <h1 className="display mt-3 text-[clamp(44px,6vw,72px)]">Your smashes</h1>

        {error && <p className="mt-8 rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">{error}</p>}
        {items && items.length === 0 && (
          <div className="card mt-10 p-10 text-center">
            <p className="text-[15px] text-ink-2">No analyses yet.</p>
            <Link href="/#analyze" className="btn btn-primary mt-6">Analyze a smash</Link>
          </div>
        )}

        {items && items.length > 0 && (
          <>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="card p-6"><p className="text-[12.5px] text-muted">Analyses</p><p className="tnum mt-1 text-[28px] font-medium">{items.length}</p></div>
              <div className="card p-6"><p className="text-[12.5px] text-muted">With a measured speed</p><p className="tnum mt-1 text-[28px] font-medium">{measured.length}</p></div>
              <div className="card p-6">
                <p className="text-[12.5px] text-muted">Fastest {best?.contact_kmh ? "(contact)" : "(peak observed)"}</p>
                <p className="tnum mt-1 text-[28px] font-medium">{best ? `${Math.round(best.contact_kmh ?? best.peak_kmh ?? 0)} km/h` : "—"}</p>
              </div>
            </div>

            {compare.length >= 2 && (
              <section className="card mt-6 p-6 md:p-8">
                <h2 className="eyebrow mb-5">Comparison</h2>
                <ul className="grid gap-4">
                  {compare.map((c) => {
                    const v = c.contact_kmh ?? c.peak_kmh ?? 0;
                    return (
                      <li key={c.id} className="grid gap-2 sm:grid-cols-[200px_1fr_90px] sm:items-center">
                        <span className="truncate text-[13.5px]">{c.filename}</span>
                        <span className="h-3 rounded-r-[4px] bg-series-measured" style={{ width: `${(v / maxV) * 100}%` }} />
                        <span className="tnum text-right text-[14px] font-medium">{v ? `${Math.round(v)} km/h` : "—"}</span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-4 text-[12px] text-muted">Contact speed where available, otherwise peak observed speed.</p>
              </section>
            )}

            <div className="card mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[12px] text-muted">
                    <th className="w-10 px-5 py-3 font-normal"><span className="sr-only">Compare</span></th>
                    <th className="py-3 font-normal">Video</th>
                    <th className="font-normal">Date</th>
                    <th className="font-normal">Result</th>
                    <th className="text-right font-normal">Contact</th>
                    <th className="text-right font-normal">Peak obs.</th>
                    <th className="text-right font-normal">Average</th>
                    <th className="px-5 text-right font-normal">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                      <td className="px-5">
                        <input
                          type="checkbox"
                          aria-label={`Compare ${i.filename}`}
                          disabled={i.result_status !== "ok"}
                          checked={picked.includes(i.id)}
                          onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))}
                          className="accent-[var(--color-accent)]"
                        />
                      </td>
                      <td className="max-w-[240px] truncate py-3.5">
                        <Link href={`/analysis/${i.id}`} className="underline decoration-line-strong underline-offset-4 hover:decoration-ink">{i.filename ?? i.id}</Link>
                      </td>
                      <td className="tnum text-muted">{new Date(i.created * 1000).toLocaleDateString()}</td>
                      <td className="text-ink-2">{i.status === "done" ? STATUS_LABEL[i.result_status ?? ""] ?? "—" : i.status}</td>
                      <td className="tnum text-right">{i.contact_kmh ? `${Math.round(i.contact_kmh)}` : "—"}</td>
                      <td className="tnum text-right">{i.peak_kmh ? `${Math.round(i.peak_kmh)}` : "—"}</td>
                      <td className="tnum text-right">{i.avg_kmh ? `${Math.round(i.avg_kmh)}` : "—"}</td>
                      <td className="px-5 text-right font-mono">{i.grade ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-muted">Speeds in km/h. Tick two or more measured analyses to compare them.</p>
          </>
        )}
      </main>
    </>
  );
}
