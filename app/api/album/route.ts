import type { CollectionReference } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AlbumItem } from "@/types/album";
import type { AlbumPageResponse } from "@/types/album-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGE = 24;
const MAX_PAGE = 50;
/** Max docs read per request (filtering may drop some). */
const MAX_BATCH = 150;
/** Cursor prefix for in-memory pagination when the composite index is missing. */
const OFFSET_CURSOR_PREFIX = "__o:";
/** Cap for simple mode (no index); avoids unbounded reads. */
const SIMPLE_FETCH_CAP = 500;

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
    thumbUrl: `/api/album/thumbnail?id=${encodeURIComponent(fileId)}&sz=w640`,
    blurThumbUrl: `/api/album/thumbnail?id=${encodeURIComponent(fileId)}&sz=w40`,
    viewUrl:
      kind === "video"
        ? `https://drive.google.com/file/d/${fileId}/preview`
        : `/api/album/view?id=${encodeURIComponent(fileId)}`,
  };
}

async function buildSimpleAlbumPage(
  col: CollectionReference,
  pageSize: number,
  cursor: string | null
): Promise<AlbumPageResponse> {
  const offset = cursor?.startsWith(OFFSET_CURSOR_PREFIX)
    ? Math.max(0, Number.parseInt(cursor.slice(OFFSET_CURSOR_PREFIX.length), 10) || 0)
    : 0;

  const snap = await col.where("status", "==", "approved").limit(SIMPLE_FETCH_CAP).get();
  const docs = [...snap.docs].sort((a, b) => {
    const ta = a.data().createdAt?.toMillis?.() ?? 0;
    const tb = b.data().createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });

  const allItems: AlbumItem[] = [];
  for (const d of docs) {
    const raw = d.data() as Record<string, unknown>;
    if (!isApprovedRecord(raw)) {
      continue;
    }
    const item = toItem(d.id, raw);
    if (item) {
      allItems.push(item);
    }
  }

  const items = allItems.slice(offset, offset + pageSize);
  const nextOffset = offset + items.length;
  const hasMore = nextOffset < allItems.length;

  return {
    items,
    nextCursor: hasMore ? `${OFFSET_CURSOR_PREFIX}${nextOffset}` : null,
    hasMore,
  };
}

export async function GET(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }

  if (!isFirebaseAdminConfigured()) {
    const empty: AlbumPageResponse = { items: [], nextCursor: null, hasMore: false };
    return NextResponse.json({ ...empty, error: "Album unavailable (server config)" });
  }

  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const pageSize = Math.min(MAX_PAGE, Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE));
  const cursor = url.searchParams.get("cursor")?.trim() || null;

  try {
    const col = getAdminDb().collection(COLLECTIONS.UPLOADS);

    if (cursor?.startsWith(OFFSET_CURSOR_PREFIX)) {
      const payload = await buildSimpleAlbumPage(col, pageSize, cursor);
      return NextResponse.json(payload);
    }

    try {
      let q = col.where("status", "==", "approved").orderBy("createdAt", "desc");

      if (cursor) {
        const curSnap = await col.doc(cursor).get();
        if (!curSnap.exists) {
          return NextResponse.json({ error: "Invalid album cursor" }, { status: 400 });
        }
        q = q.startAfter(curSnap);
      }

      const snap = await q.limit(MAX_BATCH).get();

      const items: AlbumItem[] = [];
      let lastProcessedId: string | null = null;

      for (const d of snap.docs) {
        lastProcessedId = d.id;
        const raw = d.data() as Record<string, unknown>;
        if (!isApprovedRecord(raw)) {
          continue;
        }
        const item = toItem(d.id, raw);
        if (item) {
          items.push(item);
        }
        if (items.length >= pageSize) {
          break;
        }
      }

      const hasMore = snap.docs.length === MAX_BATCH;
      const payload: AlbumPageResponse = {
        items,
        nextCursor: hasMore && lastProcessedId ? lastProcessedId : null,
        hasMore,
      };

      return NextResponse.json(payload);
    } catch (indexedErr) {
      console.error(
        "api/album indexed query failed (create composite index: uploads status+createdAt, or use offset pagination)",
        indexedErr
      );
      if (cursor) {
        return NextResponse.json(
          {
            error:
              "Album needs a Firestore composite index on uploads: status (Ascending) + createdAt (Descending). Deploy firestore.indexes.json or use the link in the server log.",
          },
          { status: 503 }
        );
      }
      const payload = await buildSimpleAlbumPage(col, pageSize, null);
      return NextResponse.json(payload);
    }
  } catch (e) {
    console.error("api/album", e);
    return NextResponse.json({ error: "Failed to load album" }, { status: 500 });
  }
}
