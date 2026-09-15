import type { Metadata } from "next";
import { Poppins } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Portfolio Frame Canvas Studio",
  description: "Create responsive device mockups from real website screenshots.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
