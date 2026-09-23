"use client";

import { useMemo, useState } from "react";

interface TagPickerProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** All tags currently known across every project — see GET /api/tags. */
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
}

/**
 * A multi-select tag input: selected tags render as removable chips, typing
 * filters `suggestions` into a dropdown, and typing a tag that doesn't exist
 * yet offers "Create tag "…"" — the create-or-select flow the New Project
 * screen and per-project tag editing both need. There's no separate save
 * step for a newly created tag: as soon as it's attached to a project, it
 * shows up in the next GET /api/tags call and becomes a suggestion for
 * everyone else too.
 */
export function TagPicker({ value, onChange, suggestions, placeholder = "Add a tag…", disabled }: TagPickerProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const selectedKeys = useMemo(() => new Set(value.map((t) => t.toLowerCase())), [value]);

  const filtered = useMemo(() => {
    const query = input.trim().toLowerCase();
    return suggestions.filter(
      (tag) => !selectedKeys.has(tag.toLowerCase()) && (query === "" || tag.toLowerCase().includes(query))
    );
  }, [suggestions, selectedKeys, input]);

  const trimmedInput = input.trim();
  const hasExactMatch = filtered.some((tag) => tag.toLowerCase() === trimmedInput.toLowerCase());
  const canCreate = trimmedInput.length > 0 && !hasExactMatch && !selectedKeys.has(trimmedInput.toLowerCase());

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (trimmed.length === 0 || selectedKeys.has(trimmed.toLowerCase())) {
      setInput("");
      return;
    }
    // Reuse an existing tag's casing on a case-insensitive match, rather than
    // creating "marketing" alongside an existing "Marketing".
    const canonical = suggestions.find((s) => s.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
    onChange([...value, canonical]);
    setInput("");
    // Closing after every add (not just leaving it open for rapid multi-add)
    // is deliberate: this dropdown is absolutely positioned and doesn't
    // reserve layout space, so left open it can spatially cover whatever
    // content follows the picker (e.g. a Save button right below it on the
    // dashboard's inline tag editor) — no z-index ordering resolves that
    // cleanly, since the dropdown must stay above the picker to remain
    // clickable while genuinely open. Re-focusing the input to add another
    // tag is one extra click, but the alternative is content becoming
    // unpredictably unclickable depending on what's nearby.
    setOpen(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) addTag(filtered[0]);
      else if (trimmedInput.length > 0) addTag(trimmedInput);
    } else if (e.key === "Backspace" && input.length === 0 && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  }

  return (
    <div className="relative space-y-1.5">
      <div
        onClick={() => !disabled && setOpen(true)}
        className={`flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 focus-within:border-indigo-500 ${
          disabled ? "opacity-50" : ""
        }`}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 text-xs text-indigo-300"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="text-indigo-400 hover:text-indigo-200"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
        <input
          value={input}
          disabled={disabled}
          onChange={(e) => {
            setInput(e.target.value);
            // Focus never left the input after a pick closed the dropdown
            // (see addTag) — onFocus won't refire while already focused, so
            // typing needs its own trigger to bring the suggestion list back.
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        />
      </div>

      {open && (filtered.length > 0 || canCreate) && (
        <div className="absolute z-20 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 shadow-2xl">
          {filtered.map((tag) => (
            <button
              key={tag}
              type="button"
              // Keeps focus on the text input (no blur), so onClick still fires
              // instead of the dropdown closing out from under the click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(tag)}
              className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-slate-800"
            >
              {tag}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(trimmedInput)}
              className="block w-full px-3 py-1.5 text-left text-sm text-emerald-300 hover:bg-slate-800"
            >
              Create tag &ldquo;{trimmedInput}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
