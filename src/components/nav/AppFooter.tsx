/**
 * The app-wide bottom bar — license link and "Built by" credit — shown on
 * every page except the canvas board editor, mirroring AppHeader exactly
 * (same "lives at the page.tsx routing level" reasoning: a single,
 * centralized decision about which pages get it, not something every page
 * component has to remember to render itself).
 */
export function AppFooter() {
  return (
    <div className="border-t border-slate-800/80 bg-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-6 text-xs text-slate-600 sm:flex-row sm:justify-between">
        <a
          href="https://polyformproject.org/licenses/noncommercial/1.0.0"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-400"
        >
          PolyForm Noncommercial License
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
      </div>
    </div>
  );
}
