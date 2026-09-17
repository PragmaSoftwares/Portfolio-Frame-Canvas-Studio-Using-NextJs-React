import packageJson from "../../../package.json";

const REPO_URL = "https://github.com/PragmaSoftwares/Portfolio-Frame-Canvas-Studio-Using-NextJs-React";

/**
 * The app-wide bottom bar — license link, version/changelog, and "Built by"
 * credit — shown on every page except the canvas board editor, mirroring
 * AppHeader exactly (same "lives at the page.tsx routing level" reasoning:
 * a single, centralized decision about which pages get it, not something
 * every page component has to remember to render itself).
 */
export function AppFooter() {
  return (
    <div className="border-t border-slate-800/80 bg-slate-950">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-6 py-6 text-xs text-slate-400 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-3">
          <a
            href="https://polyformproject.org/licenses/noncommercial/1.0.0"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-slate-100"
          >
            PolyForm Noncommercial License
          </a>
          <span className="text-slate-700">·</span>
          <a
            href={`${REPO_URL}/blob/master/CHANGELOG.md`}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-slate-100"
            title="See what changed at this version"
          >
            v{packageJson.version}
          </a>
        </div>
        <p>
          Built by{" "}
          <a
            href="https://www.pragmasoftwares.com/?utm_source=portfolio-frame-canvas-studio&utm_medium=referral"
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-slate-100"
          >
            Pragma Softwares
          </a>{" "}
          ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="transition hover:text-slate-100">
            Source on GitHub
          </a>
        </p>
      </div>
    </div>
  );
}
