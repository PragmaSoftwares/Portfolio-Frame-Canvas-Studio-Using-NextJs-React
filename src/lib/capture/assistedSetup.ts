import fs from "node:fs/promises";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { projectConsentStatePath } from "../storage/paths";

/**
 * A one-time, real (visible, not headless) browser session the user
 * interacts with directly — clicking through a cookie banner, a promo
 * popup, a Cloudflare Turnstile checkbox, whatever's actually on the page
 * — so the resulting cookies/localStorage can be saved and reused by every
 * later automated capture for that project. This sidesteps the fundamental
 * problem with trying to auto-detect and auto-click popups (there's no
 * bounded list of "every possible popup a site could show"): a real human
 * does the one-off recognition instead, once, and the automated path never
 * has to.
 *
 * Deliberately its own dedicated `chromium.launch({ headless: false })`
 * instance per session, separate from the shared headless singleton in
 * browser.ts used for real captures — headless-vs-headed is chosen at
 * launch time for the whole browser process, and a visible window has no
 * place mixed into that shared automation-only browser. Closed fully when
 * the session ends (finished or cancelled), not kept running.
 *
 * Session state is in-memory only (a single Node process, matching this
 * app's local-first, single-user design) — it does not survive a server
 * restart. A safety timeout auto-closes an abandoned session so a forgotten
 * browser window doesn't leak a Chromium process indefinitely.
 */

interface AssistedSetupSession {
  browser: Browser;
  context: BrowserContext;
  startedAt: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const sessions = new Map<string, AssistedSetupSession>();

export interface AssistedSetupStatus {
  active: boolean;
  startedAt?: string;
}

export function getAssistedSetupStatus(projectId: string): AssistedSetupStatus {
  const session = sessions.get(projectId);
  return session ? { active: true, startedAt: session.startedAt } : { active: false };
}

async function cleanupSession(projectId: string): Promise<void> {
  const session = sessions.get(projectId);
  if (!session) return;
  sessions.delete(projectId);
  clearTimeout(session.timeoutHandle);
  try {
    await session.browser.close();
  } catch {
    // Already closed (e.g. the user closed the window themselves) — fine.
  }
}

/**
 * Opens a real, visible browser window on this machine, navigated to the
 * project's URL. Idempotent — calling it again while a session is already
 * active for this project just returns that session's existing status
 * rather than opening a second window.
 */
export async function startAssistedSetup(projectId: string, url: string): Promise<AssistedSetupStatus> {
  const existing = sessions.get(projectId);
  if (existing) return { active: true, startedAt: existing.startedAt };

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
  });
  const page = await context.newPage();

  const startedAt = new Date().toISOString();
  const timeoutHandle = setTimeout(() => {
    cleanupSession(projectId);
  }, SESSION_TIMEOUT_MS);

  // If the user closes the window themselves (instead of clicking "Done —
  // Save" in the dashboard), the browser process disconnects — by then it's
  // too late to read its storageState, so this is cleanup only (clears the
  // stale in-memory entry so status/UI don't think a session is still
  // open), not a save. The UI copy is explicit that closing the window
  // without clicking Done discards the session, same as Cancel.
  browser.on("disconnected", () => {
    sessions.delete(projectId);
    clearTimeout(timeoutHandle);
  });

  sessions.set(projectId, { browser, context, startedAt, timeoutHandle });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch {
    // Non-fatal — the window is open either way; the user can navigate
    // manually if the initial load failed (slow site, redirect, etc.).
  }

  return { active: true, startedAt };
}

/**
 * Snapshots the session's cookies/localStorage and saves them for reuse by
 * future automated captures of this project, then closes the window.
 * Returns null if no session is currently open for this project.
 */
export async function finishAssistedSetup(projectId: string): Promise<{ savedAt: string } | null> {
  const session = sessions.get(projectId);
  if (!session) return null;

  const state = await session.context.storageState();
  await fs.writeFile(projectConsentStatePath(projectId), JSON.stringify(state, null, 2), "utf-8");

  await cleanupSession(projectId);
  return { savedAt: new Date().toISOString() };
}

/** Closes the session without saving anything. Returns false if none was open. */
export async function cancelAssistedSetup(projectId: string): Promise<boolean> {
  const session = sessions.get(projectId);
  if (!session) return false;
  await cleanupSession(projectId);
  return true;
}
