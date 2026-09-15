"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactCrop, { centerCrop, makeAspectCrop, type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import type { ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";
import type { ScreenshotSelection } from "@/types/review";
import { frameHoleAspect } from "@/components/board/DeviceFrame";
import type { CaptureDevice } from "@/lib/storage/paths";

interface PageSelectionsPanelProps {
  projectId: string;
  page: ApprovedPage;
  capture: PageCaptureMeta | null;
  selections: ScreenshotSelection[];
}

// Single-sourced from the capture pipeline's own device union (lib/storage/paths.ts)
// instead of a locally re-declared literal list, so a future capture device can't
// be added there and silently missed here.
type Device = CaptureDevice;

const DEVICES: Device[] = ["desktop", "laptop", "tablet", "mobile"];

// Pulled from the same pixel-measured FRAME_ASSETS DeviceFrame itself renders
// from, so these can never drift out of sync with the actual frames a
// screenshot ends up displayed in.
const DEVICE_FRAME_ASPECTS: Record<Device, number> = {
  desktop: frameHoleAspect("desktop"),
  laptop: frameHoleAspect("laptop"),
  tablet: frameHoleAspect("tablet"),
  mobile: frameHoleAspect("mobile"),
};

const ASPECT_PRESETS: { label: string; value: number | undefined; device?: Device }[] = [
  { label: "Free", value: undefined },
  { label: "Desktop", value: DEVICE_FRAME_ASPECTS.desktop, device: "desktop" },
  { label: "Laptop", value: DEVICE_FRAME_ASPECTS.laptop, device: "laptop" },
  { label: "Tablet", value: DEVICE_FRAME_ASPECTS.tablet, device: "tablet" },
  { label: "Mobile", value: DEVICE_FRAME_ASPECTS.mobile, device: "mobile" },
  { label: "Square", value: 1 },
];

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop({ unit: "%", width: 70 }, aspect, mediaWidth, mediaHeight),
    mediaWidth,
    mediaHeight
  );
}

function getCroppedBlob(image: HTMLImageElement, pixelCrop: PixelCrop): Promise<{ blob: Blob; width: number; height: number }> {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const width = Math.max(1, Math.round(pixelCrop.width * scaleX));
  const height = Math.max(1, Math.round(pixelCrop.height * scaleY));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  ctx.drawImage(
    image,
    pixelCrop.x * scaleX,
    pixelCrop.y * scaleY,
    width,
    height,
    0,
    0,
    width,
    height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not produce a cropped image."));
        return;
      }
      resolve({ blob, width, height });
    }, "image/png");
  });
}

