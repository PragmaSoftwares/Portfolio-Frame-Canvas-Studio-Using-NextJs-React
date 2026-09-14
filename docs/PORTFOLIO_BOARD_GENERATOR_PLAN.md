# Portfolio Board Generator — Development Plan

## 1. Project Goal

Build a local-first Next.js application that converts real website screenshots into polished, consistent portfolio presentation boards for Upwork.

The finished workflow should be:

```text
Create project
→ provide website pages
→ capture desktop, tablet, and mobile screenshots
→ review and crop screenshots
→ assign screenshots to portfolio templates
→ export portfolio-ready PNG images
```

The first version should prioritize reliable screenshot capture, attractive templates, easy cropping, and clean PNG exports. It should not attempt to be a full graphic-design editor.

## 2. Product Principles

1. Keep the first version local and single-user.
2. Use real screenshots without AI image modification.
3. Use fixed, reusable templates instead of free-form layouts.
4. Keep all text, colours, screenshots, and template assignments editable.
5. Let automation suggest choices, but keep the user in control.
6. Build and validate the export workflow before building a large dashboard.
7. Only use websites and work the portfolio owner has permission to showcase.

## 3. Recommended Technology

- Next.js with App Router
- TypeScript
- Tailwind CSS
- Playwright for website capture and final board export
- Zod for data validation
- Lucide icons where needed
- Local filesystem for project data and images
- Native React state for simple UI state

Do not add these to version one:

- Authentication
- Database
- Cloud storage
- Payments
- Multi-user accounts
- External AI dependency
- Free-form canvas editor
- Complex state-management library
- Vercel or serverless deployment
- Electron or Tauri packaging

Playwright must run in the Node.js runtime, not the Edge runtime. The first version will run from a local Next.js server.

## 4. Target Output

Each portfolio board must use a 4:3 aspect ratio.

- Master export: 2000 × 1500 pixels
- Upwork export: 1000 × 750 pixels
- Format: PNG
- Optional later format: JPEG

Suggested filenames:

```text
01-cover.png
02-responsive.png
03-feature-showcase.png
```

Begin with three excellent templates. Add more only after these consistently produce professional results.

## 5. Initial Templates

### Template 1: Cover Collage

Include:

- Project name
- Strong headline
- Short project description
- Large desktop screenshot
- Mobile device frame
- One supporting detail screenshot
- Project accent colour
- Optional logo and watermark

### Template 2: Responsive Showcase

Include:

- Desktop screenshot
- Tablet or mobile screenshot
- Minimal device frames
- Project name or short caption
- Simple background decoration

### Template 3: Feature Showcase

Include:

- One large product, feature, service, or dashboard screen
- Two smaller supporting screenshots
- Feature title
- Short explanation
- Optional services or technology labels

Later template candidates:

- Multi-device collage
- Project summary
- User journey or important pages
- Results and testimonial

## 6. Template Architecture

Implement every board as a React component. Templates must use declared screenshot slots rather than arbitrary positioning.

Example:

```ts
type TemplateSlot = {
  id: string;
  label: string;
  aspectRatio: string;
  recommendedDevice: "desktop" | "tablet" | "mobile" | "any";
};
```

Example template definition:

```ts
{
  id: "responsive-showcase",
  name: "Responsive Showcase",
  slots: [
    {
      id: "desktop-main",
      label: "Main desktop screen",
      aspectRatio: "16/10",
      recommendedDevice: "desktop"
    },
    {
      id: "mobile-main",
      label: "Main mobile screen",
      aspectRatio: "390/844",
      recommendedDevice: "mobile"
    }
  ]
}
```

Create a dedicated render route:

```text
/render/[projectId]/[templateId]
```

This route must render only the 2000 × 1500 board canvas without application navigation, controls, or development overlays. Playwright will capture the board element from this route.

## 7. Local Data Structure

Use a local directory structure similar to:

```text
data/
  settings.json
  projects/
    [projectId]/
      project.json
      logo/
      captures/
        desktop/
        tablet/
        mobile/
      uploads/
      exports/
```

Never construct filesystem paths directly from user-provided project names. Generate safe project and screenshot IDs.

### Project Data

Store:

- Project ID
- Project name
- Main URL
- Category
- Headline
- Description
- Accent colour
- Background preference
- Logo path
- Watermark text and visibility
- Services delivered
- Technologies used
- Approved page URLs
- Screenshot metadata
- Crop settings
- Template settings
- Screenshot-to-slot assignments
- Export records
- Created and updated timestamps

