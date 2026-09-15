export interface AgencySettings {
  agencyName: string;
  agencyLogoPath: string | null;
  defaultWatermarkText: string;
  defaultWatermarkVisible: boolean;
  // Styling for the repeating diagonal watermark pattern — shared across every
  // project/board that has a watermark on, so it stays visually consistent
  // (the per-project text/visible toggle lives on ProjectWatermark instead).
  watermarkColor: string; // hex
  watermarkLineWidth: number; // px
  watermarkFontSize: number; // px
  defaultBackgroundLight: string;
  defaultBackgroundDark: string;
  defaultFontFamily: string;
  standardServices: string[];
  updatedAt: string;
}
