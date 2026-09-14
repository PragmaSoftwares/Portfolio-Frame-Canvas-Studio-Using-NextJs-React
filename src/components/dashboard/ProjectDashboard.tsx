"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TopNav } from "@/components/nav/TopNav";
import type { ProjectData } from "@/types/project";

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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Portfolio projects</h1>
            <p className="text-slate-400 text-sm">
              Create a project for each website, capture it, and export a portfolio board.
            </p>
          </div>
          <TopNav />
        </header>

        <div className="flex justify-end">
          <Link
            href="/projects/new"
            className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium hover:bg-indigo-400"
          >
            + New project
          </Link>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {initialProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-800 px-6 py-12 text-center text-sm text-slate-500">
            No projects yet. Create your first one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800">
            {initialProjects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
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
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm outline-none focus:border-indigo-500"
                      />
                      <button
                        onClick={() => handleRename(project.id)}
                        disabled={busyId === project.id}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Save
                      </button>
                      <button onClick={() => setRenamingId(null)} className="text-xs text-slate-500 hover:text-slate-300">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <Link href={`/projects/${project.id}`} className="truncate font-medium hover:text-indigo-400">
                      {project.name}
                    </Link>
                  )}
                  <p className="truncate text-xs text-slate-500">
                    {project.mainUrl}
                    {project.category ? ` · ${project.category}` : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-3 text-xs">
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
                    className="text-red-400 hover:text-red-300 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
