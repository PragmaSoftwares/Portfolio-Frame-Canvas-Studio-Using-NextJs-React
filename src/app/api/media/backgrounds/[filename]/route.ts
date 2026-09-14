import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { BACKGROUNDS_ROOT } from "@/lib/storage/paths";

export const runtime = "nodejs";

// Background image ids are nanoid (mixed-case), unlike other media routes' filenames.
const FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp)$/;

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const extension = filename.split(".").pop() ?? "";

  try {
    // Resolved from a fixed data root plus a strictly validated filename (see
    // FILENAME_PATTERN above) — safe against traversal.
    const file = await fs.readFile(/* turbopackIgnore: true */ path.join(BACKGROUNDS_ROOT, filename));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
