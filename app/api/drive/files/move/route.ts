import { NextResponse } from "next/server";

import { rejectUnlessAdminOrApprover } from "@/lib/require-admin-or-approver";
import { requireApiSession } from "@/lib/require-api-session";

export const runtime = "nodejs";

/** Generic moves are disabled — use `POST /api/drive/album/promote` so camera originals stay in the event folder. */
export async function POST() {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessAdminOrApprover(gate);
  if (denied) {
    return denied;
  }
  return NextResponse.json(
    {
      error: "Deprecated",
      detail: "Use POST /api/drive/album/promote with { fileId } so event camera files are not moved (shortcuts are used).",
    },
    { status: 410 }
  );
}
