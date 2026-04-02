import { NextResponse } from "next/server";

import { rejectUnlessAdminOrApprover } from "@/lib/require-admin-or-approver";
import { rejectUnlessDriveAccessor } from "@/lib/require-role";
import { rejectUnlessUploader } from "@/lib/require-uploader";
import { requireApiSession } from "@/lib/require-api-session";
import {
  getCameraFolderIdFromEnv,
  getImmutableFolderIds,
  getOrEnsureDriveLayout,
  isGoogleDriveConfigured,
  listFiles,
  uploadFile,
} from "@/services/googleDrive";

export const runtime = "nodejs";

function isRestrictedBrowseFolder(folderId: string): boolean {
  const immutable = getImmutableFolderIds();
  if (immutable.has(folderId)) {
    return true;
  }
  const camera = getCameraFolderIdFromEnv();
  return Boolean(camera && folderId === camera);
}

export async function GET(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const driveDenied = rejectUnlessDriveAccessor(gate);
  if (driveDenied) {
    return driveDenied;
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured on the server" }, { status: 503 });
  }
  const folderId = new URL(request.url).searchParams.get("folderId")?.trim();
  if (!folderId) {
    return NextResponse.json({ error: "folderId query required" }, { status: 400 });
  }
  if (isRestrictedBrowseFolder(folderId)) {
    const denied = rejectUnlessAdminOrApprover(gate);
    if (denied) {
      return denied;
    }
  }
  try {
    const files = await listFiles(folderId);
    return NextResponse.json({ files });
  } catch (e) {
    console.error("drive/files GET", e);
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const upDenied = rejectUnlessUploader(gate);
  if (upDenied) {
    return upDenied;
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured on the server" }, { status: 503 });
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const rawFolderId = formData.get("folderId");
  const folderId = typeof rawFolderId === "string" ? rawFolderId.trim() : "";
  const file = formData.get("file");
  if (!folderId || !(file instanceof File)) {
    return NextResponse.json({ error: "folderId and file are required" }, { status: 400 });
  }
  try {
    const layout = await getOrEnsureDriveLayout();
    if (!layout.uploadsId) {
      return NextResponse.json({ error: "App uploads folder is not ready" }, { status: 503 });
    }
    if (folderId !== layout.uploadsId) {
      return NextResponse.json(
        { error: "Uploads are only allowed to the app uploads folder (use GET /api/drive/layout for its id)." },
        { status: 403 }
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await uploadFile(
      { buffer, filename: file.name || "upload", mimeType: file.type || "application/octet-stream" },
      folderId
    );
    return NextResponse.json({ file: uploaded });
  } catch (e) {
    console.error("drive/files POST", e);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }
}
