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
| **Dashboard** — list/create/duplicate/delete projects, sort, filter by tag | `/` | `src/components/dashboard/ProjectDashboard.tsx` | `GET/POST /api/projects`, `POST /api/projects/[id]/duplicate`, `GET /api/tags` |
| **New project** — name, main URL, tags | `/projects/new` | `src/app/projects/new/page.tsx` | `POST /api/projects`, `GET /api/tags` |
| **Project workspace** — add pages, edit tags, run captures (queued, cancellable), Assisted Setup | `/projects/[id]` | `src/components/project/ProjectWorkspace.tsx` | `GET/PATCH/DELETE /api/projects/[id]`, `POST /api/capture`, `POST /api/capture/cancel`, `.../pages`, `.../pages/[slug]`, `.../assisted-setup/{start,status,finish,cancel}`, `GET /api/tags` |
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
  homepage plus any number of additional pages you add — no cap), `tags:
  string[]` (free-form labels, replaced the old single free-text `category`
  field — see **Tags** below), Assisted Setup timestamp, and whether manual
  upload is enabled for it.
- **`PageCaptureMeta`** (`types/capture.ts`, `lib/storage/captures.ts`) —
  per-page, per-device (`desktop | laptop | tablet | mobile`) capture
  status (`"capturing" | "ready" | "failed" | "cancelled"`) and the
  resulting full-page screenshot filename. See **Capture queue &
  cancellation** below for how a capture reaches `"cancelled"`, and how a
  stuck `"capturing"` record heals itself.
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

### Tags

Replaced the old single free-text `category` field — a project now has any
number of free-form `tags: string[]`, used for both filtering the dashboard
(checkbox multi-select, **OR** logic — a project matches if it has *any* of
the checked tags, not all of them) and sorting/organizing.

- **No separate tag registry.** `GET /api/tags` (`src/app/api/tags/route.ts`)
  derives the full "known tags" list live from whatever's actually attached
  to every project right now (case-insensitive de-duped, keeping
  whichever casing was seen first) — there's nothing to keep in sync, and a
  tag that's no longer used by any project simply stops being suggested.
- **`src/lib/validation/tags.ts`** (`normalizeTags`) is the one place tag
  input from a request gets trimmed/de-duped/validated — used by both
  `POST /api/projects` and `PATCH /api/projects/[id]`.
- **`src/components/tags/{TagPicker,TagPills}.tsx`** — `TagPicker` is the
  editable multi-select (chips + autocomplete dropdown + "Create tag
  "…""), used on the New Project form and on a project's own workspace
  page (`ProjectWorkspace.tsx`, next to the URL — **not** on the dashboard
  cards, which only ever show read-only `TagPills`). If you add another
  place tags need editing, reuse `TagPicker` rather than rebuilding the
  create-or-select dropdown logic.
  - **The dropdown closes after every pick, on purpose.** It's absolutely
    positioned and doesn't reserve layout space, so left open indefinitely
    it can float on top of whatever follows the picker in the layout (a
    Save button, in the dashboard's now-removed inline editor, was how this
    was actually found) — see the same pattern under **Conventions &
    gotchas** below. Don't "fix" this back to staying open for rapid
    multi-add without re-solving that overlap problem first.
- Migration: a project's old `category` string becomes its one starting tag
  verbatim (not split on spaces/commas) — see `migrateProject()` in
  `lib/storage/projects.ts`. Re-splitting an inherited single tag into
  finer ones is a manual edit, not something the app does automatically.

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
  before and after scrolling, plus a lazy-load image wait and a passive
  presence signal — see the comments there for what each defends against),
  `assistedSetup.ts` (a real visible browser window the user clicks through
  once; state is saved and replayed into future automated captures),
  `browser.ts` (shared browser instance), `errors.ts` (`CaptureError`,
  including an honest `"blocked"` status for CAPTCHA/bot-challenge pages
  rather than trying to bypass them, and `"cancelled"` — see below),
  `cancelRegistry.ts` (in-memory, per-capture `AbortController`s — see
  **Capture queue & cancellation**).
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

## Capture queue & cancellation

A project's Pages list runs captures through a small queue engine, not one
capture at a time gating every other button. Worth understanding fully
before touching either `ProjectWorkspace.tsx`'s capture functions or
`api/capture/*`:

- **The queue is entirely client-side, in-memory React state** (per browser
  tab — nothing shared across tabs, see below). Clicking Capture/Recapture/
  Retry on any page enqueues it; if nothing else is running it starts
  immediately, otherwise it waits its turn. Every row stays independently
  clickable — clicking one page's Capture never disables another's.
- **Refs, not a `useEffect`, drive the queue.** `capturingSlugRef`/
  `captureQueueRef` in `ProjectWorkspace.tsx` are the real source of truth;
  the paired `useState`s exist only to re-render. `startNextCapture()` is
  called directly from `enqueueCapture` (idle queue starts immediately) and
  from `runCapture`'s own `finally` block (one finishing hands off to the
  next) — deliberately not a `useEffect` watching queue/capturingSlug state,
  which would need to call `setState` synchronously inside the effect body
  just to pop the queue and trips React's "avoid setState directly within
  an effect" lint rule for exactly the reason it exists (cascading
  renders). Reading refs instead of state is also what makes this safe to
  call from `runCapture`'s `finally` after a long series of `await`s — the
  state variables would still reflect whatever they were when `runCapture`
  started, not any enqueues that happened while it was in flight.
