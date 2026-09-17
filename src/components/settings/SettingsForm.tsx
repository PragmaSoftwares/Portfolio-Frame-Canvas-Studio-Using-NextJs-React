"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AgencySettings } from "@/types/settings";
import { FONT_FAMILY_NAMES, cssFontFamily } from "@/lib/fonts";

interface SettingsFormProps {
  initialSettings: AgencySettings;
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const router = useRouter();
  const [agencyName, setAgencyName] = useState(initialSettings.agencyName);
  const [defaultWatermarkText, setDefaultWatermarkText] = useState(initialSettings.defaultWatermarkText);
  const [defaultWatermarkVisible, setDefaultWatermarkVisible] = useState(initialSettings.defaultWatermarkVisible);
  const [watermarkColor, setWatermarkColor] = useState(initialSettings.watermarkColor);
  const [watermarkLineWidth, setWatermarkLineWidth] = useState(initialSettings.watermarkLineWidth);
  const [watermarkFontSize, setWatermarkFontSize] = useState(initialSettings.watermarkFontSize);
  // Stored as a 0-1 fraction; edited here as a friendlier 0-100 percent.
  const [watermarkOpacityPct, setWatermarkOpacityPct] = useState(Math.round(initialSettings.watermarkOpacity * 100));
  const [defaultBackgroundLight, setDefaultBackgroundLight] = useState(initialSettings.defaultBackgroundLight);
  const [defaultBackgroundDark, setDefaultBackgroundDark] = useState(initialSettings.defaultBackgroundDark);
  const [defaultFontFamily, setDefaultFontFamily] = useState(initialSettings.defaultFontFamily);
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
          defaultWatermarkText,
          defaultWatermarkVisible,
          watermarkColor,
          watermarkLineWidth,
          watermarkFontSize,
          watermarkOpacity: watermarkOpacityPct / 100,
          defaultBackgroundLight,
          defaultBackgroundDark,
          defaultFontFamily,
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
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-140 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-transparent blur-3xl"
      />

      <div className="relative mx-auto max-w-lg space-y-8 px-6 py-12">
        <header className="space-y-2">
          <Link href="/" className="text-xs text-slate-400 hover:text-slate-100">
            ← Back to Dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Agency settings</h1>
          <p className="text-slate-400 text-sm">
            These become the starting defaults for every new project — they don&apos;t change existing projects.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <Field label="Agency name">
            <input
              value={agencyName}
              onChange={(e) => setAgencyName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Watermark text">
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
            Show watermark on every board&apos;s export
          </label>
          <p className="-mt-2 text-xs text-amber-400/80">
            Unlike the rest of this page, this takes effect immediately across every project — including ones
            already created — not just new ones going forward.
          </p>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Watermark color">
              <input
                type="color"
                value={watermarkColor}
                onChange={(e) => setWatermarkColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
              />
            </Field>
            <Field label="Opacity (%)" hint="Low = barely visible unless zoomed in, like a Canva proof.">
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={watermarkOpacityPct}
                onChange={(e) => setWatermarkOpacityPct(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
              />
            </Field>
            <Field label="Line width (px)">
              <input
                type="number"
                min={0.25}
                max={10}
                step={0.25}
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
          <p className="-mt-2 text-sm text-slate-400">
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

          <Field label="Default font family" hint="Used for the repeating watermark text on every board's export.">
            <select
              value={defaultFontFamily}
              onChange={(e) => setDefaultFontFamily(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500"
            >
              {!FONT_FAMILY_NAMES.includes(defaultFontFamily) && (
                <option value={defaultFontFamily}>{defaultFontFamily}</option>
              )}
              {FONT_FAMILY_NAMES.map((font) => (
                <option key={font} value={font} style={{ fontFamily: cssFontFamily(font) }}>
                  {font}
                </option>
              ))}
            </select>
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
              className="bg-gradient-accent glow-accent rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
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
      {hint && <p className="text-sm text-slate-400">{hint}</p>}
    </div>
  );
}
