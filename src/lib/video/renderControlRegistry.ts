/**
 * Two small pieces of in-memory, per-process state for an in-flight scroll
 * video render, kept separate from lib/capture/cancelRegistry.ts's
 * AbortControllers:
 *
 * - `queueKey` is the synthetic "page slug" a scroll video render registers
 *   under in cancelRegistry.ts/globalQueue.ts (those two are shared as-is
 *   with captures — see render/route.ts). Centralized here so the render
 *   route and the cancel route agree on the exact same string without
 *   importing from each other.
 * - The force-kill registry hands a direct "kill the ffmpeg child process
 *   right now" function up from inside renderScrollVideo.ts (the only place
 *   that actually holds the spawned process) to the Cancel API route. This
 *   has to be separate from the AbortController: aborting a signal is a
 *   one-shot action, but Cancel needs two distinct strengths — the first
 *   click asks ffmpeg to stop gracefully so it still finalizes a valid,
 *   playable file from whatever it had already encoded (see
 *   renderScrollVideo.ts's gracefulStop), while a second click (e.g. the
 *   user clicking "Force stop" because it's stuck "stopping") needs to kill
 *   it outright, independent of whether the graceful attempt ever resolves.
 */
const forceKillRegistry = new Map<string, () => void>();

export function queueKey(videoId: string): string {
  return `video:${videoId}`;
}

export function registerRenderControl(videoId: string, forceKill: () => void): void {
  forceKillRegistry.set(videoId, forceKill);
}

export function unregisterRenderControl(videoId: string): void {
  forceKillRegistry.delete(videoId);
}

/** Returns true if an in-flight render was found and told to stop immediately. */
export function forceKillRender(videoId: string): boolean {
  const forceKill = forceKillRegistry.get(videoId);
  if (!forceKill) return false;
  forceKill();
  return true;
}
