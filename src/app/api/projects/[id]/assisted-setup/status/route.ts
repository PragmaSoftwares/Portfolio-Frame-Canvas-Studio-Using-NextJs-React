import { NextResponse } from "next/server";
import { assertSafeId } from "@/lib/storage/paths";
import { getAssistedSetupStatus } from "@/lib/capture/assistedSetup";

export const runtime = "nodejs";

// Lets the client recover the "waiting on the opened window" UI state after
// a page refresh — the session itself lives server-side, independent of any
// particular browser tab viewing the dashboard.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;

  let id: string;
  try {
    id = assertSafeId(rawId);
  } catch {
    return NextResponse.json({ error: "That project id looks invalid." }, { status: 400 });
  }

  return NextResponse.json({ status: getAssistedSetupStatus(id) });
}
