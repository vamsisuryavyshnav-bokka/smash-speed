"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/#intro", label: "Why speed" },
  { href: "/#how", label: "How it works" },
  { href: "/#report", label: "The report" },
  { href: "/#about", label: "About" },
  { href: "/history", label: "History" },
];

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
        <circle cx="11" cy="11" r="10.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 15.5 L15.5 5.5" stroke="#0f5c45" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="15.5" cy="5.5" r="2.4" fill="#0f5c45" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em]">
        Smash<span className="text-muted font-normal"> Speed</span>
      </span>
    </span>
  );
}

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`no-print sticky top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ${
        scrolled || open ? "border-b border-line bg-paper/85 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <nav className="container-page flex h-16 items-center justify-between" aria-label="Main">
        <Link href="/" aria-label="Smash Speed home">
          <Wordmark />
        </Link>
        <ul className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="text-[13.5px] text-ink-2 transition-colors hover:text-ink">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link href="/#analyze" className="btn btn-primary btn-sm">
            Analyze
          </Link>
          <button
            className="btn btn-ghost btn-sm lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </nav>
      {open && (
        <ul id="mobile-nav" className="container-page grid gap-1 pb-4 lg:hidden">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-1 py-2.5 text-[15px] text-ink-2">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}
