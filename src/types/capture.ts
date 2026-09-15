export type CaptureStatus = "capturing" | "ready" | "failed";

export interface DeviceCaptureFiles {
  viewport: string; // filename within captures/<device>
  fullPage: string; // filename within captures/<device>
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
    desktop: DeviceCaptureFiles;
    laptop: DeviceCaptureFiles;
    tablet: DeviceCaptureFiles;
    mobile: DeviceCaptureFiles;
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
