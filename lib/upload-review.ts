import { FieldValue } from "firebase-admin/firestore";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import {
  deleteFile,
  DrivePolicyError,
  getDriveFileMeta,
  getOrEnsureDriveLayout,
  isGoogleDriveConfigured,
  moveGuestUploadIntoAlbum,
  promoteToAlbum,
} from "@/services/googleDrive";
import { sanitizeFirestoreDocId, sanitizeIdList } from "@/lib/sanitize";
import type { AuthSession } from "@/types/auth";
import { COLLECTIONS } from "@/types/firestore-collections";

export type UploadReviewItemResult =
  | { id: string; ok: true; detail?: string }
  | { id: string; ok: false; error: string };

export function parseUploadReviewIds(body: unknown): string[] {
  if (typeof body !== "object" || body === null) {
    return [];
  }
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.ids)) {
    return sanitizeIdList(o.ids, 100);
  }
  if (typeof o.id === "string") {
    const id = sanitizeFirestoreDocId(o.id);
    return id ? [id] : [];
  }
  return [];
}

type Layout = Awaited<ReturnType<typeof getOrEnsureDriveLayout>>;

async function approveOne(
  docId: string,
  session: AuthSession,
  layout: Layout & { albumId: string; uploadsId: string }
): Promise<UploadReviewItemResult> {
  const ref = getAdminDb().collection(COLLECTIONS.UPLOADS).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { id: docId, ok: false, error: "Document not found" };
  }
  const data = snap.data()!;
  const fileId = typeof data.fileId === "string" ? data.fileId : "";
  if (!fileId) {
    return { id: docId, ok: false, error: "Missing fileId" };
  }

  if (data.status === "approved" && data.approved === true) {
    return { id: docId, ok: true, detail: "already_approved" };
  }
  if (data.status !== "pending") {
    return { id: docId, ok: false, error: "Only pending uploads can be approved" };
  }

  const reviewed = {
    approved: true,
    status: "approved" as const,
    reviewedAt: FieldValue.serverTimestamp(),
    reviewedBy: session.userId,
  };

  try {
    let parents: string[];
    try {
      parents = (await getDriveFileMeta(fileId)).parents;
    } catch {
      return { id: docId, ok: false, error: "File not found on Google Drive" };
    }

    if (parents.includes(layout.albumId)) {
      await ref.update({
        ...reviewed,
        driveFolderId: layout.albumId,
      });
      return { id: docId, ok: true, detail: "synced_already_in_album" };
    }

    if (layout.cameraFolderId && parents.includes(layout.cameraFolderId)) {
      const result = await promoteToAlbum(fileId, {
        albumFolderId: layout.albumId,
        uploadsFolderId: layout.uploadsId,
        cameraFolderId: layout.cameraFolderId,
      });
      const albumShortcutId = result.kind === "shortcut" ? result.shortcutId : null;
      await ref.update({
        ...reviewed,
        source: "camera",
        inPublicAlbum: true,
        albumShortcutId,
        uploaderName: typeof data.uploaderName === "string" && data.uploaderName.trim() ? data.uploaderName : "CameraMan",
      });
      return { id: docId, ok: true, detail: "camera_shortcut" };
    }

    await moveGuestUploadIntoAlbum(fileId, layout.albumId, layout.uploadsId);
    await ref.update({
      ...reviewed,
      driveFolderId: layout.albumId,
    });
    return { id: docId, ok: true, detail: "moved_to_album" };
  } catch (e) {
    if (e instanceof DrivePolicyError) {
      return { id: docId, ok: false, error: e.message };
    }
    throw e;
  }
}

async function rejectOne(docId: string, layout: Layout): Promise<UploadReviewItemResult> {
  const ref = getAdminDb().collection(COLLECTIONS.UPLOADS).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { id: docId, ok: false, error: "Document not found" };
  }
  const data = snap.data()!;
  const fileId = typeof data.fileId === "string" ? data.fileId : "";
  if (!fileId) {
    await ref.delete();
    return { id: docId, ok: true, detail: "removed_orphan_doc" };
  }

  if (data.status !== "pending") {
    return { id: docId, ok: false, error: "Only pending uploads can be rejected" };
  }

  let parents: string[] = [];
  try {
    const meta = await getDriveFileMeta(fileId);
    parents = meta.parents;
  } catch {
    await ref.delete();
    return { id: docId, ok: true, detail: "doc_removed_missing_on_drive" };
  }

  try {
    const inCamera = layout.cameraFolderId && parents.includes(layout.cameraFolderId);

    if (!inCamera) {
      try {
        await deleteFile(fileId);
      } catch (e) {
        if (e instanceof DrivePolicyError) {
          await ref.delete();
          return { id: docId, ok: true, detail: "doc_removed_drive_protected" };
        }
        return { id: docId, ok: false, error: e instanceof Error ? e.message : "Drive delete failed" };
      }
    }

    await ref.delete();
    return { id: docId, ok: true, detail: inCamera ? "camera_doc_only" : "deleted" };
  } catch (e) {
    return { id: docId, ok: false, error: e instanceof Error ? e.message : "Reject failed" };
  }
}

export async function approveUploadDocuments(
  ids: string[],
  session: AuthSession
): Promise<UploadReviewItemResult[]> {
  if (!isFirebaseAdminConfigured()) {
    return ids.map((id) => ({ id, ok: false, error: "Firebase Admin not configured" }));
  }
  if (!isGoogleDriveConfigured()) {
    return ids.map((id) => ({ id, ok: false, error: "Google Drive not configured" }));
  }

  const layout = await getOrEnsureDriveLayout();
  if (!layout.albumId || !layout.uploadsId) {
    return ids.map((id) => ({ id, ok: false, error: "Drive layout not ready" }));
  }

  const results: UploadReviewItemResult[] = [];
  for (const id of ids) {
    results.push(await approveOne(id, session, layout as Layout & { albumId: string; uploadsId: string }));
  }
  return results;
}

export async function rejectUploadDocuments(
  ids: string[],
  _session: AuthSession
): Promise<UploadReviewItemResult[]> {
  void _session;
  if (!isFirebaseAdminConfigured()) {
    return ids.map((id) => ({ id, ok: false, error: "Firebase Admin not configured" }));
  }
  if (!isGoogleDriveConfigured()) {
    return ids.map((id) => ({ id, ok: false, error: "Google Drive not configured" }));
  }

  const layout = await getOrEnsureDriveLayout();
  const results: UploadReviewItemResult[] = [];
  for (const id of ids) {
    results.push(await rejectOne(id, layout));
  }
  return results;
}
