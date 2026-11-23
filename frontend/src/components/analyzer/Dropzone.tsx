"use client";

import { useRef, useState } from "react";
import { ACCEPTED_EXT, MAX_UPLOAD_MB } from "@/lib/api";

export function validateFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXT.includes(ext)) return `“${f.name}” isn't a supported video. Use MP4, MOV or M4V.`;
  if (f.size > MAX_UPLOAD_MB * 1024 * 1024)
    return `This file is ${(f.size / 1024 / 1024).toFixed(0)} MB; the limit is ${MAX_UPLOAD_MB} MB. Trim it to the smash first.`;
  if (f.size === 0) return "This file is empty.";
  return null;
}

export function Dropzone({ onFile, error }: { onFile: (f: File) => void; error?: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-describedby="dz-help"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.current?.click())}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`group relative grid min-h-[300px] cursor-pointer place-items-center rounded-[18px] border border-dashed px-6 py-14 text-center transition-colors duration-300 ${
          over ? "border-accent bg-accent-soft/60" : "border-line-strong bg-surface hover:border-ink-2"
        }`}
      >
        <div>
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-line bg-paper transition-transform duration-500 group-hover:-translate-y-0.5">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 16V4m0 0-5 5m5-5 5 5M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="mt-6 text-[17px] font-medium tracking-[-0.01em]">Drop your smash video here</p>
          <p className="mt-1.5 text-[14px] text-muted">
            or <span className="text-ink underline decoration-line-strong underline-offset-4">browse files</span>
          </p>
          <p id="dz-help" className="mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
            MP4 · MOV · M4V — up to {MAX_UPLOAD_MB} MB
          </p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".mp4,.mov,.m4v,video/mp4,video/quicktime,video/x-m4v"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-[14px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
