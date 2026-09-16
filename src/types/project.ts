export interface ApprovedPage {
  slug: string;
  url: string;
  label: string;
}

export interface ProjectData {
  id: string;
  name: string;
  mainUrl: string;
  category: string | null;
  // Watermark (text/visibility) is agency-wide, not per-project — see
  // AgencySettings.defaultWatermarkText/defaultWatermarkVisible.
  approvedPages: ApprovedPage[];
  // When Assisted Setup (a real, visible browser session the user clicks
  // through cookie/promo/bot-challenge popups in once) was last saved for
  // this project. null/absent if it's never been run — captures then fall
  // back to the best-effort automated dismissal only. See
  // lib/capture/assistedSetup.ts.
  assistedSetupAt: string | null;
  createdAt: string;
  updatedAt: string;
}
