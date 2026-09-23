export interface ApprovedPage {
  slug: string;
  url: string;
  label: string;
}

export interface ProjectData {
  id: string;
  name: string;
  mainUrl: string;
  // Free-form, user-defined labels (e.g. "Marketing", "WordPress", "CMS") —
  // replaced the old single free-text `category` field so a project can be
  // found under more than one facet. The set of "known" tags for
  // autocomplete (see TagPicker, GET /api/tags) is derived from whatever's
  // actually in use across every project's own `tags`, not stored
  // separately — there's no independent tag registry to fall out of sync.
  tags: string[];
  // Watermark (text/visibility) is agency-wide, not per-project — see
  // AgencySettings.defaultWatermarkText/defaultWatermarkVisible.
  approvedPages: ApprovedPage[];
  // When Assisted Setup (a real, visible browser session the user clicks
  // through cookie/promo/bot-challenge popups in once) was last saved for
  // this project. null/absent if it's never been run — captures then fall
  // back to the best-effort automated dismissal only. See
  // lib/capture/assistedSetup.ts.
  assistedSetupAt: string | null;
  // Off by default — manual image upload is a deliberate last resort for
  // when Assisted Setup and automated capture both fail (e.g. a security
  // check), not a routine alternative to them. The user opts in explicitly
  // per project via a checkbox next to Assisted Setup before the "Upload"
  // action appears next to Recapture. See app/projects/[id]/pages/[slug]/upload.
  manualUploadEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
