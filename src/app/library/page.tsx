import { listCustomFrames } from "@/lib/storage/customFrames";
import { listBackgroundImages } from "@/lib/storage/backgroundImages";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";
import { LibraryManager } from "@/components/library/LibraryManager";

// Reads both libraries straight off disk (fs.readdir/readFile) — without
// this, it'd get statically prerendered once at build time and never
// reflect a frame/background uploaded or deleted afterward. Same fix as
// the Dashboard/Settings pages — see docs/DEV_GUIDE.md.
export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const [customFrames, backgroundImages] = await Promise.all([listCustomFrames(), listBackgroundImages()]);

  return (
    <>
      <AppHeader />
      <LibraryManager initialCustomFrames={customFrames} initialBackgroundImages={backgroundImages} />
      <AppFooter />
    </>
  );
}
