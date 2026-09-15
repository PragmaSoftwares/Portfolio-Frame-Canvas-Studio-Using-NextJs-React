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
  headline: string | null;
  description: string | null;
  accentColor: string;
  backgroundPreference: "light" | "dark";
  logoPath: string | null;
  // Watermark (text/visibility) is agency-wide, not per-project — see
  // AgencySettings.defaultWatermarkText/defaultWatermarkVisible.
  servicesDelivered: string[];
  technologiesUsed: string[];
  approvedPages: ApprovedPage[];
  createdAt: string;
  updatedAt: string;
}
