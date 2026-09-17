export type CaptureStatus = "capturing" | "ready" | "failed";

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
