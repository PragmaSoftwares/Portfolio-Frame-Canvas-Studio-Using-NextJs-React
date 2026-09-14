import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir, assertSafeId } from "@/lib/storage/paths";

export const runtime = "nodejs";

// Selection filenames include a nanoid suffix, which uses mixed-case + underscores.
const FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.(png|jpg|webp)$/;
const CAPTURE_SUBDIRS = new Set(["desktop", "tablet", "mobile", "selections"]);

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

function contentTypeFor(filename: string): string {
  const extension = filename.split(".").pop() ?? "";
  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function resolveRelativePath(rest: string[]): string | null {
  if (rest[0] === "captures" && rest.length === 3 && CAPTURE_SUBDIRS.has(rest[1]) && FILENAME_PATTERN.test(rest[2])) {
    return path.join("captures", rest[1], rest[2]);
  }
  if (rest[0] === "exports" && rest.length === 2 && FILENAME_PATTERN.test(rest[1])) {
    return path.join("exports", rest[1]);
  }
  return null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; rest: string[] }> }
) {
  const { projectId: rawProjectId, rest } = await params;

  let projectId: string;
  try {
    projectId = assertSafeId(rawProjectId);
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const relativePath = resolveRelativePath(rest);
  if (!relativePath) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Resolved from a fixed data root plus a strictly validated id/subpath (see resolveRelativePath
  // and assertSafeId above) — safe against traversal despite being dynamic from Turbopack's view.
  const filePath = path.join(/* turbopackIgnore: true */ projectDir(projectId), relativePath);

  try {
    const file = await fs.readFile(/* turbopackIgnore: true */ filePath);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": contentTypeFor(relativePath),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
