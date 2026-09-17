"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { PageCaptureMeta } from "@/types/capture";
import { InfoTooltip } from "@/components/ui/Tooltip";

type DeviceKey = "desktop" | "laptop" | "tablet" | "mobile";
const DEVICES: { key: DeviceKey; label: string }[] = [
  { key: "desktop", label: "Desktop" },
  { key: "laptop", label: "Laptop" },
  { key: "tablet", label: "Tablet" },
  { key: "mobile", label: "Mobile" },
];

interface ManualUploadFormProps {
  projectId: string;
  projectName: string;
  pageSlug: string;
  pageLabel: string;
  pageUrl: string;
  initialCapture: PageCaptureMeta | null;
}

export function ManualUploadForm({
  projectId,
  projectName,
  pageSlug,
  pageLabel,
  pageUrl,
  initialCapture,
}: ManualUploadFormProps) {
  const [capture, setCapture] = useState(initialCapture);
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState<DeviceKey | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setJustUploaded(null);
    setError(null);
    setFile(selected);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setJustUploaded(null);
    try {
      const form = new FormData();
      form.append("device", device);
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/pages/${pageSlug}/upload`, {
        method: "POST",
        body: form,
      });

      // A reverse proxy or host sitting in front of this app (nginx, a load
      // balancer, etc.) can reject an oversized request before it ever
      // reaches this route — that comes back as a plain-text/HTML body, not
      // JSON, so parse defensively rather than letting a JSON.parse error
      // surface as the message.
      let data: { error?: string; capture?: PageCaptureMeta } = {};
      try {
        data = await res.json();
      } catch {
        // Not JSON — fall through to the status-code-based message below.
      }

      if (!res.ok) {
        if (res.status === 413) {
          throw new Error(
            data.error ??
              "The server rejected this upload as too large (HTTP 413). This app doesn't impose its own file size " +
                "limit, so this is coming from something in front of it — your browser, a reverse proxy (e.g. " +
                "nginx's client_max_body_size), or your hosting platform. Check that setting if you need to upload " +
                "larger files."
          );
        }
        throw new Error(data.error ?? "Could not upload that image.");
      }

      setCapture(data.capture ?? null);
      setJustUploaded(device);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="relative mx-auto max-w-2xl space-y-8 px-6 py-12">
        <header className="space-y-2">
          <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:text-slate-100">
            ← Back to {projectName}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Upload a screenshot</h1>
          <p className="text-sm text-slate-400">
            {pageLabel} —{" "}
            <a href={pageUrl} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-indigo-300">
              {pageUrl}
            </a>
          </p>
        </header>

        <div className="rounded-2xl border border-amber-800/60 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
          Are you sure Assisted setup and automated capture didn&apos;t work for this page? If yes, go ahead — take a
          screenshot yourself and upload it below. This replaces whatever&apos;s currently in that device&apos;s
          slot, so only do this for the device(s) that actually failed.
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4 text-sm text-slate-400">
          <p className="font-medium text-slate-200">How to capture a good screenshot</p>
          <p className="mt-2">
            Use a browser extension that captures the <em>whole scrollable page</em>, not just what&apos;s visible.{" "}
            <a
              href="https://chromewebstore.google.com/detail/ijidfpoenjmfdabnmchmdoopghmjnjij"
              target="_blank"
              rel="noreferrer"
              className="text-indigo-300 underline underline-offset-2 hover:text-indigo-200"
            >
              Full Page Screenshot — Screen Capture &amp; Editor
            </a>{" "}
            works well for this and lets you save as PNG or JPG.
          </p>
          <p className="mt-2">
            Your browser or OS&apos;s built-in Print Screen / &quot;capture visible area&quot; only grabs what&apos;s
            currently on screen, not the rest of the page below the fold — that won&apos;t give a usable result here.
          </p>
          <p className="mt-2">The image is used exactly as uploaded — no cropping to a viewport size.</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-4">
          <p className="text-sm font-medium text-slate-200">Current status</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {DEVICES.map(({ key, label }) => {
              const image = capture?.images?.[key];
              return (
                <span key={key} className="inline-flex items-center gap-1">
                  {image ? (
                    <>
                      <span className="text-emerald-400">✓</span>
                      <a
                        href={`/api/media/projects/${projectId}/captures/${key}/${image.fullPage}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-slate-300"
                      >
                        {label}
                      </a>
                      {image.uploaded && <span className="text-slate-600">(uploaded)</span>}
                    </>
                  ) : (
                    <span className="text-slate-600">{label} — not captured</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleUpload} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 px-5 py-5">
          <div className="space-y-1.5">
            <label htmlFor="manual-upload-device" className="text-xs font-medium text-slate-300">
              Which screen size is this screenshot for?
            </label>
            <select
              id="manual-upload-device"
              value={device}
              onChange={(e) => setDevice(e.target.value as DeviceKey)}
              disabled={uploading}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
            >
              {DEVICES.map(({ key, label }) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="manual-upload-file" className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300">
              Screenshot file (PNG, JPG, or WebP)
              <InfoTooltip
                content={
                  <>
                    This app doesn&apos;t set its own file size limit — it accepts whatever your browser and hosting
                    setup allow. If a large upload fails, it&apos;s something in front of the app (your browser, a
                    reverse proxy, your hosting platform) enforcing its own limit, not a restriction built into this
                    app.
                  </>
                }
              />
            </label>
            <input
              id="manual-upload-file"
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelected}
              disabled={uploading}
              className="w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border file:border-slate-700 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:border-slate-500 disabled:opacity-50"
            />
            {file && (
              <p className="text-xs text-slate-500">
                Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {justUploaded && !error && (
            <p className="text-xs text-emerald-400">
              Uploaded for {DEVICES.find((d) => d.key === justUploaded)?.label}. You can upload another device
              below, or head back to the project.
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!file || uploading}
              className="bg-gradient-accent glow-accent rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <Link href={`/projects/${projectId}`} className="text-sm text-slate-400 hover:text-slate-200">
              Back to project
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
