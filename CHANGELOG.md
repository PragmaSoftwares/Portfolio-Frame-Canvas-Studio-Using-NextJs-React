# Changelog

All notable changes to this project are documented here.

Versioning follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`): MAJOR for breaking changes, MINOR for new features or improvements, PATCH for bug fixes. The current version is in [`package.json`](package.json).

## [1.3.0] - 2026-09-22

### Added

- Corner rounding for framed items — when a screenshot is placed in a frame (a built-in device frame or a custom uploaded one), its corners can now be rounded from the canvas editor's "Selected item" panel, so they tuck back inside the frame's own rounded screen cutout instead of poking past it. Built-in frames start from their own already-tuned default; adjusting the control overrides it. Set per item (not per frame), so different screenshots placed in the same frame can each use their own amount.

## [1.2.0] - 2026-09-22

### Added

- Custom device frames — upload your own frame image (a marketplace mockup, a 3D-angled shot, anything with a transparent screen area) and manually pin its 4 screen corners once; a screenshot placed in it is warped to exactly fit that shape, including real perspective/angled frames, not just flat rectangles. Available from any board's editor, shared across every project like backgrounds already are.
- Library page — lists every uploaded custom frame and background image across all projects in one place, for reviewing or deleting without opening a board. Deleting from here behaves exactly like deleting from inside the editor: anything using a removed frame or background falls back to frameless / the default dark background instead of erroring.

### Changed

- Custom frame uploads accept PNG or WebP only (not JPG), since a frame needs a real transparent screen area, which JPG can't represent. Both the upload button and the frame-setup screen explain why, and warn if an uploaded image turns out not to have any transparent area to detect.

## [1.1.0] - 2026-09-17

### Added

- Manual screenshot upload as a last-resort fallback when Assisted Setup and automated capture both fail, gated behind an explicit per-project opt-in checkbox next to Assisted Setup — a dedicated upload page per page/device with guidance, a device dropdown, and current-status display.
- A reusable dark-glass `Tooltip`/`InfoTooltip` component for short inline help text.
- Semantic versioning, with the version shown in the app footer linking straight to this changelog.

### Changed

- Assisted Setup now also captures and replays `sessionStorage`, not just cookies/localStorage — needed for popups whose "already dismissed" flag is tab-scoped rather than persistent.
- "Proceed to Canvas" and "Capture all pages" now warn before overwriting a manually uploaded screenshot.
- Page URLs shown throughout the app (project page, review screen, upload page) are now clickable links to the real site.
- Brightened dim helper/description text across the app (project page, settings, canvas editor, review screen) for readability against the dark background.
- Back navigation links are now labeled "Back to X" and brighter, instead of just "← X" in dim gray.

### Fixed

- "Proceed to Canvas" now blocks with an error if nothing's been cropped yet, instead of opening an empty board.

## [1.0.0] - 2026-09-17

Baseline release — the point where formal versioning started. The items below already existed in the app; they're summarized here rather than reconstructed commit-by-commit.

### Added

- Real-browser capture (desktop/laptop/tablet/mobile) via Playwright, with best-effort automatic dismissal of common cookie/promo banners.
- Assisted Setup — a real, visible browser window to manually dismiss cookie/promo/bot-check popups once per project, reused by every later automated capture.
- Crop editor for pulling out exactly the sections you want from a captured page.
- Free-form canvas: drag, resize, and layer cropped screenshots and text boxes, each with a realistic device frame (or none).
- Text layer with real self-hosted Google Fonts, full formatting, drop shadow, and outline.
- Custom board backgrounds — a dark/light gradient, or an uploaded image shared across projects.
- Multiple boards per project, board duplication, and repeatable PNG export.
- Multi-page, multi-project support from a single local dashboard.
- 100% local-first storage — no accounts, no external services.

### Fixed

- Dashboard and Settings no longer freeze at their build-time state when running in production (`next start`).
- "Proceed to Canvas" no longer creates an empty board just from being clicked — a board is only saved on its first real edit.
- Deleting a project now removes it from the list immediately, without a stale "Project not found" error on retry.