export function PageSelectionsPanel({ projectId, page, capture, selections: initialSelections }: PageSelectionsPanelProps) {
  const router = useRouter();
  const [device, setDevice] = useState<Device>("desktop");
  const [crop, setCrop] = useState<Crop>();
  const [pixelCrop, setPixelCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(DEVICE_FRAME_ASPECTS.desktop);
  const [label, setLabel] = useState("");
  const [selections, setSelections] = useState(initialSelections);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // The <img>'s onLoad event never fires if the browser serves it from cache
  // before React attaches the listener, which would otherwise leave the crop
  // box permanently uninitialized. This covers that case on every device switch.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && aspect) {
      setCrop(centerAspectCrop(img.width, img.height, aspect));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device]);

  if (!capture || capture.status !== "ready" || !capture.images) {
    return (
      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold">{page.label}</h2>
          <p className="text-xs text-slate-500">{page.url}</p>
        </div>
        <p className="rounded-xl border border-dashed border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
          {capture?.status === "failed" ? "This page failed to capture. Retry it from the project page first." : "Not captured yet. Capture this page first."}
        </p>
      </section>
    );
  }

  // A page captured before a device existed (e.g. "laptop" added later) won't
  // have that key yet — guard instead of assuming every device is present,
  // and prompt a recapture rather than crashing.
  const deviceImages = capture.images[device];
  const fullPageSrc = deviceImages
    ? `/api/media/projects/${projectId}/captures/${device}/${deviceImages.fullPage}`
    : null;

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    if (aspect) setCrop(centerAspectCrop(width, height, aspect));
  }

  function handleAspectChange(value: number | undefined) {
    setAspect(value);
    const img = imgRef.current;
    if (img && value) setCrop(centerAspectCrop(img.width, img.height, value));
  }

  function handleDeviceChange(next: Device) {
    setDevice(next);
    setCrop(undefined);
    setPixelCrop(undefined);
    // Default the crop aspect to whichever frame this device's screenshots
    // actually land in — still just a starting point, "Free"/another preset
    // remains one click away for a crop that isn't going in a device frame.
    setAspect(DEVICE_FRAME_ASPECTS[next]);
  }

  async function handleAddToList() {
    const img = imgRef.current;
    if (!img || !pixelCrop || pixelCrop.width === 0 || pixelCrop.height === 0) {
      setError("Drag a crop area on the image first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { blob, width, height } = await getCroppedBlob(img, pixelCrop);
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;

      const form = new FormData();
      form.append("file", blob, "selection.png");
      form.append("label", label.trim() || `${page.label} section`);
      form.append("sourceDevice", device);
      form.append(
        "cropRect",
        JSON.stringify({
          x: Math.round(pixelCrop.x * scaleX),
          y: Math.round(pixelCrop.y * scaleY),
          width,
          height,
        })
      );
      form.append("width", String(width));
      form.append("height", String(height));

      const res = await fetch(`/api/projects/${projectId}/pages/${page.slug}/selections`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that selection.");

      setSelections((prev) => [...prev, data.selection]);
      setLabel("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that selection.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(selectionId: string) {
    if (!window.confirm("Remove this saved section?")) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/pages/${page.slug}/selections/${selectionId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove that selection.");
      setSelections((prev) => prev.filter((s) => s.id !== selectionId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that selection.");
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold">{page.label}</h2>
        <p className="text-xs text-slate-500">{page.url}</p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">1. Captured screenshot</p>
          <div className="flex flex-wrap gap-1.5">
            {DEVICES.map((d) => (
              <button
                key={d}
                onClick={() => handleDeviceChange(d)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize ${
                  device === d ? "border-indigo-500 text-indigo-300" : "border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="h-11 w-px shrink-0 self-end bg-slate-800" />

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">2. Crop to this frame&apos;s shape</p>
          <div className="flex flex-wrap gap-1.5">
            {ASPECT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleAspectChange(preset.value)}
                className={`rounded-full border px-3 py-1.5 text-xs ${
                  aspect === preset.value ? "border-emerald-500 text-emerald-300" : "border-slate-700 text-slate-400 hover:border-slate-500"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-y-auto rounded-xl border border-slate-800 bg-slate-900" style={{ maxHeight: "70vh" }}>
        {fullPageSrc ? (
          <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setPixelCrop(c)} aspect={aspect}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={imgRef} src={fullPageSrc} alt="" onLoad={handleImageLoad} style={{ width: "100%", height: "auto", display: "block" }} />
          </ReactCrop>
        ) : (
          <p className="px-6 py-16 text-center text-sm text-slate-500">
            This page hasn&apos;t been captured for <span className="capitalize">{device}</span> yet — recapture it
            from the project page to add this device.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Section label (e.g. Featured products)"
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleAddToList}
          disabled={saving}
          className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add this to list"}
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {selections.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {selections.map((s) => (
            <div key={s.id} className="space-y-1.5 rounded-lg border border-slate-800 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/projects/${projectId}/captures/selections/${s.filename}`}
                alt={s.label}
                className="aspect-square w-full rounded object-cover"
              />
              <p className="truncate text-xs text-slate-300">{s.label}</p>
              <p className="text-[10px] text-slate-500 capitalize">{s.sourceDevice}</p>
              <button onClick={() => handleDelete(s.id)} className="text-[10px] text-red-400 hover:text-red-300">
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
