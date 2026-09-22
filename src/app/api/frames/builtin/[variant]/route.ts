import { NextResponse } from "next/server";
import { saveBuiltinFrameOverride, deleteBuiltinFrameOverride } from "@/lib/storage/builtinFrameOverrides";
import { parseFrameScreenQuad } from "@/lib/canvas/quadValidation";
import type { BuiltinFrameVariant } from "@/types/board";

export const runtime = "nodejs";

const BUILTIN_VARIANTS: BuiltinFrameVariant[] = ["desktop", "laptop", "tablet", "mobile"];

function parseVariant(raw: string): BuiltinFrameVariant | null {
  return (BUILTIN_VARIANTS as string[]).includes(raw) ? (raw as BuiltinFrameVariant) : null;
}

/** Corrects one built-in frame's screen corners — see saveBuiltinFrameOverride. */
export async function PUT(request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant: rawVariant } = await params;
  const variant = parseVariant(rawVariant);
  if (!variant) return NextResponse.json({ error: "Unknown frame variant." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const { quad: rawQuad } = (body ?? {}) as { quad?: unknown };
  const quad = parseFrameScreenQuad(rawQuad);
  if (!quad) return NextResponse.json({ error: "The frame's 4 screen corners are required." }, { status: 400 });

  await saveBuiltinFrameOverride(variant, quad);
  return NextResponse.json({ variant, quad });
}

/** Resets a built-in frame back to its own hardcoded default corners. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ variant: string }> }) {
  const { variant: rawVariant } = await params;
  const variant = parseVariant(rawVariant);
  if (!variant) return NextResponse.json({ error: "Unknown frame variant." }, { status: 400 });

  await deleteBuiltinFrameOverride(variant);
  return NextResponse.json({ ok: true });
}
