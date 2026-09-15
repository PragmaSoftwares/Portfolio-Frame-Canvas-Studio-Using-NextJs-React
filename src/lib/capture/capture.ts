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

// Best-effort selectors for common cookie-consent banners — the known,
// finite set of mainstream consent-management platforms, plus generic
// accept/dismiss text. This can never cover a bespoke/one-off promo popup
// (there's no shared pattern to hook onto for those) — that's what
// Assisted Setup (saved storageState, see assistedSetup.ts) is for.
// Missing matches are ignored; a matched-but-unclickable one just moves on.
const COOKIE_BANNER_SELECTORS = [
  // Generic text, broadened beyond just "accept"
  "text=/accept all/i",
  "text=/accept cookies/i",
  "text=/i agree/i",
  "text=/allow all/i",
  "text=/^got it$/i",
  "text=/^ok$/i",
  "text=/^i accept$/i",
  "button[aria-label*='Accept' i]",
  // OneTrust
  "#onetrust-accept-btn-handler",
  // Cookiebot / Usercentrics — Playwright's CSS engine pierces open shadow
  // roots automatically (Usercentrics renders its UI inside one), no special
  // shadow-piercing syntax needed — confirmed live against cytoskeleton.com.
  "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
  "#usercentrics-cmp-ui button[data-action='accept']",
  // Quantcast Choice
  ".qc-cmp2-summary-buttons button[mode='primary']",
  // TrustArc
  "#truste-consent-button",
  // Didomi
  "#didomi-notice-agree-button",
  // Osano
  ".osano-cm-accept-all",
  // CookieYes
  ".cky-btn-accept",
  // Complianz
  ".cmplz-accept",
  // Iubenda
  ".iubenda-cs-accept-btn",
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

// Bot/CAPTCHA challenges (Cloudflare Turnstile, hCaptcha, reCAPTCHA, and
// Cloudflare's classic "Just a moment..." interstitial). These are actively
// designed to detect and block automation, not dismiss like a cookie banner
// — clicking through them isn't a reliable option (see docs/DEV_GUIDE.md).
// Detected, not clicked: capture fails honestly instead of screenshotting
// the challenge page or silently proceeding.
const BOT_CHALLENGE_SELECTORS = [
  "iframe[src*='challenges.cloudflare.com']",
  "iframe[src*='hcaptcha.com']",
  "iframe[src*='recaptcha']",
  "#challenge-running",
  "#cf-challenge-running",
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

  // Checked once, early — a bot/CAPTCHA challenge (unlike a cookie banner)
  // is actively trying to detect and block automation, not something to
  // click through. Fail honestly rather than screenshotting the challenge
  // page or attempting to defeat it. See docs/DEV_GUIDE.md for why this
  // isn't handled the same way as cookie/promo popups.
  for (const selector of BOT_CHALLENGE_SELECTORS) {
    try {
      if (await page.locator(selector).first().isVisible({ timeout: 500 })) {
        throw new CaptureError(
          "blocked",
          "This page uses bot/CAPTCHA protection (e.g. Cloudflare Turnstile) that couldn't be captured automatically. Run Assisted Setup for this project — solving it there once may let capture through for a while."
        );
      }
    } catch (err) {
      if (err instanceof CaptureError) throw err;
      // Selector not present — ignore and check the next one.
    }
  }

  await dismissOverlays(page);

  // Scroll through once to trigger lazy-loaded content (this is also when a
  // scroll-triggered promo popup actually appears — see docs/DEV_GUIDE.md),
  // then return to the top.
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

  // Run again — a popup born during the scroll-through (the common case for
  // "don't show this again"-style promo banners) wouldn't have existed for
  // the first pass above.
  await dismissOverlays(page);
}

/**
 * Best-effort dismissal of cookie-consent banners (known CMPs + generic
 * text) and hiding of chat widgets. Called at more than one point in the
 * page lifecycle (see preparePage) since a banner's own appearance timing
 * varies by site — some show immediately, some only after a scroll. Cannot
 * cover a bespoke/one-off promo popup with no shared pattern to match on;
 * that's what Assisted Setup's saved storageState is for.
 */
async function dismissOverlays(page: Page): Promise<void> {
  for (const selector of COOKIE_BANNER_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1_000 })) {
        // A longer click timeout than the visibility check — a banner that's
        // just become visible may still be mid-transition for another
        // second or two, and Playwright won't commit to a click until the
        // element is "stable" (not actively animating). A too-short timeout
        // here found-but-couldn't-click a real, working button on a real
        // site (Cookiebot/Usercentrics on cytoskeleton.com) during testing.
        await locator.click({ timeout: 4_000 });
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
 *
 * `storageStatePath`, when given, seeds the context with cookies/localStorage
 * saved from a prior Assisted Setup session (see assistedSetup.ts) — a site
 * that already "sees" a returning, already-consented visitor typically won't
 * show its cookie/promo banner at all, sidestepping the dismiss-it problem
 * entirely rather than trying to detect and click it.
 */
export async function captureAllDevices(url: string, storageStatePath?: string): Promise<CaptureAllResult> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: "en-US",
    timezoneId: "America/New_York",
    colorScheme: "light",
    ...(storageStatePath ? { storageState: storageStatePath } : {}),
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
