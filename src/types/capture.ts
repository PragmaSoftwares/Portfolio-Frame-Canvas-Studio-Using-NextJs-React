// "cancelled" is distinct from "failed" — it means the capture was
// deliberately stopped (explicit Cancel click, or the connection dropped
// e.g. a page refresh mid-capture), not that something went wrong. Also
// written by readPageCaptureMeta's own staleness check when a "capturing"
// record is older than any real capture could still legitimately be
// running (e.g. the server process itself was restarted mid-capture,
// leaving nothing left to ever finish it) — see lib/storage/captures.ts.
export type CaptureStatus = "capturing" | "ready" | "failed" | "cancelled";

export interface DeviceCaptureFiles {
  fullPage: string; // filename within captures/<device>
  // True when this slot was manually uploaded (see the upload API route)
  // rather than produced by an automated capture — used to warn before a
  // Recapture would silently overwrite it.
  uploaded?: boolean;
}

/** Capture state for one approved page within one project. */
export interface PageCaptureMeta {
  projectId: string;
  pageSlug: string;
  pageUrl: string;
  status: CaptureStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
  // Consecutive automated-capture failures in a row for this page — reset to
  // 0 by any "ready" result (automated or manual upload), left untouched by
  // a "cancelled" result (the user stopped it; the capture path itself
  // didn't actually fail), and incremented by each "failed" one. Lets the UI
  // suggest manual upload once retrying automatically clearly isn't working,
  // without nagging after a single transient failure.
  consecutiveFailures?: number;
  images?: {
    desktop?: DeviceCaptureFiles;
    laptop?: DeviceCaptureFiles;
    tablet?: DeviceCaptureFiles;
    mobile?: DeviceCaptureFiles;
  };
}

export interface ExportMeta {
  projectId: string;
  templateId: string;
  createdAt: string;
  file: string; // filename within the project's exports directory
  width: number;
  height: number;
}
