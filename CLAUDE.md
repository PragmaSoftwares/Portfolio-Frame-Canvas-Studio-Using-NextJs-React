@AGENTS.md

# Developer Guide — Portfolio Frame Canvas Studio

This file is the map for anyone (human or AI coding assistant) picking up
this codebase — including a fresh Claude Code / Codex-style session that has
never seen this project before. Read it before searching the codebase or
making changes; it's kept current on purpose so you don't have to reverse-
engineer the architecture from scratch.

> The `@AGENTS.md` line above is a separate, unrelated co ncern: it's a file
> regenerated automatically by `next dev`/`next build` itself (this project
> pins a Next.js version with real breaking API changes from what most
> training data assumes) and tells an AI to check `node_modules/next/dist/docs/`
> before writing Next.js-specific code. It doesn't exist until you've run the
> app once (see **Quick start** below) and isn't part of this project's own
> documentation.

## What this is

A local-first Next.js tool that captures real website screenshots (desktop,
laptop, tablet, mobile — via a real headless browser) and lets you assemble
them into portfolio board images: drag cropped screenshots onto a free-form
canvas, frame each one in a realistic device mockup (or none), add styled
text, arrange/resize/layer everything by hand, and export a PNG. No
accounts, no database, no external services — everything is a project
folder on disk.

