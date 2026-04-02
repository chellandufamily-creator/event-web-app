import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { rejectUnlessUploader } from "@/lib/require-uploader";
import { buildUploadSessionFolderName } from "@/lib/upload-folder-name";
import { verifySessionToken } from "@/lib/session-verify";
import {
  findOrCreateFolder,
  getOrEnsureDriveLayout,
  isGoogleDriveConfigured,
  uploadFile,
} from "@/services/googleDrive";
import { COLLECTIONS } from "@/types/firestore-collections";

export const runtime = "nodejs";

/** Large batches / videos may need a higher limit on your host (e.g. reverse proxy). */
export const maxDuration = 300;

function isAllowedMediaType(mime: string, filename: string): boolean {
  if (mime.startsWith("image/") || mime.startsWith("video/")) {
    return true;
  }
  const lower = filename.toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|mp4|webm|mov|m4v|3gp)$/i.test(lower);
}

/** Optional: allow cookie-less multipart tools by passing Authorization: Bearer <session-jwt> */
async function resolveSession(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const session = await verifySessionToken(token);
    if (session) {
      return session;
    }
  }
  return requireApiSession();
}

export async function POST(request: Request) {
  const gate = await resolveSession(request);
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessUploader(gate);
  if (denied) {
    return denied;
  }
  const session = gate;

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin is not configured" }, { status: 503 });
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured" }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const raw = formData.getAll("files");
  const files = raw.filter((x): x is File => x instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "Add at least one file (field name: files)" }, { status: 400 });
  }

  const rootName = process.env.ROOT_FOLDER_NAME?.trim() || "App";

  try {
    const layout = await getOrEnsureDriveLayout();
    if (!layout.uploadsId) {
      return NextResponse.json({ error: "App uploads folder is not ready" }, { status: 503 });
    }

    const folderLabel = buildUploadSessionFolderName(session.name);
    const driveFolder = await findOrCreateFolder(layout.uploadsId, folderLabel);
    const folderPath = `${rootName}/uploads/${folderLabel}`;

    const db = getAdminDb();
    const col = db.collection(COLLECTIONS.UPLOADS);

    const results: {
      originalFilename: string;
      ok: boolean;
      fileId?: string;
      firestoreId?: string;
      error?: string;
    }[] = [];

    for (const file of files) {
      const mime = file.type || "application/octet-stream";
      if (!isAllowedMediaType(mime, file.name)) {
        results.push({
          originalFilename: file.name,
          ok: false,
          error: "Only images and videos are allowed",
        });
        continue;
      }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploaded = await uploadFile(
          {
            buffer,
            filename: file.name || "upload",
            mimeType: mime,
          },
          driveFolder.id
        );

        const sizeNum = uploaded.size != null ? Number(uploaded.size) : buffer.length;

        const docRef = await col.add({
          fileId: uploaded.id,
          uploaderName: session.name,
          folderPath,
          status: "pending",
          approved: false,
          driveFolderId: driveFolder.id,
          originalFilename: file.name || "upload",
          uploadedByUserId: session.userId,
          mimeType: uploaded.mimeType ?? mime,
          sizeBytes: Number.isFinite(sizeNum) ? sizeNum : buffer.length,
          createdAt: FieldValue.serverTimestamp(),
        });

        results.push({
          originalFilename: file.name,
          ok: true,
          fileId: uploaded.id,
          firestoreId: docRef.id,
        });
      } catch (e) {
        results.push({
          originalFilename: file.name,
          ok: false,
          error: e instanceof Error ? e.message : "Upload failed",
        });
      }
    }

    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json(
      {
        folder: {
          driveFolderId: driveFolder.id,
          name: driveFolder.name,
          folderPath,
        },
        results,
        summary: { total: files.length, succeeded: okCount, failed: files.length - okCount },
      },
      { status: okCount > 0 ? 200 : 400 }
    );
  } catch (e) {
    console.error("api/upload", e);
    return NextResponse.json({ error: "Upload batch failed" }, { status: 500 });
  }
}
