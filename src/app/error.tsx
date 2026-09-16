"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

/**
 * The app-wide error boundary — catches any unhandled error thrown while
 * rendering a page. Next.js otherwise falls back to its own bare, unstyled
 * default here, the same gap as the 404 page (see not-found.tsx). Must be
 * a Client Component — that's a Next.js requirement for error.tsx, not a
 * choice.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Logged for whoever's running the dev server — this is a local-first,
    // self-hosted tool, so "check the terminal" is genuinely the next step
    // for its actual audience, not just a placeholder.
    console.error(error);
  }, [error]);

  return (
    <>
      <AppHeader />
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 text-center text-slate-100">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 left-1/2 h-140 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-transparent blur-3xl"
        />
        <div className="relative space-y-4">
          <p className="text-sm font-semibold uppercase tracking-wide text-red-400">Something went wrong</p>
          <h1 className="text-3xl font-semibold tracking-tight">An unexpected error occurred</h1>
          <p className="mx-auto max-w-md text-sm text-slate-400">
            Try again, or head back to the dashboard. If this keeps happening, check the terminal running the dev
            server for the actual error.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => reset()}
              className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-medium transition hover:border-slate-500"
            >
              Try again
            </button>
            <Link
              href="/"
              className="bg-gradient-accent glow-accent rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
      <AppFooter />
    </>
  );
}
