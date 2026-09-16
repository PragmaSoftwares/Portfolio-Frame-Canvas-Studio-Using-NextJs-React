/**
 * Portfolio Frame Canvas Studio
 * Operated by Pragma Softwares (https://www.pragmasoftwares.com)
 *
 * Licensed under the PolyForm Noncommercial License 1.0.0 — see LICENSE
 * (or https://polyformproject.org/licenses/noncommercial/1.0.0) for the
 * full terms, LICENSING.md for a plain-English summary.
 *
 * Source: https://github.com/PragmaSoftwares/Portfolio-Frame-Canvas-Studio-Using-NextJs-React
 */

import type { Metadata } from "next";
import { Poppins, Inter, Roboto, Open_Sans, Lato, Montserrat, Nunito, Work_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

// The app's one typeface, everywhere — a rounder, more distinctive geometric
// sans than the generic UI-font look the rest of the stack defaults to.
// Weights cover the app's actual usage: 400/500 for body text, 600/700 for
// headings and emphasis.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// The rest of the "popular fonts" picker offered in Agency settings and the
// canvas editor's text tool (see lib/fonts.ts, the shared list both pull
// from). Declaring the @font-face rules here doesn't cost anything on pages
// that don't use them — a browser only fetches a font file once something
// on the page actually renders with it, so these stay dormant everywhere
// except a canvas text item (or a Settings preview) that picks one. Only
// 400/700 + normal/italic are loaded — exactly what the bold/italic toggles
// in the text tool need, not the font's full weight range.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"] });
const playfairDisplay = Playfair_Display({
  variable: "--font-playfair-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const FONT_VARIABLES = [
  poppins.variable,
  inter.variable,
  roboto.variable,
  openSans.variable,
  lato.variable,
  montserrat.variable,
  nunito.variable,
  workSans.variable,
  playfairDisplay.variable,
].join(" ");

export const metadata: Metadata = {
  title: "Portfolio Frame Canvas Studio",
  description: "Create responsive device mockups from real website screenshots.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${FONT_VARIABLES} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
