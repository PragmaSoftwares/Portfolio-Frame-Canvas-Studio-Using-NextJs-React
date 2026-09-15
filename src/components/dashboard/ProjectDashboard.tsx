"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectData } from "@/types/project";
import { accentFor } from "@/lib/ui/cardAccent";

interface ProjectDashboardProps {
  initialProjects: ProjectData[];
}

export function ProjectDashboard({ initialProjects }: ProjectDashboardProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleRename(id: string) {
    if (renameValue.trim().length === 0) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Rename failed.");
      setRenamingId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Duplicate failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This removes its captures and exports too. This can't be undone.`)) {
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Ambient glow — purely decorative, sits behind everything else. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-140 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-transparent blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl space-y-10 px-6 py-12">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Portfolio projects</h1>
          <p className="max-w-md text-sm text-slate-400">
            Create a project for each website, capture it, and export a portfolio board.
          </p>
        </header>

        {error && (
          <div className="rounded-xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        {initialProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center text-sm text-slate-500">
            No projects yet. Create your first one to get started.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {initialProjects.map((project) => (
              <li
                key={project.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5 transition hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-xl hover:shadow-indigo-950/40"
              >
                <div className={`absolute inset-x-0 top-0 h-1 bg-linear-to-r ${accentFor(project.id)}`} />

                <div className="min-w-0">
                  {renamingId === project.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(project.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleRename(project.id)}
                        disabled={busyId === project.id}
                        className="shrink-0 text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="shrink-0 text-xs text-slate-500 hover:text-slate-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate text-base font-semibold text-slate-100 hover:text-indigo-300"
                    >
                      {project.name}
                    </Link>
                  )}
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {project.mainUrl}
                    {project.category ? ` · ${project.category}` : ""}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-4 border-t border-slate-800/80 pt-3 text-xs">
                  <button
                    onClick={() => {
                      setRenamingId(project.id);
                      setRenameValue(project.name);
                    }}
                    disabled={busyId === project.id}
                    className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  >
                    Rename
                  </button>
                  <button
                    onClick={() => handleDuplicate(project.id)}
                    disabled={busyId === project.id}
                    className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
                  >
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleDelete(project.id, project.name)}
                    disabled={busyId === project.id}
                    className="ml-auto text-red-400/90 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="flex flex-col items-center gap-2 border-t border-slate-800 pt-6 text-xs text-slate-600 sm:flex-row sm:justify-between">
          <a
            href="https://choosealicense.com/licenses/mit/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-400"
          >
            MIT License
          </a>
          <p>
            Built by{" "}
            <a
              href="https://www.pragmasoftwares.com/?utm_source=portfolio-frame-canvas-studio&utm_medium=referral"
              target="_blank"
              rel="noreferrer"
              className="hover:text-slate-400"
            >
              Pragma Softwares
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
