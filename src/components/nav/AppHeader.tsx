import Link from "next/link";
import { TopNav } from "./TopNav";

/**
 * The app-wide top bar — wordmark, primary nav, and "+ New project" — shown
 * on every page except the canvas board editor, which is a focused work
 * surface that shouldn't lose vertical space to chrome it doesn't need.
 * Deliberately lives at the page.tsx (routing) level rather than inside
 * each page's own client component, so "does this page get the header" is
 * a single, centralized decision rather than something every page component
 * has to know about itself.
 */
export function AppHeader() {
  return (
    <div className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur supports-backdrop-filter:bg-slate-950/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-7 w-9 shrink-0 items-center justify-center rounded-md border-2 border-indigo-400/70 bg-slate-900">
            <span className="h-2.5 w-4 rounded-sm bg-linear-to-br from-indigo-400 to-fuchsia-400" />
          </span>
          <span className="text-gradient-accent text-base font-bold tracking-tight">
            Portfolio Frame Canvas Studio
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <TopNav />
          <Link
            href="/projects/new"
            className="bg-gradient-accent glow-accent shrink-0 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
          >
            + New project
          </Link>
        </div>
      </div>
    </div>
  );
}
