import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { countCustomFrameUsage } from "@/lib/storage/boards";

export const runtime = "nodejs";

/** Checked before deleting a custom frame, so the confirmation can say exactly what it'll affect. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That id looks invalid." }, { status: 400 });
  }

  const usage = await countCustomFrameUsage(id);
  return NextResponse.json(usage);
}
