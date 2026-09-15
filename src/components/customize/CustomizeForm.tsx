"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProjectData } from "@/types/project";

interface CustomizeFormProps {
  project: ProjectData;
}

export function CustomizeForm({ project }: CustomizeFormProps) {
  const router = useRouter();
  const [headline, setHeadline] = useState(project.headline ?? "");
  const [description, setDescription] = useState(project.description ?? "");
  const [accentColor, setAccentColor] = useState(project.accentColor);
  const [backgroundPreference, setBackgroundPreference] = useState(project.backgroundPreference);
  const [logoPath, setLogoPath] = useState(project.logoPath ?? "");
  const [servicesDelivered, setServicesDelivered] = useState(project.servicesDelivered.join(", "));
  const [technologiesUsed, setTechnologiesUsed] = useState(project.technologiesUsed.join(", "));

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headline: headline || null,
          description: description || null,
          accentColor,
          backgroundPreference,
          logoPath: logoPath || null,
          servicesDelivered: servicesDelivered.split(",").map((s) => s.trim()).filter(Boolean),
          technologiesUsed: technologiesUsed.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save changes.");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
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
          <Link href={`/projects/${project.id}`} className="text-xs text-slate-500 hover:text-slate-300">
            ← {project.name}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Customize</h1>
          <p className="text-slate-400 text-sm">
            Text, colour, background, and logo for this project&apos;s boards. Watermark is agency-wide now —
            see <Link href="/settings" className="text-indigo-400 hover:text-indigo-300">Settings</Link>.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <Field label="Headline" hint="Falls back to the project name if left blank.">
            <input
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder={project.name}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Accent colour">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900"
              />
            </Field>
            <Field label="Board background">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBackgroundPreference("dark")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${backgroundPreference === "dark" ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setBackgroundPreference("light")}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${backgroundPreference === "light" ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}
                >
                  Light
                </button>
              </div>
            </Field>
          </div>

          <Field label="Logo path or URL" hint="No upload yet — paste a path or URL.">
            <input
              value={logoPath}
              onChange={(e) => setLogoPath(e.target.value)}
              placeholder="/logo.svg or https://…"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Services delivered" hint="Comma-separated. Shown as labels on Feature Showcase.">
            <input
              value={servicesDelivered}
              onChange={(e) => setServicesDelivered(e.target.value)}
              placeholder="Web design, Development"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </Field>

          <Field label="Technologies used" hint="Comma-separated. Also shown as labels on Feature Showcase.">
            <input
              value={technologiesUsed}
              onChange={(e) => setTechnologiesUsed(e.target.value)}
              placeholder="Next.js, Tailwind"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
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
              className="bg-gradient-accent glow-accent rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {saving ? "Saving…" : "Save"}
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
