import { NextResponse } from "next/server";
import { listCustomFrames, saveCustomFrame } from "@/lib/storage/customFrames";
import { parseFrameScreenQuad } from "@/lib/canvas/quadValidation";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// No JPG — a frame image needs a genuinely transparent screen cutout, and
// JPG has no alpha channel at all (it'd silently show a solid white/black
// box where the screenshot should go instead). PNG and WebP both support
// real transparency.
const ALLOWED_TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp" };

export async function GET() {
  const frames = await listCustomFrames();
  return NextResponse.json({ frames });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected an image upload." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was provided." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "That image is too large (15MB limit)." }, { status: 400 });
  }
  const extension = ALLOWED_TYPES[file.type];
  if (!extension) {
    return NextResponse.json(
      { error: "Only PNG or WebP images are supported — a frame needs a transparent screen area, which JPG can't have." },
      { status: 400 }
    );
  }

  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "Invalid image dimensions." }, { status: 400 });
  }

  const quad = parseFrameScreenQuad(formData.get("quad"));
  if (!quad) {
    return NextResponse.json({ error: "The frame's 4 screen corners are required." }, { status: 400 });
  }

  const rawName = formData.get("name");
  const name = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : file.name || "Custom frame";

  const buffer = Buffer.from(await file.arrayBuffer());
  const frame = await saveCustomFrame(buffer, name, extension, width, height, quad);

  return NextResponse.json({ frame }, { status: 201 });
}
