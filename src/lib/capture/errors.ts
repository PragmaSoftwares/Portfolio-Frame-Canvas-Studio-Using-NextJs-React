export type CaptureErrorReason =
  | "unavailable"
  | "timeout"
  | "blocked"
  | "redirected"
  | "unknown";

export class CaptureError extends Error {
  reason: CaptureErrorReason;

  constructor(reason: CaptureErrorReason, message: string) {
    super(message);
    this.name = "CaptureError";
    this.reason = reason;
  }
}

const FRIENDLY_MESSAGES: Record<CaptureErrorReason, string> = {
  unavailable: "The website couldn't be reached. Check the URL and try again.",
  timeout: "The website took too long to respond. It may be slow or unresponsive right now.",
  blocked: "The website blocked the automated browser from loading the page.",
  redirected: "The page redirected to a different domain than the one requested.",
  unknown: "Something went wrong while capturing this website.",
};

export function friendlyCaptureMessage(err: unknown): string {
  if (err instanceof CaptureError) return FRIENDLY_MESSAGES[err.reason];
  return FRIENDLY_MESSAGES.unknown;
}
