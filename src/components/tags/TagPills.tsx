/** Read-only display for a project's tags — the dashboard card's non-editing state. */
export function TagPills({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="rounded-full border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-300"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
