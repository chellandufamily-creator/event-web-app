import { NextResponse } from "next/server";

import { listCameraRollForReview } from "@/lib/camera-roll";
import { rejectUnlessUploadReviewer } from "@/lib/require-upload-reviewer";
import { requireApiSession } from "@/lib/require-api-session";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessUploadReviewer(gate);
  if (denied) {
    return denied;
  }

  const { files, folderId, error } = await listCameraRollForReview();
  if (error) {
    return NextResponse.json({ files: [], folderId, error }, { status: 503 });
  }
  return NextResponse.json({ files, folderId });
}
