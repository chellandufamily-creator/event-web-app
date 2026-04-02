import { NextResponse } from "next/server";

import { rejectUnlessAdminOrApprover } from "@/lib/require-admin-or-approver";
import { requireApiSession } from "@/lib/require-api-session";
import { DrivePolicyError, deleteFile, isGoogleDriveConfigured } from "@/services/googleDrive";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessAdminOrApprover(gate);
  if (denied) {
    return denied;
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured on the server" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const fileId =
    typeof body === "object" && body !== null && "fileId" in body && typeof (body as { fileId: unknown }).fileId === "string"
      ? (body as { fileId: string }).fileId.trim()
      : "";
  if (!fileId) {
    return NextResponse.json({ error: "fileId is required" }, { status: 400 });
  }
  try {
    await deleteFile(fileId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DrivePolicyError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    console.error("drive/files/delete", e);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}
