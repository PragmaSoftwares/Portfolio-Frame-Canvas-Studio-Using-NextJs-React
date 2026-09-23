"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ProjectData } from "@/types/project";
import { accentFor } from "@/lib/ui/cardAccent";
import { TagPills } from "@/components/tags/TagPills";

interface ProjectDashboardProps {
  initialProjects: ProjectData[];
}

type SortOption = "updated" | "createdDesc" | "createdAsc" | "alpha";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "updated", label: "Last modified" },
  { value: "createdDesc", label: "Date added (newest)" },
  { value: "createdAsc", label: "Date added (oldest)" },
  { value: "alpha", label: "Name (A–Z)" },
];

function sortProjects(projects: ProjectData[], sortBy: SortOption): ProjectData[] {
  const sorted = [...projects];
  switch (sortBy) {
    case "createdDesc":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "createdAsc":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "alpha":
      return sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    case "updated":
    default:
      return sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}

function TagFilter({
  allTags,
  selected,
  onChange,
}: {
  allTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  function toggle(tag: string) {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        // Explicit z-index, matching the click-outside overlay below — a
        // static element with none stacks below any sibling that has one,
        // regardless of DOM order, so without this the overlay (rendered
        // after it, once open) would sit visually on top of this button too.
        className="relative z-30 flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
      >
        Filter by tag{selected.length > 0 ? ` (${selected.length})` : ""}
        <span className="text-slate-500">▾</span>
      </button>

      {open && (
        <>
          {/* Click-outside-to-close overlay — sits under the panel, above everything else. */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Tags {selected.length > 0 ? "(any of)" : ""}
              </p>
              {selected.length > 0 && (
                <button type="button" onClick={() => onChange([])} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                  Reset
                </button>
              )}
            </div>
            {allTags.length === 0 ? (
              <p className="text-xs text-slate-500">No tags yet.</p>
            ) : (
              <div className="max-h-56 space-y-0.5 overflow-y-auto">
                {allTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(tag)}
                      onChange={() => toggle(tag)}
                      className="rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                    />
                    {tag}
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ProjectDashboard({ initialProjects }: ProjectDashboardProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("updated");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(initialProjects.flatMap((p) => p.tags))).sort((a, b) => a.localeCompare(b)),
    [initialProjects]
  );

  const visibleProjects = useMemo(() => {
    const filtered =
      selectedTags.length === 0
        ? initialProjects
        : initialProjects.filter((p) => p.tags.some((t) => selectedTags.includes(t)));
    return sortProjects(filtered, sortBy);
  }, [initialProjects, selectedTags, sortBy]);

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

  async function handleDuplicate(id: string, name: string) {
    if (!window.confirm(`Duplicate "${name}"? This copies its pages and boards under a new project — nothing in the original changes.`)) {
      return;
    }
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

        {initialProjects.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-400">
              Sort by
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <TagFilter allTags={allTags} selected={selectedTags} onChange={setSelectedTags} />
          </div>
        )}

        {initialProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center text-sm text-slate-500">
            No projects yet. Create your first one to get started.
          </div>
        ) : visibleProjects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 px-6 py-16 text-center text-sm text-slate-500">
            No projects match the selected tags.
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {visibleProjects.map((project) => (
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
                  <p className="mt-1 truncate text-xs text-slate-500">{project.mainUrl}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {project.approvedPages.length} URL{project.approvedPages.length === 1 ? "" : "s"} added
                  </p>

                  {project.tags.length > 0 && (
                    <div className="mt-2">
                      <TagPills tags={project.tags} />
                    </div>
                  )}
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
                    onClick={() => handleDuplicate(project.id, project.name)}
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
      </div>
    </div>
  );
}
