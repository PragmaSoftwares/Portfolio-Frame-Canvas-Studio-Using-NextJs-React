// Shown instantly by a route's loading.tsx while the server renders the next
// page. These pages are all server-rendered on demand (they read live data
// from disk), so without a loading state Next keeps showing the old page
// until the new one is fully ready — which looks like a click that did
// nothing, so people click again.
export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">
      <span className="mr-3 inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-indigo-400" />
      {label}
    </div>
  );
}
