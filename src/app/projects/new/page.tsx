"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

export default function NewProjectPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mainUrl, setMainUrl] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, mainUrl, category: category || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the project.");
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the project.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <AppHeader />
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
            <h1 className="text-2xl font-semibold tracking-tight">New project</h1>
            <p className="text-slate-400 text-sm">
              You can add branding and multiple pages later — this just gets the project started.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <div className="space-y-1.5">
              <label className="text-sm text-slate-300" htmlFor="name">
                Project name
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Storefront Redesign"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-slate-300" htmlFor="mainUrl">
                Main website URL
              </label>
              <input
                id="mainUrl"
                value={mainUrl}
                onChange={(e) => setMainUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm text-slate-300" htmlFor="category">
                Category <span className="text-slate-500">(optional)</span>
              </label>
              <input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="E-commerce, SaaS, Corporate…"
                disabled={submitting}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || name.trim().length === 0 || mainUrl.trim().length === 0}
              className="bg-gradient-accent glow-accent rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting ? "Creating…" : "Create project"}
            </button>
          </form>
        </div>
      </div>
      <AppFooter />
    </>
  );
}
