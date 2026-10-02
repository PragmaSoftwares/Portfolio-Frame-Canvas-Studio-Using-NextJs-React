/**
 * Caps how many captures run at once across the WHOLE server, regardless of
 * which project (or browser tab) they come from. The per-page lock in
 * cancelRegistry.ts only stops the exact same page from double-capturing —
 * nothing otherwise stops many different projects from all capturing
 * simultaneously. Each capture opens its own real Chromium browser context
 * inside the one shared browser process; too many running at once just
 * stacks their CPU/RAM/network cost directly on top of each other on a
 * single server (see capture.ts's MAX_CAPTURE_MS comment for what a single
 * heavy page alone can already do to CPU).
 *
 * A plain FIFO in-memory queue, matching this app's single-process,
 * local-first design — same reasoning as cancelRegistry.ts for why this
 * doesn't need to survive a restart (a request still waiting in it would
 * just be re-sent by the client anyway).
 */
const MAX_CONCURRENT_CAPTURES = 3;

let activeCount = 0;
let nextTicket = 1;
const waiting: number[] = []; // ticket numbers, in FIFO order
const grants = new Map<number, () => void>();
const ticketByKey = new Map<string, number>(); // "<projectId>:<pageSlug>" -> ticket, only while waiting

function key(projectId: string, pageSlug: string): string {
  return `${projectId}:${pageSlug}`;
}

export interface CaptureSlotRequest {
  /** True if a slot was free immediately — no queueing happened. */
  immediate: boolean;
  /** 0-based count of requests ahead of this one. -1 if not queued. */
  position: number;
  /** Resolves once a slot is granted; call the result to release it again. */
  ready: Promise<() => void>;
}

export function requestCaptureSlot(projectId: string, pageSlug: string): CaptureSlotRequest {
  const ticket = nextTicket++;
  let immediate = false;

  const ready = new Promise<() => void>((resolve) => {
    const grant = () => {
      activeCount++;
      ticketByKey.delete(key(projectId, pageSlug));
      resolve(() => releaseCaptureSlot());
    };
    if (activeCount < MAX_CONCURRENT_CAPTURES) {
      immediate = true;
      grant();
    } else {
      waiting.push(ticket);
      grants.set(ticket, grant);
      ticketByKey.set(key(projectId, pageSlug), ticket);
    }
  });

  return { immediate, position: immediate ? -1 : waiting.indexOf(ticket), ready };
}

function releaseCaptureSlot(): void {
  activeCount--;
  const next = waiting.shift();
  if (next === undefined) return;
  const grant = grants.get(next);
  grants.delete(next);
  grant?.();
}

/**
 * Live position for a page still waiting on a slot, or -1 if it isn't
 * (already running, already done, or never queued) — computed fresh each
 * call rather than stored, since it changes as earlier requests finish.
 */
export function currentQueuePosition(projectId: string, pageSlug: string): number {
  const ticket = ticketByKey.get(key(projectId, pageSlug));
  if (ticket === undefined) return -1;
  return waiting.indexOf(ticket);
}

export function activeCaptureCount(): number {
  return activeCount;
}
