# Changelog

All notable changes to this project are documented here.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`): MAJOR for breaking changes, MINOR for new features or improvements, PATCH for bug fixes. The current version is in [`package.json`](package.json).

## [Unreleased]

## [1.0.0] - 2026-09-17

Baseline release — the point where formal versioning started. The items below already existed in the app; they're summarized here rather than reconstructed commit-by-commit.

### Added

- Real-browser capture (desktop/laptop/tablet/mobile) via Playwright, with best-effort automatic dismissal of common cookie/promo banners.
- Assisted Setup — a real, visible browser window to manually dismiss cookie/promo/bot-check popups once per project (cookies, localStorage, and sessionStorage all reused by every later automated capture).
- Manual screenshot upload as a last-resort fallback when Assisted Setup and automated capture both fail, gated behind an explicit per-project opt-in.
- Crop editor for pulling out exactly the sections you want from a captured page.
- Free-form canvas: drag, resize, and layer cropped screenshots and text boxes, each with a realistic device frame (or none).
- Text layer with real self-hosted Google Fonts, full formatting, drop shadow, and outline.
- Custom board backgrounds — a dark/light gradient, or an uploaded image shared across projects.
- Multiple boards per project, board duplication, and repeatable PNG export.
- Multi-page, multi-project support from a single local dashboard.
- 100% local-first storage — no accounts, no external services.
- A reusable dark-glass `Tooltip`/`InfoTooltip` component for short inline help text.
- Semantic versioning, with the version shown in the app footer linking straight to this changelog.

### Changed

- Dropped the separate "viewport" screenshot per device — only the full-page capture is stored and used, since the viewport shot had no real consumer.
- Switched from the MIT License to the PolyForm Noncommercial License 1.0.0, with a plain-English `LICENSING.md` companion.
- Assisted Setup now also captures and replays `sessionStorage`, not just cookies/localStorage — needed for popups whose "already dismissed" flag is tab-scoped rather than persistent.
- "Proceed to Canvas" and "Capture all pages" now warn before overwriting a manually uploaded screenshot.
- Page URLs shown throughout the app (project page, review screen, upload page) are now clickable links to the real site.
- Brightened dim helper/description text across the app (project page, settings, canvas editor, review screen) for readability against the dark background.
- Back navigation links are now labeled "Back to X" and brighter, instead of just "← X" in dim gray.
- Footer now also links to the GitHub repo, next to the "Built by Pragma Softwares" credit.

### Fixed

- Dashboard and Settings no longer freeze at their build-time state when running in production (`next start`).
- "Proceed to Canvas" no longer creates an empty board just from being clicked — a board is only saved on its first real edit, and now blocks with an error if nothing's been cropped yet.
- Deleting a project now removes it from the list immediately, without a stale "Project not found" error on retry.
