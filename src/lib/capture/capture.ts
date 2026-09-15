import type { BrowserContext, Page } from "playwright";
import { getBrowser } from "./browser";
import { CaptureError } from "./errors";

export interface Viewport {
  width: number;
  height: number;
}

export const DESKTOP_VIEWPORT: Viewport = { width: 1440, height: 1000 };
// The single most common real-world laptop screen resolution (per StatCounter)
// — deliberately narrower than DESKTOP_VIEWPORT so it can actually land on a
// different responsive breakpoint than the desktop capture, not just crop to
// a different aspect ratio of the same rendered layout.
export const LAPTOP_VIEWPORT: Viewport = { width: 1366, height: 768 };
export const TABLET_VIEWPORT: Viewport = { width: 768, height: 1024 };
export const MOBILE_VIEWPORT: Viewport = { width: 390, height: 844 };

const NAVIGATION_TIMEOUT_MS = 30_000;

// Best-effort selectors for common cookie-consent banners. Missing matches are ignored.
const COOKIE_BANNER_SELECTORS = [
  "text=/accept all/i",
  "text=/accept cookies/i",
  "text=/i agree/i",
  "text=/allow all/i",
  "#onetrust-accept-btn-handler",
  "button[aria-label*='Accept' i]",
];

// Common chat-widget containers, hidden (not removed) so layout doesn't shift.
const CHAT_WIDGET_SELECTORS = [
  "iframe[title*='chat' i]",
  "iframe[title*='Intercom' i]",
  "#intercom-container",
  ".crisp-client",
  "#drift-widget",
  "[id^='hubspot-messages-iframe-container']",
];

async function preparePage(page: Page, url: string): Promise<void> {
  let response;
  try {
    response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Timeout")) {
      throw new CaptureError("timeout", message);
    }
    throw new CaptureError("unavailable", message);
  }

  if (!response) {
    throw new CaptureError("unavailable", "No response received from the server.");
  }

  const status = response.status();
  if (status >= 400) {
    throw new CaptureError("unavailable", `Server responded with status ${status}.`);
  }

  const requestedHost = new URL(url).hostname;
  const finalHost = new URL(page.url()).hostname;
  if (requestedHost !== finalHost) {
    // Not fatal for Phase 1 — we still capture the destination page — but recorded for future warnings.
    console.warn(`Capture redirected from ${requestedHost} to ${finalHost}`);
  }

  // Disable CSS animations/transitions so screenshots are stable.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }`,
  });

  try {
    await page.waitForLoadState("networkidle", { timeout: 8_000 });
  } catch {
    // Non-fatal: some sites never go idle (polling, websockets). Continue anyway.
  }

  try {
    await page.evaluate(() => document.fonts.ready);
  } catch {
    // Non-fatal.
  }

  for (const selector of COOKIE_BANNER_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1_000 })) {
        await locator.click({ timeout: 1_000 });
        await page.waitForTimeout(300);
        break;
      }
    } catch {
      // Selector not present or not clickable — ignore and try the next one.
    }
  }

  for (const selector of CHAT_WIDGET_SELECTORS) {
    try {
      await page.locator(selector).evaluateAll((nodes) =>
        nodes.forEach((node) => {
          (node as HTMLElement).style.setProperty("display", "none", "important");
        })
      );
    } catch {
      // Ignore missing widgets.
    }
  }

  // Scroll through once to trigger lazy-loaded content, then return to the top.
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const scrollHeight = document.body.scrollHeight;
    for (let y = 0; y < scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
}

export interface DeviceCaptureBuffers {
  viewport: Buffer;
  fullPage: Buffer;
}

export interface CaptureAllResult {
  desktop: DeviceCaptureBuffers;
  laptop: DeviceCaptureBuffers;
  tablet: DeviceCaptureBuffers;
  mobile: DeviceCaptureBuffers;
}

async function captureDevice(context: BrowserContext, url: string, viewport: Viewport): Promise<DeviceCaptureBuffers> {
  const page = await context.newPage();
  try {
    await page.setViewportSize(viewport);
    await preparePage(page, url);
    const viewportShot = await page.screenshot({ type: "png" });
    const fullPageShot = await page.screenshot({ type: "png", fullPage: true });
    return { viewport: viewportShot, fullPage: fullPageShot };
  } finally {
    await page.close();
  }
}

/**
 * Captures desktop, laptop, tablet, and mobile screenshots of a single URL,
 * each as both a visible-viewport shot and a full-page shot (section 8 of
 * the plan). Devices are captured sequentially, in one browser context, with
 * a consistent locale, timezone, and light colour scheme for reproducible
 * output.
 */
export async function captureAllDevices(url: string): Promise<CaptureAllResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
  });

  try {
    const desktop = await captureDevice(context, url, DESKTOP_VIEWPORT);
    const laptop = await captureDevice(context, url, LAPTOP_VIEWPORT);
    const tablet = await captureDevice(context, url, TABLET_VIEWPORT);
    const mobile = await captureDevice(context, url, MOBILE_VIEWPORT);
    return { desktop, laptop, tablet, mobile };
  } finally {
    await context.close();
  }
}
