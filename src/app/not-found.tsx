import Link from "next/link";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

/**
 * The app-wide 404 — catches any unmatched route or notFound() call
 * anywhere (a deleted project, a bad board id, a mistyped URL). Next.js
 * otherwise falls back to its own bare, unstyled default here, which would
 * be the one place left where the app looks broken instead of just wrong.
 */
export default function NotFound() {
  return (
    <>
      <AppHeader />
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 px-6 text-center text-slate-100">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-48 left-1/2 h-140 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-transparent blur-3xl"
        />
        <div className="relative space-y-4">
          <p className="text-gradient-accent text-sm font-semibold uppercase tracking-wide">404</p>
          <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
          <p className="mx-auto max-w-md text-sm text-slate-400">
            Whatever you were looking for isn&apos;t here — it may have been deleted, or the link might be off.
          </p>
          <Link
            href="/"
            className="bg-gradient-accent glow-accent inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
      <AppFooter />
    </>
  );
}