### Global Settings

Store reusable agency defaults:

- Agency name
- Agency logo
- Default watermark
- Default fonts
- Default light and dark backgrounds
- Standard services
- Default export sizes

## 8. Screenshot Capture Rules

Capture approved pages at:

- Desktop: 1440 × 1000
- Tablet: 768 × 1024
- Mobile: 390 × 844

For every selected page, save:

- Visible viewport screenshot
- Full-page screenshot

Later, support selected section captures.

Before each capture:

1. Validate the URL.
2. Load the page with a reasonable timeout.
3. Wait for web fonts.
4. Wait for important images to load.
5. Scroll through the page once to trigger lazy-loaded content.
6. Return to the top.
7. Disable CSS animations and transitions.
8. Attempt to close common cookie banners.
9. Hide obvious chat widgets where possible.
10. Capture using a consistent browser, locale, timezone, and colour scheme.

Capture approved pages sequentially in the first version. Reliability is more important than capture speed.

Provide an optional capture-delay setting for slow websites.

## 9. URL Safety

Because the application accepts URLs:

- Allow only HTTP and HTTPS URLs.
- Reject `file:` and other protocols.
- Reject private-network and localhost addresses unless explicitly enabled in development settings.
- Limit redirects.
- Warn when a page redirects to a different domain.
- Limit pages and captures per project.
- Validate uploaded image formats and file sizes.
- Never execute user-provided local scripts.

## 10. Screenshot Review and Cropping

Display screenshots grouped by page and device.

The user must be able to:

- Preview a screenshot
- Select or deselect it
- Rename its label
- Upload a replacement
- Delete an unwanted screenshot
- Recapture its page
- Assign it to a template slot
- Adjust its crop

Cropping controls should support:

- Horizontal position
- Vertical position
- Zoom
- Fit or fill
- Reset

Store crop values as data and apply them with CSS transforms or object positioning. Do not permanently modify the original capture.

## 11. Application Screens

Build these screens gradually:

1. Proof-of-concept capture page
2. Project dashboard
3. New project form
4. Page selection
5. Capture progress
6. Screenshot review
7. Board preview and customisation
8. Export results
9. Global agency settings

## 12. Suggested Components

- `ProjectForm`
- `PageUrlEditor`
- `CaptureProgress`
- `ScreenshotGrid`
- `ScreenshotCard`
- `ScreenshotPicker`
- `CropEditor`
- `DeviceFrame`
- `BoardCanvas`
- `TemplateControls`
- `ExportPanel`
- `CoverBoard`
- `ResponsiveBoard`
- `FeatureBoard`

## 13. Page Discovery

Do not make autonomous browsing a requirement for the first working version.

Initial behaviour:

1. Add the main URL as the homepage.
2. Let the user manually add up to five page URLs.
3. Capture only pages the user approves.

After the main workflow is reliable, add basic discovery:

- Read same-domain navigation links.
- Ignore login, legal, privacy, cart, and account pages by default.
- Suggest likely product, service, feature, portfolio, pricing, or about pages.
- Require user approval before capture.

AI-assisted page selection can be added later. AI output must be structured and editable.

## 14. Export Process

For one template export:

1. Save the current project and template configuration.
2. Open `/render/[projectId]/[templateId]` with Playwright.
3. Wait for fonts and screenshots to finish loading.
4. Confirm that the board canvas is exactly 2000 × 1500.
5. Capture only the board element.
6. Save the master PNG.
7. Optionally create the 1000 × 750 Upwork PNG.
8. Return the saved file paths to the interface.

Support:

- Export current board
- Export all boards
- Open export folder
- Regenerate an existing export

## 15. Error Handling

Show clear, non-technical errors for:

- Invalid URL
- Website unavailable
- Capture timeout
- Automated browser blocked
- Page redirected elsewhere
- Missing screenshot
- Image too small
- Upload failure
- Render failure
- Export failure
- Local storage failure

Allow retrying an individual operation without restarting the project.

## 16. Phased Development Plan

### Phase 0: Visual Reference

Before building the application:

1. Select one strong website as the test project.
2. Decide the fonts, colours, spacing, device-frame style, logo placement, and watermark style.
3. Create or describe the desired appearance of the three boards.
4. Treat this as the golden visual reference.

Success criteria:

- There is one agreed example project.
- The expected appearance of all three boards is clear.

### Phase 1: Capture-to-Export Proof of Concept

Build only:

