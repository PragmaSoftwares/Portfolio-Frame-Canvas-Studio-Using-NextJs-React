import fs from "node:fs";
import { chromium, type Browser } from "playwright";

let browserPromise: Promise<Browser> | null = null;

/**
 * Lazily launches a single shared Chromium instance for the dev server process.
 * Playwright must only ever run in the Node.js runtime (never Edge) — routes that
 * import this module must set `export const runtime = "nodejs"`.
 */
export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

// A cheap, synchronous existence check — Playwright's own browser binaries
// live at a known, predictable path once `npx playwright install chromium`
// has been run, so this never needs to actually launch anything just to
// find out. Nothing currently checked this before calling getBrowser(),
// which meant a project freshly cloned without that install step would hit
// Playwright's own raw launch error (a long stack trace) the first time
// anyone clicked Capture, Assisted Setup, or Export, instead of a clear
// explanation.
export function isChromiumInstalled(): boolean {
  try {
    return fs.existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

export const CHROMIUM_NOT_INSTALLED_MESSAGE =
  "Chromium isn't installed on this server yet. Run `npx playwright install chromium`, then restart the app.";

// Used specifically where a manual alternative actually exists (automated
// capture, Assisted Setup) — not for export, which always has to render the
// live board composition in a real browser with no manual substitute.
export const CHROMIUM_NOT_INSTALLED_FOR_CAPTURE_MESSAGE =
  `${CHROMIUM_NOT_INSTALLED_MESSAGE} In the meantime, this project can still use manual screenshot upload instead — check the option for it on the project page.`;
