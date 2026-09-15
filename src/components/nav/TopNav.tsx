import Link from "next/link";

export function TopNav() {
  return (
    <nav className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/60 p-1 text-sm text-slate-400">
      <Link href="/" className="rounded-full px-3 py-1.5 transition hover:bg-slate-800 hover:text-slate-100">
        Dashboard
      </Link>
      <Link href="/settings" className="rounded-full px-3 py-1.5 transition hover:bg-slate-800 hover:text-slate-100">
        Agency settings
      </Link>
    </nav>
  );
}
