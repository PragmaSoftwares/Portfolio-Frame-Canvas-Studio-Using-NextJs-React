/**
 * In-memory registry of in-flight captures' AbortControllers, keyed by
 * "<projectId>:<pageSlug>" — lets a separate Cancel request reach into an
 * already-running capture and stop it.
 *
 * This exists because `request.signal` on a Node.js-runtime Route Handler
 * in this Next.js version does NOT fire on client disconnect — that's only
 * wired up for the Edge runtime (see the platform's own
 * invoking-entrypoints doc, which shows `signal?: AbortSignal` only in the
 * Edge handler's ctx, not the Node one). Confirmed live: aborting the
 * client fetch had no effect on the server-side Playwright work, which ran
 * to completion regardless. Explicit registration is the only way to reach
 * a specific in-flight capture in this runtime.
 *
 * Deliberately just a module-level Map, not backed by any persistent
 * store — this app is single-process and local-first, and a cancellation
 * only ever needs to reach a capture that's live in THIS process right
 * now. An orphaned "capturing" record left by a dead process (this map
 * included, since it's memory-only) is handled separately by the
 * staleness check in lib/storage/captures.ts.
 */
const registry = new Map<string, AbortController>();

function key(projectId: string, pageSlug: string): string {
  return `${projectId}:${pageSlug}`;
}

/**
 * Registers a new in-flight capture, or returns null if this exact
 * project+page is already being captured — e.g. the same project open in
 * two tabs, both clicking Capture on the same page at nearly the same
 * moment. Without this check, both would run concurrently and race to
 * write the same capture-meta file and the same image files; whichever
 * finished last would silently win. The caller (the API route) is
 * expected to reject the request outright when this returns null, rather
 * than starting a second capture for a key that's already in use.
 */
export function registerCapture(projectId: string, pageSlug: string): AbortController | null {
  const k = key(projectId, pageSlug);
  if (registry.has(k)) return null;
  const controller = new AbortController();
  registry.set(k, controller);
  return controller;
}

export function unregisterCapture(projectId: string, pageSlug: string): void {
  registry.delete(key(projectId, pageSlug));
}

/** Returns true if a matching in-flight capture was found and told to stop. */
export function cancelCapture(projectId: string, pageSlug: string): boolean {
  const controller = registry.get(key(projectId, pageSlug));
  if (!controller) return false;
  controller.abort();
  return true;
}