1. A field for one website URL.
2. Desktop and mobile Playwright capture.
3. One fixed responsive board.
4. One PNG export at 2000 × 1500.

Do not build a dashboard or multi-project system yet.

Success criteria:

- A real URL can be captured.
- Both screenshots appear in the board.
- The board exports at the exact intended size.
- Text and images are sharp.

Stop and fix the architecture if this phase is unreliable.

### Phase 2: Project Storage and Basic Dashboard

Build:

1. Local project creation.
2. Project list.
3. Open, rename, duplicate, and delete project actions.
4. Persistent project JSON.
5. Global agency defaults.

Success criteria:

- Projects remain available after restarting the app.
- Duplicating a project preserves template and branding settings.
- Files are stored in the intended project directory.

### Phase 3: Multiple Pages and Devices

Build:

1. Up to five manually entered page URLs.
2. Desktop, tablet, and mobile capture.
3. Capture progress reporting.
4. Retry for individual failed pages.
5. Viewport and full-page capture.

Success criteria:

- Multiple pages can be captured without losing earlier results.
- Failures do not cancel successful captures.
- Screenshots are grouped correctly.

### Phase 4: Screenshot Review and Crop Editor

Build:

1. Screenshot review grid.
2. Upload replacement.
3. Rename and remove actions.
4. Screenshot selection.
5. Crop editor with horizontal position, vertical position, zoom, fit, fill, and reset.

Success criteria:

- The user can correct poor screenshot choices without recapturing everything.
- Crop changes are saved and appear identically in previews and exports.

### Phase 5: Three Production Templates

Build:

1. Cover Collage.
2. Responsive Showcase.
3. Feature Showcase.
4. Screenshot slot assignment.
5. Text, colour, background, logo, and watermark controls.

Success criteria:

- All templates work with the same project data structure.
- Templates remain visually stable with short and long text.
- Missing optional data does not break layouts.
- Output matches the golden visual reference.

### Phase 6: Export All

Build:

1. Export current board.
2. Export all boards.
3. Master and Upwork sizes.
4. Predictable filenames.
5. Export results screen.

Success criteria:

- All boards export successfully in one operation.
- Files have correct dimensions and names.
- Exported output matches the preview.

### Phase 7: Basic Page Discovery

Build:

1. Same-domain navigation-link discovery.
2. Page-type suggestions.
3. Exclusion rules.
4. User approval before capture.

Success criteria:

- Suggestions are useful but never captured without approval.
- The tool avoids account, legal, privacy, and irrelevant utility pages.

### Phase 8: Quality Improvements

Possible improvements:

- Section-level capture
- Additional template families for e-commerce, SaaS, and corporate sites
- Better cookie and chat-widget cleanup
- Automatic accent-colour suggestion
- Font presets
- Project import and export
- Batch project processing
- Optional AI-generated headlines and captions
- Optional AI screenshot recommendations
- Desktop application packaging

Do not begin this phase until the core workflow is stable.

## 17. Testing Strategy

Test with at least three different website types:

1. E-commerce website
2. Corporate or service website
3. SaaS product or dashboard

Test each type for:

- Responsive capture
- Long pages
- Lazy-loaded images
- Cookie banners
- Carousels and animations
- Light and dark sections
- Small and large logos
- Long project names
- Missing optional fields
- Screenshot crop consistency
- PNG export dimensions

## 18. Definition of Done for Version One

Version one is complete when the user can:

1. Create and reopen a local project.
2. Provide up to five approved website page URLs.
3. Capture desktop, tablet, and mobile screenshots.
4. Review, replace, and crop screenshots.
5. Assign screenshots to three reusable board templates.
6. Customise text, colours, branding, and watermark settings.
7. Export one or all boards as 2000 × 1500 PNG files.
8. Export optional 1000 × 750 Upwork versions.
9. Duplicate a project and reuse agency defaults.
10. Recover gracefully from an individual capture or export failure.

## 19. Instructions for the Coding Agent

- Read this entire file before making architectural decisions.
- Work on only one phase at a time.
- Begin with Phase 0 and Phase 1.
- Do not scaffold later phases prematurely.
- At the end of every phase, run relevant checks and demonstrate the completed workflow.
- Keep components small and reusable.
- Keep capture, persistence, template rendering, and export logic separated.
- Do not silently change output dimensions or directory conventions.
- Record assumptions and major decisions in the project README.
- Ask for input only when a choice would materially change the product or visual result.
- Preserve working behaviour while adding later phases.

