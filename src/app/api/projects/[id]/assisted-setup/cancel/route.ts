import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { cancelAssistedSetup } from "@/lib/capture/assistedSetup";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  const closed = await cancelAssistedSetup(id);
  return NextResponse.json({ closed });
}
