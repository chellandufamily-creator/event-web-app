import { NextResponse } from "next/server";

import { rejectUnlessAdminOrApprover } from "@/lib/require-admin-or-approver";
import { requireApiSession } from "@/lib/require-api-session";
import {
  getCameraFolderIdFromEnv,
  isGoogleDriveConfigured,
  listCameraRollWithAttribution,
} from "@/services/googleDrive";

export const runtime = "nodejs";

/** Lists the read-only event camera folder; every file is labeled `uploadedBy: "CameraMan"`. Admin/Approver only. */
export async function GET() {
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
  const cameraFolderId = getCameraFolderIdFromEnv();
  if (!cameraFolderId) {
    return NextResponse.json(
      { error: "GOOGLE_DRIVE_CAMERA_FOLDER_ID is not set (open the folder in Drive and copy the ID from the URL)." },
      { status: 503 }
    );
  }
  try {
    const files = await listCameraRollWithAttribution(cameraFolderId);
    return NextResponse.json({ files, folderId: cameraFolderId });
  } catch (e) {
    console.error("drive/camera", e);
    return NextResponse.json({ error: "Failed to list camera folder" }, { status: 500 });
  }
}
