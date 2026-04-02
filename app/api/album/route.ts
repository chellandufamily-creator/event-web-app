import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AlbumItem } from "@/types/album";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed-in users only: approved album metadata (same gate as `/` via proxy). */

function isApprovedRecord(data: Record<string, unknown>): boolean {
  if (data.status !== "approved") {
    return false;
  }
  if (data.approved === false) {
    return false;
  }
  if (data.inPublicAlbum === false) {
    return false;
  }
  return true;
}

function toItem(id: string, data: Record<string, unknown>): AlbumItem | null {
  const fileId = typeof data.fileId === "string" ? data.fileId : "";
  if (!fileId) {
    return null;
  }
  const mime = typeof data.mimeType === "string" ? data.mimeType : null;
  const kind = mime?.startsWith("video/") ? "video" : "image";
  const createdAt = data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === "function"
    ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
    : null;

  const source =
    data.source === "camera" ||
    (typeof data.uploaderName === "string" && data.uploaderName.trim() === "CameraMan")
      ? "camera"
      : "upload";

  return {
    id,
    fileId,
    originalFilename: typeof data.originalFilename === "string" ? data.originalFilename : "Photo",
    mimeType: mime,
    uploaderName: typeof data.uploaderName === "string" ? data.uploaderName : "",
    source,
    createdAt,
    kind,
    thumbUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w640`,
    blurThumbUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w40`,
    viewUrl:
      kind === "video"
        ? `https://drive.google.com/file/d/${fileId}/preview`
        : `https://drive.google.com/uc?export=view&id=${fileId}`,
  };
}

export async function GET() {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }

  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ items: [] as AlbumItem[], error: "Album unavailable (server config)" });
  }

  try {
    const col = getAdminDb().collection(COLLECTIONS.UPLOADS);
    const snap = await col.where("status", "==", "approved").limit(500).get();
    const docs = [...snap.docs].sort((a, b) => {
      const ta = a.data().createdAt?.toMillis?.() ?? 0;
      const tb = b.data().createdAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

    const items: AlbumItem[] = [];
    for (const d of docs) {
      const raw = d.data() as Record<string, unknown>;
      if (!isApprovedRecord(raw)) {
        continue;
      }
      const item = toItem(d.id, raw);
      if (item) {
        items.push(item);
      }
    }

    items.sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });

    return NextResponse.json({ items });
  } catch (e) {
    console.error("api/album", e);
    return NextResponse.json({ error: "Failed to load album" }, { status: 500 });
  }
}
