"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Nav } from "@/components/landing/Nav";
import { ProgressView } from "@/components/results/ProgressView";
import { ResultsDashboard } from "@/components/results/ResultsDashboard";
import { api, type Analysis } from "@/lib/api";

export default function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [a, setA] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api.getAnalysis(id);
        if (stop) return;
        setA(next);
        setError(null);
        const proxyPending = next.status === "done" && next.upload && ["pending", "processing"].includes(next.upload.proxy_status);
        if (next.status === "queued" || next.status === "running" || proxyPending) timer = setTimeout(poll, proxyPending ? 1500 : 500);
      } catch (e) {
        if (stop) return;
        setError((e as Error).message);
        timer = setTimeout(poll, 3000);
      }
    };
    poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [id]);

  return (
    <>
      <Nav />
      <main className="container-page min-h-[80vh] py-12 md:py-16">
        {error && !a && (
          <div className="card mx-auto max-w-[640px] p-10">
            <p className="eyebrow text-danger">Can&apos;t load analysis</p>
            <p className="mt-3 text-[15px] text-ink-2">{error}</p>
          </div>
        )}
        {!a && !error && <p className="text-center text-[14px] text-muted">Loading…</p>}
        {a && (a.status === "queued" || a.status === "running") && <ProgressView a={a} />}
        {a?.status === "failed" && (
          <div className="card mx-auto max-w-[680px] p-10">
            <p className="eyebrow text-danger">Analysis stopped</p>
            <h1 className="display mt-3 text-[44px]">Something prevented this analysis</h1>
            <p className="mt-4 text-[15px] leading-[1.6] text-ink-2">{a.error}</p>
            <Link href="/#analyze" className="btn btn-primary mt-8">Try another video</Link>
          </div>
        )}
        {a?.status === "done" && a.result && <ResultsDashboard a={a} result={a.result} />}
      </main>
    </>
  );
}
