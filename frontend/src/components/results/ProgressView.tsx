import type { Analysis } from "@/lib/api";

/* Every value shown here comes from the server's job record: the current stage,
   that stage's own progress fraction and the pipeline's latest status message. */
export function ProgressView({ a }: { a: Analysis }) {
  const keys = a.stages.map((s) => s.key);
  const current = a.stage ? keys.indexOf(a.stage) : -1;
  return (
    <div className="card mx-auto max-w-[720px] p-8 md:p-12" aria-live="polite">
      <p className="eyebrow">{a.status === "queued" ? "Queued" : "Analysing"}</p>
      <h1 className="display mt-3 text-[44px]">
        {a.status === "queued" ? "Waiting for the analysis worker…" : a.stages[current]?.label ?? "Starting…"}
      </h1>
      <div className="mt-8 flex items-baseline justify-between">
        <p className="text-[13.5px] text-muted">{a.message}</p>
        <p className="tnum font-mono text-[13px]">{Math.round(a.progress * 100)}%</p>
      </div>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(a.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${a.progress * 100}%` }} />
      </div>
      <ol className="mt-10 grid gap-0">
        {a.stages.map((s, i) => {
          const done = i < current || a.status === "done";
          const active = i === current && a.status === "running";
          return (
            <li key={s.key} className="flex items-center gap-4 border-t border-line py-3.5 first:border-t-0">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[10px] transition-colors ${
                  done ? "border-accent bg-accent text-paper" : active ? "border-accent text-accent" : "border-line-strong text-faint"
                }`}
                aria-hidden
              >
                {done ? (
                  <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
                ) : active ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={`text-[14.5px] ${done || active ? "text-ink" : "text-faint"}`}>{s.label}</span>
              {active && (
                <span className="tnum ml-auto font-mono text-[12px] text-muted">{Math.round(a.stage_progress * 100)}%</span>
              )}
              <span className="sr-only">{done ? "complete" : active ? "in progress" : "pending"}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
