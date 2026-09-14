export interface ProjectWatermark {
  text: string;
  visible: boolean;
}

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
  watermark: ProjectWatermark;
  servicesDelivered: string[];
  technologiesUsed: string[];
  approvedPages: ApprovedPage[];
  createdAt: string;
  updatedAt: string;
}
