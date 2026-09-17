"use client";

import { useId, useState, type ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}

/**
 * A small dark-glass popover matching the dashboard's own palette (slate
 * panels, indigo accents) rather than the browser's plain default `title`
 * tooltip. Shows on hover *and* focus (not just :hover) so it's reachable
 * by keyboard, not just a mouse. Reusable anywhere a short explanation
 * needs to sit next to a label without permanently taking up space — see
 * InfoTooltip below for the common "small ? badge" case.
 */
export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={id} className="inline-flex">
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute z-50 w-max max-w-64 rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-xl shadow-black/40 backdrop-blur-sm transition-all duration-150 ${
          side === "top" ? "bottom-full left-1/2 mb-2 -translate-x-1/2" : "top-full left-1/2 mt-2 -translate-x-1/2"
        } ${open ? "visible scale-100 opacity-100" : "invisible scale-95 opacity-0"}`}
      >
        {content}
        <span
          aria-hidden
          className={`absolute left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-slate-700 bg-slate-900 ${
            side === "top" ? "top-full -mt-1 border-r border-b" : "bottom-full -mb-1 border-t border-l"
          }`}
        />
      </span>
    </span>
  );
}

/** A small "?" badge with a Tooltip attached — the common case of a label needing one extra sentence of context. */
export function InfoTooltip({ content, side }: { content: ReactNode; side?: "top" | "bottom" }) {
  return (
    <Tooltip content={content} side={side}>
      <button
        type="button"
        tabIndex={0}
        className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-slate-600 text-[10px] font-normal leading-none text-slate-500 transition hover:border-indigo-400 hover:text-indigo-300"
      >
        ?
      </button>
    </Tooltip>
  );
}
