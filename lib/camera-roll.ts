import { createHash } from "node:crypto";

import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import {
  deleteFile,
  DrivePolicyError,
  getDriveFileMeta,
  getOrEnsureDriveLayout,
  isGoogleDriveConfigured,
  listCameraRollWithAttribution,
  promoteToAlbum,
} from "@/services/googleDrive";
import { sanitizeDriveFileId, sanitizeFirestoreDocId } from "@/lib/sanitize";
import type { AuthSession } from "@/types/auth";
import { COLLECTIONS } from "@/types/firestore-collections";

export type CameraRollListItem = {
  id: string;
  name: string;
  mimeType: string | null;
  modifiedTime: string | null;
  uploadedBy: "CameraMan";
  source: "camera";
  firestoreId: string | null;
  /** none = no Firestore row; pending; live = in public album; hidden = de-promoted */
  albumState: "none" | "pending" | "live" | "hidden";
};

export type CameraApproveResult =
  | { fileId: string; ok: true; detail?: string; firestoreId?: string }
  | { fileId: string; ok: false; error: string };

/** Stable Firestore doc id for a camera original (hash avoids doc-id length/charset issues). */
export function firestoreDocIdForCameraFile(fileId: string): string {
  const h = createHash("sha256").update(fileId).digest("hex");
  return `cam_${h}`;
}

export async function listCameraRollForReview(): Promise<{
  files: CameraRollListItem[];
  folderId: string | null;
  error?: string;
}> {
  if (!isFirebaseAdminConfigured()) {
    return { files: [], folderId: null, error: "Firebase Admin not configured" };
  }
  if (!isGoogleDriveConfigured()) {
    return { files: [], folderId: null, error: "Google Drive not configured" };
  }

  const layout = await getOrEnsureDriveLayout();
  const cameraFolderId = layout.cameraFolderId;
  if (!cameraFolderId) {
    return { files: [], folderId: null, error: "GOOGLE_DRIVE_CAMERA_FOLDER_ID is not set" };
  }

  const raw = await listCameraRollWithAttribution(cameraFolderId);
  const db = getAdminDb();
  const col = db.collection(COLLECTIONS.UPLOADS);

  const mediaRows = raw.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
  const docReads = await Promise.all(
    mediaRows.map((f) => col.doc(firestoreDocIdForCameraFile(f.id)).get())
  );

  const files: CameraRollListItem[] = mediaRows.map((f, i) => {
    const snap = docReads[i]!;
    const docId = firestoreDocIdForCameraFile(f.id);
    let albumState: CameraRollListItem["albumState"] = "none";
    let firestoreId: string | null = null;

    if (snap.exists) {
      firestoreId = docId;
      const d = snap.data()!;
      const st = d.status as string | undefined;
      const pub = d.inPublicAlbum;
      if (st === "pending") {
        albumState = "pending";
      } else if (st === "approved") {
        albumState = pub === false ? "hidden" : "live";
      } else {
        albumState = "none";
      }
    }

    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType ?? null,
      modifiedTime: f.modifiedTime ?? null,
      uploadedBy: "CameraMan",
      source: "camera" as const,
      firestoreId,
      albumState,
    };
  });

  return { files, folderId: cameraFolderId };
}

