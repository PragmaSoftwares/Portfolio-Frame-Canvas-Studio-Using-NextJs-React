import type { CaptureDevice } from "@/lib/storage/paths";

// A board item normally points at a crop via `selectionId`. An uncropped
// full-page capture/upload has no selection record, so it's addressed by a
// virtual id instead: "orig:<device>:<pageSlug>" (the item's own pageSlug
// field repeats the slug). The file is resolved from the page's capture meta
// each time, so a Recapture or re-upload shows up on boards automatically.
const PREFIX = "orig:";
const DEVICES: CaptureDevice[] = ["desktop", "laptop", "tablet", "mobile"];

export function originalSelectionId(device: CaptureDevice, pageSlug: string): string {
  return `${PREFIX}${device}:${pageSlug}`;
}

export function parseOriginalSelectionId(id: string): { device: CaptureDevice; pageSlug: string } | null {
  if (!id.startsWith(PREFIX)) return null;
  const rest = id.slice(PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep < 0) return null;
  const device = rest.slice(0, sep) as CaptureDevice;
  const pageSlug = rest.slice(sep + 1);
  if (!DEVICES.includes(device) || pageSlug.length === 0) return null;
  return { device, pageSlug };
}
