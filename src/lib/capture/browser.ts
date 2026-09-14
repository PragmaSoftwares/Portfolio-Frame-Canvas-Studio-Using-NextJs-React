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
