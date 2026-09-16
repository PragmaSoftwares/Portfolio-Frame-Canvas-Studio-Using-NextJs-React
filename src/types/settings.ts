export interface AgencySettings {
  agencyName: string;
  agencyLogoPath: string | null;
  defaultWatermarkText: string;
  defaultWatermarkVisible: boolean;
  // Styling for the repeating diagonal watermark pattern — agency-wide, not
  // per-project. defaultWatermarkVisible doubles as a live global switch:
  // when on, every project's exports show the watermark immediately
  // (including already-created projects), not just new ones going forward.
  watermarkColor: string; // hex
  watermarkLineWidth: number; // px
  watermarkFontSize: number; // px
  watermarkOpacity: number; // 0-1 fraction, applied on top of the color (kept separate so the color swatch itself stays true, not pre-faded)
  defaultBackgroundLight: string;
  defaultBackgroundDark: string;
  defaultFontFamily: string;
  updatedAt: string;
}
