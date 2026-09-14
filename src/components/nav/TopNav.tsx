import Link from "next/link";

export function TopNav() {
  return (
    <nav className="flex items-center gap-4 text-sm text-slate-400">
      <Link href="/" className="hover:text-slate-200">
        Dashboard
      </Link>
      <Link href="/settings" className="hover:text-slate-200">
        Agency settings
      </Link>
    </nav>
  );
}
