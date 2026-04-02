import { NextResponse } from "next/server";

import { rejectUnlessDriveAccessor } from "@/lib/require-role";
import { requireApiSession } from "@/lib/require-api-session";
import { getOrEnsureDriveLayout, isGoogleDriveConfigured } from "@/services/googleDrive";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessDriveAccessor(gate);
  if (denied) {
    return denied;
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured on the server" }, { status: 503 });
  }
  try {
    const layout = await getOrEnsureDriveLayout();
    return NextResponse.json({ layout });
  } catch (e) {
    console.error("drive/layout", e);
    return NextResponse.json({ error: "Failed to resolve Drive layout" }, { status: 500 });
  }
}
