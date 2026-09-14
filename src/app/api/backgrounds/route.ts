import { NextResponse } from "next/server";
import { listBackgroundImages, saveBackgroundImage } from "@/lib/storage/backgroundImages";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function GET() {
  const images = await listBackgroundImages();
  return NextResponse.json({ images });
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
    return NextResponse.json({ error: "Only PNG, JPEG, or WebP images are supported." }, { status: 400 });
  }

  const width = Number(formData.get("width"));
  const height = Number(formData.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return NextResponse.json({ error: "Invalid image dimensions." }, { status: 400 });
  }

  const rawName = formData.get("name");
  const originalName = typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : file.name || "background";

  const buffer = Buffer.from(await file.arrayBuffer());
  const image = await saveBackgroundImage(buffer, originalName, extension, width, height);

  return NextResponse.json({ image }, { status: 201 });
}
