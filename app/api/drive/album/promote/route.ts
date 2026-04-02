import { NextResponse } from "next/server";

import { rejectUnlessAdminOrApprover } from "@/lib/require-admin-or-approver";
import { requireApiSession } from "@/lib/require-api-session";
import {
  DrivePolicyError,
  getOrEnsureDriveLayout,
  isGoogleDriveConfigured,
  promoteToAlbum,
} from "@/services/googleDrive";

export const runtime = "nodejs";

/**
 * Admin/Approver: add a file to the public album.
 * - From event camera folder → Drive shortcut in album (originals stay in place).
 * - From app `uploads` → move into album.
 */
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
    const layout = await getOrEnsureDriveLayout();
    if (!layout.albumId || !layout.uploadsId) {
      return NextResponse.json({ error: "App Drive layout is not ready" }, { status: 503 });
    }
    const result = await promoteToAlbum(fileId, {
      albumFolderId: layout.albumId,
      uploadsFolderId: layout.uploadsId,
      cameraFolderId: layout.cameraFolderId,
    });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof DrivePolicyError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error("drive/album/promote", e);
    return NextResponse.json({ error: "Failed to add file to album" }, { status: 500 });
  }
}