Read [`README.md`](README.md) for the user-facing feature list and setup
instructions; this file covers what README deliberately leaves out —
internal structure, data model, and the conventions/gotchas that matter when
extending the code.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript, React 19
- [Tailwind CSS](https://tailwindcss.com) v4
- [Playwright](https://playwright.dev) — drives a real Chromium for both
  page capture *and* PNG export (the export route renders a page and
  screenshots one element from it — see **Export** below)
- [react-image-crop](https://www.npmjs.com/package/react-image-crop) — the
  crop tool on the Review screen
- [react-rnd](https://www.npmjs.com/package/react-rnd) — drag/resize on the
  canvas editor
- [zod](https://zod.dev) — request validation in API routes
- No database. No auth. Persistence is plain JSON + PNG files under `data/`
  (gitignored, created at runtime) via `src/lib/storage/*`.

## Quick start

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run dev                       # http://localhost:3000
```

- `npm run build` runs `next build`, which **already** type-checks the whole
  project and runs ESLint — a clean build confirms both passed. Use `npx tsc
  --noEmit` / `npx eslint .` separately only for faster iteration while
  mid-edit.
- Editing files while `npm run dev` is running applies immediately. A
  production build (`npm run build && npm run start`) does **not** hot
  reload — rebuild and restart to see a change.
- Playwright always runs in the Node.js runtime, never the Edge runtime —
  any route that touches capture/export must declare `export const runtime
  = "nodejs"`.

## How the app is laid out (mirrors the actual site)

Each stop below is a real route, its main component, and the API routes
that back it — in the order a user moves through the app.

| Step | Route | Main component | Key API routes |
|---|---|---|---|
| **Dashboard** — list/create/duplicate/delete projects | `/` | `src/components/dashboard/ProjectDashboard.tsx` | `GET/POST /api/projects`, `POST /api/projects/[id]/duplicate` |
| **New project** — name + main URL | `/projects/new` | `src/app/projects/new/page.tsx` | `POST /api/projects` |
| **Project workspace** — add pages, run captures, Assisted Setup | `/projects/[id]` | `src/components/project/ProjectWorkspace.tsx` | `GET/PATCH/DELETE /api/projects/[id]`, `POST /api/capture`, `.../pages`, `.../pages/[slug]`, `.../assisted-setup/{start,status,finish,cancel}` |
| **Manual screenshot upload** — opt-in last-resort fallback per page/device | `/projects/[id]/pages/[slug]/upload` | `src/components/project/ManualUploadForm.tsx` | `POST /api/projects/[id]/pages/[slug]/upload` |
| **Review & crop** — crop sections out of full-page captures | `/projects/[id]/review` | `src/components/review/{ScreenshotReviewGrid,PageSelectionsPanel}.tsx` | `.../selections`, `.../selections/[selectionId]` |
| **Canvas editor (a board)** — drag, frame, style, save, export | `/projects/[id]/boards/[boardId]`, `/projects/[id]/boards/new` | `src/components/canvas/CanvasEditor.tsx` | `GET/PATCH/DELETE /api/projects/[id]/boards/[boardId]`, `POST .../duplicate`, `POST .../export` |
| **Export render target** — not meant to be browsed by a person; Playwright screenshots this page's `#board-canvas` element | `/render/board/[projectId]/[boardId]` | `src/app/render/board/[projectId]/[boardId]/page.tsx` | (rendered, not called directly) |
| **Library** — manage the shared custom-frame & background-image pools | `/library` | `src/components/library/LibraryManager.tsx` | `.../api/frames*`, `.../api/backgrounds*` |
| **Settings** — agency-wide watermark, default backgrounds, default font | `/settings` | `src/components/settings/SettingsForm.tsx` | `GET/PATCH /api/settings` |

Shared chrome: `src/components/nav/{AppHeader,AppFooter,TopNav}.tsx` (on
every page except the canvas editor, which is a dense work surface left in
its own visual style on purpose).

## Data model

Everything under `src/types/`, persisted as JSON by the matching module
under `src/lib/storage/`. No ORM, no schema migrations beyond a hand-rolled
`migrate*()` function per type that backfills missing fields on read.

- **`ProjectData`** (`types/project.ts`, `lib/storage/projects.ts`) — a
  project's identity, main URL, its `approvedPages: ApprovedPage[]` (the
  homepage plus any number of additional pages you add — no cap), Assisted
  Setup timestamp, and whether manual upload is enabled for it.
- **`PageCaptureMeta`** (`types/capture.ts`, `lib/storage/captures.ts`) —
  per-page, per-device (`desktop | laptop | tablet | mobile`) capture status
  and the resulting full-page screenshot filename.
- **`ScreenshotSelection`** (`types/review.ts`, `lib/storage/review.ts`) — one
  manually-cropped rectangle out of a full-page capture, saved as its own
  derivative PNG. The original capture is never modified.
- **`Board`** (`types/board.ts`, `lib/storage/boards.ts`) — a named canvas
  (fixed `canvasWidth`/`canvasHeight`, default 2000×1500 — see
  `BOARD_WIDTH`/`BOARD_HEIGHT` in `components/board/BoardCanvas.tsx`), a
  background choice, and `items: CanvasItem[]`.
  - **`CanvasItem` is a discriminated union on `kind`** — `ScreenshotItem`
    (`kind: "screenshot"`) or `TextItem` (`kind: "text"`). **Always check
    `item.kind` before reading kind-specific fields** — this is the single
    most important type in the app to get right; see the field-by-field
    comments in `types/board.ts` for what each one does (content fit,
    vertical anchor, corner rounding, text styling, etc.).
  - A project can have any number of boards; a board only ever references
    `selectionId`s from that project's own crop library — deleting a
    selection or page cascades into removing it from every board (see
    `removeSelectionFromBoards`/`removePageFromBoards` in `lib/storage/boards.ts`).
- **`CustomFrame`** (`types/frame.ts`, `lib/storage/customFrames.ts`) — a
  user-uploaded device-frame image plus a `screenQuad` (4 corner points, as
  percentages of the image, set once via the corner-pin editor). Global and
  shared across every project, not per-project.
- **`BackgroundImage`** (`types/backgroundImage.ts`,
  `lib/storage/backgroundImages.ts`) — a user-uploaded board background,
  same global/shared model as custom frames.
- **`AgencySettings`** (`types/settings.ts`, `lib/storage/settings.ts`) — one
  global record: agency name, default font, default light/dark board
  backgrounds, and the **only** watermark configuration in the app (see
  **Conventions & gotchas** below — there is no per-project watermark).

### On-disk layout (`data/`, gitignored, created at runtime)

```text
data/
  settings.json                 AgencySettings
  builtinFrameOverrides.json    per-variant corner corrections for the 4 shipped frames
  backgrounds/                  BackgroundImage library (index.json + files)
  frames/                       CustomFrame library (index.json + files)
  projects/<projectId>/
    project.json
    consent-state.json          Assisted Setup cookies/localStorage
    session-state.json          Assisted Setup sessionStorage
    captures/
      {desktop,laptop,tablet,mobile}/   full-page PNGs
      meta/                             PageCaptureMeta per page
      selections/                       cropped derivative PNGs
    boards/                      Board JSON, one file per board
    exports/                     exported PNGs + meta
```

`src/lib/storage/paths.ts` is the single source of truth for every path
above, plus `assertSafeId`/`assertSafeSlug` — **always validate an id/slug
that came from a request through these** before using it in a filesystem
path; that's the project's only defense against path traversal.

## Server-side architecture

- **`src/lib/capture/`** — Playwright-driven page capture. `capture.ts`
  (viewport sizes per device, popup/consent-banner dismissal run *twice*,
  before and after scrolling), `assistedSetup.ts` (a real visible browser
  window the user clicks through once; state is saved and replayed into
  future automated captures), `browser.ts` (shared browser instance),
  `errors.ts` (`CaptureError`, including an honest `"blocked"` status for
  CAPTCHA/bot-challenge pages rather than trying to bypass them).
- **`src/lib/canvas/homography.ts`** — the math behind angled/3D custom
  frames: computes a CSS `matrix3d()` that warps a flat rectangle onto an
  arbitrary quadrilateral. Two non-obvious correctness requirements if you
  touch this: normalize matrix coefficients by magnitude (raw values can
  exceed float32 precision) **and** by sign (CSS's `matrix3d` has a camera
  model that silently refuses to paint a negative-W result, even though the
  2D ratio is mathematically sign-invariant).
- **`src/lib/board/`** — `frameSize.ts` (default content-fit per frame type),
  `textStyle.ts` (`textBoxStyle()`/`textContentStyle()`, shared verbatim by
  the live editor and the static export render so preview and exported PNG
  can never drift apart — if you add a text-affecting field, it belongs in
  one of these two functions).
- **`src/lib/export/exportBoard.ts`** — loads `/render/board/[projectId]/[boardId]`
  in a real browser sized to the board's exact dimensions, waits for fonts
  and images to finish loading, and screenshots only the `#board-canvas`
  element.
- **`src/lib/fonts.ts`** — the single source of the app's font picker
  (`FONT_FAMILY_NAMES`), shared by Settings and the canvas text tool so they
  can never disagree; loaded via `next/font/google` in `layout.tsx`.
- **`src/lib/validation/url.ts`** — `validateCaptureUrl` used by every route
  that accepts a URL to capture.

## Conventions & gotchas worth knowing before you extend this

- **This is deliberately a free-form canvas, not a template system.** An
  earlier version had fixed board templates; they were fully built, then
  deliberately deleted in favor of the current drag/position/resize canvas.
  If a request sounds like "add a template/preset layout option," treat that
  as a real product-direction question to confirm, not something to infer
  from old code or docs.
- **The watermark is agency-wide only** (`AgencySettings.defaultWatermarkText`
  / `defaultWatermarkVisible`, applied live to every project's exports).
  There is no per-project watermark field — don't reintroduce one without
  being asked; it was tried and explicitly removed.
- **`CanvasItem` is a union, not one flat shape.** Code that maps over
  `board.items` needs a `kind` check before touching `pageSlug`/`selectionId`/
  `frame` (screenshot-only) or `text`/`fontFamily`/etc. (text-only).
- **`CaptureDevice`** (`lib/storage/paths.ts`) is `"desktop" | "laptop" |
  "tablet" | "mobile"` — import this type/constant rather than hardcoding a
  3- or 4-item device list; a new device being added once required updating
  ~10 call sites that had each hardcoded their own list.
- **Never format a server-derived date with `toLocaleString()`/
  `toLocaleDateString()` without explicit `locale`/`timeZone`** in anything
  that renders on both server and client — Node's ambient locale during SSR
  can differ from the browser's during hydration, producing a real hydration
  mismatch. See `formatAssistedSetupDate()` in `ProjectWorkspace.tsx` for the
  safe manual-format pattern.
- **An element with no explicit `zIndex` always stacks below any sibling
  that has one** (CSS default `z-index: auto`), regardless of DOM order.
  Anything meant to render on top of every canvas item needs an explicit,
  high `zIndex`.
- **An SVG used as a CSS `background-image` does not inherit the host
  page's `@font-face` rules**, no matter how the font is referenced. Custom-
  font text has to be real DOM text layered on top, not baked into
  SVG markup — confirmed the hard way while building the watermark overlay.
- **IDs and slugs from a request must go through `assertSafeId`/
  `assertSafeSlug`** (`lib/storage/paths.ts`) before being used to build a
  filesystem path.
- Custom frame uploads only accept PNG/WebP (need real alpha transparency);
  JPG is rejected with an explanation.

## Testing changes

- Run `npx tsc --noEmit`, `npx eslint .`, and `npm run build` after any
  non-trivial change.
- For UI/behavior changes, actually exercise the running app (Playwright
  browser tooling or `curl` against `npm run dev`) rather than relying on
  type-checking alone — read exported PNGs back to confirm pixel-level
  results when touching frame/export code, don't just trust a 200 response.
- Don't leave scratch projects/boards/uploaded images mixed into a real
  `data/` folder — clean up anything you create for testing.
- **A `next start` (production) server never picks up a new build on its
  own** — it just serves whatever `.next` output existed when it launched.
  Running `npm run build` while an old `npm start` process is still up
  silently leaves it serving stale code — no error, it just looks like your
  fix didn't apply. If you (or a coding assistant) verify a change against a
  server the user already has running:
  1. Prefer checking against `npm run dev` instead — it hot-reloads, so this
     whole class of problem can't happen.
  2. If the user is specifically running a production server (`npm start`),
     find and stop whatever's bound to its port **before** rebuilding, then
     restart it after the build finishes — don't just run `npm run build`
     and assume an already-running server will reflect it:
     ```bash
     netstat -ano | grep ":3000.*LISTENING"   # find the PID bound to the port
     taskkill //PID <pid> //F                 # stop it (Windows)
     npm run build
     npm start                                # restart fresh
     ```
  3. If a "fixed" bug still reproduces after a change that looks correct in
     the source, check for exactly this before assuming the fix is wrong —
     compare the running server's start time against the source files'/
     build's last-modified time.

## Versioning

- [`package.json`](package.json)'s `version` + [`CHANGELOG.md`](CHANGELOG.md)
  (Keep a Changelog style) track every release. Bump the version and add one
  changelog entry per push/finalize point, not per individual edit.
- Changelog entries describe **user-facing behavior only** — skip anything a
  person using the app wouldn't notice (internal refactors, cosmetic
  housekeeping). No empty "Unreleased" placeholder sections.
- Tag every version bump: `git tag -a vX.Y.Z -m "..."` then `git push origin vX.Y.Z`.

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
— see [`LICENSE`](LICENSE) for the full text and [`LICENSING.md`](LICENSING.md)
for a plain-English explanation. Free to use, modify, and extend
(including with the help of an AI assistant reading this guide) for
noncommercial purposes; hosting/reselling/commercially exploiting the
software itself needs permission first.
