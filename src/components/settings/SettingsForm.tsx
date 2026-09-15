"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AgencySettings } from "@/types/settings";

interface SettingsFormProps {
  initialSettings: AgencySettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [agencyName, setAgencyName] = useState(initialSettings.agencyName);
  const [agencyLogoPath, setAgencyLogoPath] = useState(initialSettings.agencyLogoPath ?? "");
  const [defaultWatermarkText, setDefaultWatermarkText] = useState(initialSettings.defaultWatermarkText);
  const [defaultWatermarkVisible, setDefaultWatermarkVisible] = useState(initialSettings.defaultWatermarkVisible);
  const [watermarkColor, setWatermarkColor] = useState(initialSettings.watermarkColor);
  const [watermarkLineWidth, setWatermarkLineWidth] = useState(initialSettings.watermarkLineWidth);
  const [watermarkFontSize, setWatermarkFontSize] = useState(initialSettings.watermarkFontSize);
  const [defaultBackgroundLight, setDefaultBackgroundLight] = useState(initialSettings.defaultBackgroundLight);
  const [defaultBackgroundDark, setDefaultBackgroundDark] = useState(initialSettings.defaultBackgroundDark);
  const [defaultFontFamily, setDefaultFontFamily] = useState(initialSettings.defaultFontFamily);
  const [standardServices, setStandardServices] = useState(initialSettings.standardServices.join(", "));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyName,
          agencyLogoPath: agencyLogoPath || null,
          defaultWatermarkText,
          defaultWatermarkVisible,
          watermarkColor,
          watermarkLineWidth,
          watermarkFontSize,
          defaultBackgroundLight,
          defaultBackgroundDark,
          defaultFontFamily,
          standardServices: standardServices
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save settings.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-lg space-y-8">
        <header className="space-y-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-300">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-semibold">Agency settings</h1>
          <p className="text-slate-400 text-sm">
            These become the starting defaults for every new project — they don&apos;t change existing projects.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Agency name">
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Agency logo path or URL" hint="No upload yet — paste a path or URL.">
            <input
              value={agencyLogoPath}
              onChange={(e) => setAgencyLogoPath(e.target.value)}
              placeholder="/logo.svg or https://…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Default watermark text">
            <input
              value={defaultWatermarkText}
              onChange={(e) => setDefaultWatermarkText(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={defaultWatermarkVisible}
              onChange={(e) => setDefaultWatermarkVisible(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Show watermark by default on new projects
          </label>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Watermark color">
              <input
                type="color"
                value={watermarkColor}
                onChange={(e) => setWatermarkColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
              />
            </Field>
            <Field label="Line width (px)">
              <input
                type="number"
                min={0.5}
                max={10}
                step={0.5}
                value={watermarkLineWidth}
                onChange={(e) => setWatermarkLineWidth(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </Field>
            <Field label="Text size (px)">
              <input
                type="number"
                min={8}
                max={72}
                step={1}
                value={watermarkFontSize}
                onChange={(e) => setWatermarkFontSize(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            Applies to the repeating diagonal watermark pattern on every board where the watermark is on — this is
            the shared style, not just a per-project starting point.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Default light background">
              <input
                type="color"
                value={defaultBackgroundLight}
                onChange={(e) => setDefaultBackgroundLight(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
              />
            </Field>
            <Field label="Default dark background">
              <input
                type="color"
                value={defaultBackgroundDark}
                onChange={(e) => setDefaultBackgroundDark(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
              />
            </Field>
          </div>

          <Field label="Default font family" hint="Stored for later use — boards don't apply this yet.">
            <input
              value={defaultFontFamily}
              onChange={(e) => setDefaultFontFamily(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Standard services" hint="Comma-separated. Copied into every new project as a starting point.">
            <input
              value={standardServices}
              onChange={(e) => setStandardServices(e.target.value)}
              placeholder="Web design, Development, SEO"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
            {saved && <span className="text-sm text-emerald-400">Saved.</span>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm text-slate-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