export async function approveCameraOriginals(
  rawFileIds: string[],
  session: AuthSession
): Promise<CameraApproveResult[]> {
  if (!isFirebaseAdminConfigured()) {
    return rawFileIds.map((fileId) => ({ fileId, ok: false, error: "Firebase Admin not configured" }));
  }
  if (!isGoogleDriveConfigured()) {
    return rawFileIds.map((fileId) => ({ fileId, ok: false, error: "Google Drive not configured" }));
  }

  const layout = await getOrEnsureDriveLayout();
  if (!layout.albumId || !layout.uploadsId || !layout.cameraFolderId) {
    return rawFileIds.map((fileId) => ({
      fileId,
      ok: false,
      error: "Drive layout or camera folder is not configured",
    }));
  }

  const db = getAdminDb();
  const col = db.collection(COLLECTIONS.UPLOADS);
  const results: CameraApproveResult[] = [];

  for (const raw of rawFileIds) {
    const fileId = sanitizeDriveFileId(raw);
    if (!fileId) {
      results.push({ fileId: raw, ok: false, error: "Invalid file id" });
      continue;
    }

    const docId = firestoreDocIdForCameraFile(fileId);
    const ref = col.doc(docId);

    try {
      let meta: Awaited<ReturnType<typeof getDriveFileMeta>>;
      try {
        meta = await getDriveFileMeta(fileId);
      } catch {
        results.push({ fileId, ok: false, error: "File not found on Google Drive" });
        continue;
      }

      const parents = meta.parents;
      if (!parents.includes(layout.cameraFolderId)) {
        results.push({ fileId, ok: false, error: "File is not in the configured camera folder" });
        continue;
      }

      const snap = await ref.get();
      if (snap.exists) {
        const d = snap.data()!;
        if (d.source !== "camera") {
          results.push({ fileId, ok: false, error: "Firestore conflict: not a camera document" });
          continue;
        }
        if (d.status === "approved" && d.inPublicAlbum !== false) {
          results.push({ fileId, ok: true, detail: "already_live", firestoreId: docId });
          continue;
        }
        if (d.status === "approved" && d.inPublicAlbum === false) {
          results.push({ fileId, ok: false, error: "De-promoted — use Re-promote from the camera roll" });
          continue;
        }
        if (d.status !== "pending") {
          results.push({ fileId, ok: false, error: "Unexpected document state" });
          continue;
        }
      }

      const promote = await promoteToAlbum(fileId, {
        albumFolderId: layout.albumId,
        uploadsFolderId: layout.uploadsId,
        cameraFolderId: layout.cameraFolderId,
      });
      const albumShortcutId = promote.kind === "shortcut" ? promote.shortcutId : null;

      const reviewed = {
        approved: true,
        status: "approved" as const,
        inPublicAlbum: true,
        source: "camera" as const,
        albumShortcutId,
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: session.userId,
        uploaderName: "CameraMan",
        driveFolderId: layout.cameraFolderId,
        folderPath: "(camera)",
        uploadedByUserId: "camera",
      };

      if (snap.exists) {
        await ref.update({
          ...reviewed,
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await ref.set({
          fileId,
          originalFilename: meta.name ?? "Photo",
          mimeType: meta.mimeType ?? null,
          sizeBytes: meta.size != null ? Number(meta.size) : null,
          createdAt: FieldValue.serverTimestamp(),
          ...reviewed,
        });
      }

      results.push({ fileId, ok: true, detail: "promoted", firestoreId: docId });
    } catch (e) {
      if (e instanceof DrivePolicyError) {
        results.push({ fileId, ok: false, error: e.message });
      } else {
        console.error("approveCameraOriginals", fileId, e);
        results.push({ fileId, ok: false, error: e instanceof Error ? e.message : "Approve failed" });
      }
    }
  }

  return results;
}

export async function depromoteCameraOriginal(
  firestoreDocIdRaw: string,
  _session: AuthSession
): Promise<{ ok: true } | { ok: false; error: string }> {
  void _session;
  if (!isFirebaseAdminConfigured()) {
    return { ok: false, error: "Firebase Admin not configured" };
  }
  if (!isGoogleDriveConfigured()) {
    return { ok: false, error: "Google Drive not configured" };
  }

  const docId = sanitizeFirestoreDocId(firestoreDocIdRaw);
  if (!docId) {
    return { ok: false, error: "Invalid document id" };
  }

  const ref = getAdminDb().collection(COLLECTIONS.UPLOADS).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "Document not found" };
  }
  const d = snap.data()!;
  if (d.source !== "camera") {
    return { ok: false, error: "Only camera originals can be de-promoted here" };
  }
  if (d.status !== "approved") {
    return { ok: false, error: "Only approved camera items can be de-promoted" };
  }
  if (d.inPublicAlbum === false) {
    return { ok: false, error: "Already hidden from the album" };
  }

  const shortcutId = typeof d.albumShortcutId === "string" ? d.albumShortcutId.trim() : "";
  try {
    if (shortcutId) {
      await deleteFile(shortcutId);
    }
  } catch (e) {
    if (e instanceof DrivePolicyError) {
      return { ok: false, error: e.message };
    }
    console.error("depromoteCameraOriginal delete shortcut", e);
    return { ok: false, error: e instanceof Error ? e.message : "Failed to remove album shortcut" };
  }

  await ref.update({
    inPublicAlbum: false,
    albumShortcutId: FieldValue.delete(),
    depromotedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
}

export async function repromoteCameraOriginal(
  firestoreDocIdRaw: string,
  session: AuthSession
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isFirebaseAdminConfigured()) {
    return { ok: false, error: "Firebase Admin not configured" };
  }
  if (!isGoogleDriveConfigured()) {
    return { ok: false, error: "Google Drive not configured" };
  }

  const docId = sanitizeFirestoreDocId(firestoreDocIdRaw);
  if (!docId) {
    return { ok: false, error: "Invalid document id" };
  }

  const layout = await getOrEnsureDriveLayout();
  if (!layout.albumId || !layout.uploadsId || !layout.cameraFolderId) {
    return { ok: false, error: "Drive layout or camera folder is not configured" };
  }

  const ref = getAdminDb().collection(COLLECTIONS.UPLOADS).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: "Document not found" };
  }
  const d = snap.data()!;
  if (d.source !== "camera") {
    return { ok: false, error: "Only camera originals can be re-promoted here" };
  }
  if (d.status !== "approved") {
    return { ok: false, error: "Document must be approved" };
  }
  if (d.inPublicAlbum !== false) {
    return { ok: false, error: "Already visible on the album" };
  }

  const fileId = typeof d.fileId === "string" ? sanitizeDriveFileId(d.fileId) : null;
  if (!fileId) {
    return { ok: false, error: "Missing file id on document" };
  }

  try {
    const promote = await promoteToAlbum(fileId, {
      albumFolderId: layout.albumId,
      uploadsFolderId: layout.uploadsId,
      cameraFolderId: layout.cameraFolderId,
    });
    const albumShortcutId = promote.kind === "shortcut" ? promote.shortcutId : null;

    await ref.update({
      inPublicAlbum: true,
      albumShortcutId: albumShortcutId ?? FieldValue.delete(),
      repromotedAt: FieldValue.serverTimestamp(),
      repromotedBy: session.userId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof DrivePolicyError) {
      return { ok: false, error: e.message };
    }
    console.error("repromoteCameraOriginal", e);
    return { ok: false, error: e instanceof Error ? e.message : "Re-promote failed" };
  }
}