- **Cancellation does NOT use `request.signal`.** The first implementation
  did — aborting the client `fetch()` and reading `request.signal` in the
  Route Handler is the "obvious" standard pattern, and it does nothing in
  this Next.js version. Confirmed live (a capture ran to completion despite
  the client aborting) and confirmed in the platform's own bundled docs
  (`node_modules/next/dist/docs/.../invoking-entrypoints.md` shows
  `signal?: AbortSignal` only in the **Edge** runtime handler's `ctx` —
  the **Node.js** runtime handler interface has no signal at all). Since
  Playwright requires the Node.js runtime, `request.signal` is a dead end
  here — don't reach for it again for anything else that needs to notice a
  dropped connection on this route. The actual mechanism: `POST
  /api/capture` registers its own `AbortController` in
  `cancelRegistry.ts`, keyed by `` `${projectId}:${pageSlug}` ``; a separate
  `POST /api/capture/cancel` looks up that key and calls `.abort()` on it.
  `captureAllDevices` checks the resulting signal between each of the 4
  device captures (not sub-second granularity — cancelling waits for
  whichever device is already mid-capture to finish first) and throws a
  `CaptureError("cancelled", …)`, which the route writes as `status:
  "cancelled"` through its normal (non-exceptional) response path — the
  client's original `fetch` just resolves normally with that result, no
  client-side `AbortController` needed at all.
- **The same registry check also blocks a same-project-same-page race** —
  e.g. the same project open in two tabs, both clicking Capture on the same
  page at once. `registerCapture` returns `null` if that exact key is
  already in the map; the route responds `409` instead of starting a second
  concurrent capture that would race the first to write the same files.
  Different projects (or different pages in the same project) never share a
  key and so never conflict — see the next point.
- **Captures across *different* projects/tabs run fully concurrently, by
  design** — there's no server-side lock serializing `/api/capture`
  requests in general, only the same-key guard above. Each call gets its
  own fresh `browser.newContext()` (isolated cookies/storage) from the one
  shared Chromium process (`browser.ts`) — the same relationship as
  several tabs open in your own browser. Correctness is fine; the real cost
  of many tabs all running "Capture all" at once is CPU/memory/network load
  stacked on that one shared browser process, not data corruption.
- **A `"capturing"` record can outlive the work behind it** if the whole
  server process dies mid-capture (not just a client disconnect — the
  cancel registry is memory-only and dies with the process too). Nothing
  can proactively detect that; instead, `readPageCaptureMeta()`
  (`lib/storage/captures.ts`) self-heals on next read — a `"capturing"`
  record older than 5 minutes (`STALE_CAPTURE_MS`, far beyond any real
  capture's runtime) is rewritten to `"failed"` with an explanatory message,
  the same "fix stale data in place on read" pattern as
  `migrateProject`/`migrateBoard`.

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
  high `zIndex`. This bit twice outside the canvas too: a dashboard
  click-outside-to-close overlay (`position: fixed`, explicit `z-index`)
  visually covered the very button that opened it, since the button itself
  had no `z-index` set — fixed by giving the button one too, not by
  removing the overlay's.
- **An absolutely-positioned dropdown that doesn't reserve layout space can
  float on top of whatever content follows it**, independent of the
  z-index point above — the dropdown has to stay above the *trigger* to
  remain clickable while genuinely open, but that same stacking then covers
  any sibling content positioned where the (empty-space-wise invisible)
  dropdown happens to render, e.g. a Save button placed right below a
  `TagPicker`. Chasing this with more z-index tuning doesn't resolve it
  (confirmed live — raising the sibling above the dropdown just made the
  dropdown's own options unclickable instead). The actual fix: close the
  dropdown once its job is done (`TagPicker` closes after every pick) so
  the overlap window is as short as possible, rather than trying to keep it
  open indefinitely and out-stack whatever's nearby.
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
- **These two never move independently.** If a commit/push session includes
  any user-facing change, bumping `package.json`'s version *requires* adding
  the matching `CHANGELOG.md` entry in that same commit, and vice versa —
  never bump one without the other. Before telling the user a push is ready,
  diff-check that `CHANGELOG.md`'s top heading version equals
  `package.json`'s version.
- Changelog entries describe **user-facing behavior only** — skip anything a
  person using the app wouldn't notice (internal refactors, cosmetic
  housekeeping). No empty "Unreleased" placeholder sections.
- Tag every version bump: `git tag -a vX.Y.Z -m "..."` then `git push origin vX.Y.Z`.
- **Committed locally is not the same as visible to anyone else** — the same
  "local reality vs. what's externally visible" trap as the stale-server
  gotcha in **Testing changes** above, just one level up the stack. The
  running app's footer version reads `package.json` directly off disk, so it
  always reflects the local working copy immediately — but the footer's
  CHANGELOG.md link points at the GitHub-hosted file, which only reflects
  whatever was last *pushed*. A version bump + changelog entry that's
  committed but not yet pushed will look mismatched to anyone checking
  GitHub (or clicking that link) even though the local repo is perfectly in
  sync. If the user reports the app version and the changelog disagreeing,
  check `git log`/`git status` for unpushed commits before assuming a bump
  was skipped — confirm what's actually reached `origin` before diagnosing
  further.

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0)
— see [`LICENSE`](LICENSE) for the full text and [`LICENSING.md`](LICENSING.md)
for a plain-English explanation. Free to use, modify, and extend
(including with the help of an AI assistant reading this guide) for
noncommercial purposes; hosting/reselling/commercially exploiting the
software itself needs permission first.
