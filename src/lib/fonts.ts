// The single source of truth for "the app's popular font picker" — used by
// both Agency settings' Default font family field and the canvas editor's
// text tool, so both surfaces always offer exactly the same list. Every
// entry except "System UI" is loaded as a real webfont in layout.tsx (see
// the cssVar below); System UI has none by design — it's the OS's own UI
// font, not something to self-host.
export interface FontOption {
  name: string;
  /** The next/font CSS variable declared in layout.tsx, or null for the system font stack. */
  cssVar: string | null;
}

export const FONT_OPTIONS: FontOption[] = [
  { name: "System UI", cssVar: null },
  { name: "Poppins", cssVar: "--font-poppins" },
  { name: "Inter", cssVar: "--font-inter" },
  { name: "Roboto", cssVar: "--font-roboto" },
  { name: "Open Sans", cssVar: "--font-open-sans" },
  { name: "Lato", cssVar: "--font-lato" },
  { name: "Montserrat", cssVar: "--font-montserrat" },
  { name: "Nunito", cssVar: "--font-nunito" },
  { name: "Work Sans", cssVar: "--font-work-sans" },
  { name: "Playfair Display", cssVar: "--font-playfair-display" },
];

export const FONT_FAMILY_NAMES = FONT_OPTIONS.map((f) => f.name);

const SYSTEM_FONT_STACK = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/**
 * Resolves a stored font name (from Settings or a text item) to a real CSS
 * font-family value. Known names use their next/font CSS variable; an
 * unrecognized name (e.g. a legacy custom value someone typed before this
 * was a dropdown) is still passed through as a literal family name rather
 * than silently discarded, so nothing already saved just breaks.
 */
export function cssFontFamily(name: string): string {
  const option = FONT_OPTIONS.find((f) => f.name === name);
  if (!option) return `"${name}", sans-serif`;
  if (!option.cssVar) return SYSTEM_FONT_STACK;
  const genericFallback = option.name === "Playfair Display" ? "serif" : "sans-serif";
  return `var(${option.cssVar}), ${genericFallback}`;
}
