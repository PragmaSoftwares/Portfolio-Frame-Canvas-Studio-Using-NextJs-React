# Portfolio Frame Canvas Studio

**Source: <https://github.com/PragmaSoftwares/Portfolio-Frame-Canvas-Studio-Using-NextJs-React>** — if you got this project as a downloaded copy rather than a git clone, this is where to find the latest version and updates.

Create responsive device mockups from real website screenshots — no account, no cloud, no database. Everything runs locally.

Capture a site's desktop, tablet, and mobile views with a real browser, crop out the sections worth showing, then drag them onto a free-form canvas where each screenshot is automatically framed in a realistic device mockup (desktop monitor, laptop, tablet, or phone). Arrange, resize, and layer them by hand, then export a crisp PNG — as many times, in as many different arrangements, as you want.

## Features

- **Real browser capture** — full-page screenshots at desktop (1440×1000), laptop (1366×768), tablet (768×1024), and mobile (390×844) sizes via [Playwright](https://playwright.dev).
- **Crop editor** — drag out exactly the section of a page you want to show; crop as many sections as you like from any page, any device. The original capture is never modified.
- **Free-form canvas** — drag cropped screenshots onto a canvas, position and resize them with the mouse or arrow keys, layer them, and pick a device frame per item (or no frame at all).
- **Text layer** — drag a text box onto the canvas alongside your screenshots. Format it with font family (a curated set of real, self-hosted Google Fonts), size, color, bold/italic/underline, alignment (including justify), letter spacing, line height, text case, vertical alignment, a background plate, opacity, drop shadow, and an outline.
- **Realistic device frames** — desktop, laptop, tablet, and phone mockups, not a flat CSS rectangle.
- **Custom device frames** — upload your own frame image (a marketplace mockup, a 3D-angled laptop shot, anything with a transparent screen area) and manually pin its 4 screen corners once; a screenshot placed in it is warped to fit that exact shape, angled perspective included. Shared across every project, same as backgrounds.
- **Custom backgrounds** — a dark or light gradient out of the box, or upload your own background image (cover / repeat / stretch fit). Uploaded backgrounds are saved to a shared library so you can reuse the same one across multiple projects without re-uploading.
- **Library** — a single page listing every uploaded custom frame and background image across all projects, for reviewing or deleting them without opening a board.
- **Multiple boards per project** — build as many different compositions as you want from the same set of cropped screenshots, and export each one independently, any number of times.
- **Multi-page, multi-project** — capture up to five additional pages per project (beyond the homepage), and manage any number of separate projects from one dashboard.
- **100% local-first** — every project, screenshot, and export is a plain file on disk (`data/`, gitignored). No sign-in, no external services.

## Getting started

Requires Node.js 20+.

```bash
git clone https://github.com/PragmaSoftwares/Portfolio-Frame-Canvas-Studio-Using-NextJs-React.git
cd Portfolio-Frame-Canvas-Studio-Using-NextJs-React
npm install
npx playwright install chromium   # one-time browser download for capture/export
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Making changes locally

- Running `npm run dev`? Just save the file — changes apply automatically.
- Running the production build (`npm run build && npm run start`)? Editing files alone won't update the running server — `next start` serves whatever was already built. Re-run `npm run build`, then restart `npm run start`, to see a change take effect.
- `npm run build` already type-checks the whole project and runs ESLint as part of the build, and fails if either finds a problem — a successful build already confirms both passed. `npm run lint` is available separately for a faster check while you're still editing.

## Versioning

This project follows [Semantic Versioning](https://semver.org/) — see the current version in [`package.json`](package.json) and what changed at each version in [`CHANGELOG.md`](CHANGELOG.md). If you're checking whether you're on the latest setup, compare your version against the changelog.

## How it works

```text
New project → enter a name and URL
  → Capture all pages (desktop/tablet/mobile screenshots)
  → Review screenshots → crop out the sections you want
  → Proceed to Canvas → drag screenshots onto the canvas,
    arrange/resize/frame them
  → Export PNG
```

Create as many boards per project as you like, and export any of them as many times as you like — nothing is consumed or locked after exporting.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript
- [Tailwind CSS](https://tailwindcss.com)
- [Playwright](https://playwright.dev) for capture and export
- [react-image-crop](https://www.npmjs.com/package/react-image-crop) for the crop tool
- [react-rnd](https://www.npmjs.com/package/react-rnd) for the canvas editor

## Project structure

```text
src/
  app/            Next.js routes (pages + API routes)
  components/     React components (board rendering, canvas editor, forms)
  lib/            Capture, storage, and export logic
  types/          Shared TypeScript types
public/frames/    Device frame images used by the canvas
data/             Local project data (gitignored — created at runtime)
```

Playwright always runs in the Node.js runtime, never the Edge runtime.

## Known limitations

This is a personal/small-team tool, not a general-purpose design app:

- Cookie/promo popups on captured pages are dismissed on a best-effort basis automatically, not guaranteed — for anything that slips through (or a Cloudflare/CAPTCHA check), use a project's "Assisted Setup" to dismiss it yourself once in a real browser window; future captures for that project reuse the result. If a page still won't capture cleanly even after that, a project can opt in to manually uploading a full-page screenshot (e.g. from a browser extension) per device instead, as a last resort.

## License

[PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) — free to use, modify, and share for noncommercial purposes (including building your own portfolio with it). Hosting, reselling, or otherwise commercially exploiting the software itself requires permission first. See [`LICENSE`](LICENSE) for the full legal text, or [`LICENSING.md`](LICENSING.md) for a plain-English explanation.
