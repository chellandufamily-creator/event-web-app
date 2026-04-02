import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessUploadReviewer } from "@/lib/require-upload-reviewer";
import { requireApiSession } from "@/lib/require-api-session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { UploadStatus } from "@/types/firestore-collections";

export const runtime = "nodejs";

function isUploadStatus(v: string | null): v is UploadStatus | "all" {
  return v === "pending" || v === "approved" || v === "rejected" || v === "all" || v === null;
}

export async function GET(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessUploadReviewer(gate);
  if (denied) {
    return denied;
  }
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
  }

  const statusParam = new URL(request.url).searchParams.get("status");
  const status = statusParam === "" || statusParam === null ? "all" : statusParam;
  if (!isUploadStatus(status)) {
    return NextResponse.json({ error: "Invalid status filter" }, { status: 400 });
  }

  const guestOnly = new URL(request.url).searchParams.get("guestOnly") !== "0";

  try {
    const col = getAdminDb().collection(COLLECTIONS.UPLOADS);
    const snap = await col.orderBy("createdAt", "desc").limit(250).get();

    let uploads = snap.docs.map((d) => {
      const x = d.data();
      const st = (x.status as UploadStatus) || "pending";
      return {
        id: d.id,
        fileId: x.fileId ?? "",
        originalFilename: x.originalFilename ?? "",
        uploaderName: x.uploaderName ?? "",
        folderPath: x.folderPath ?? "",
        status: st,
        approved: x.approved === true,
        mimeType: x.mimeType ?? null,
        sizeBytes: typeof x.sizeBytes === "number" ? x.sizeBytes : null,
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
        thumbnailUrl: x.fileId ? `https://drive.google.com/thumbnail?id=${x.fileId}&sz=w320` : null,
        source: x.source === "camera" ? "camera" : "upload",
      };
    });

    if (guestOnly) {
      uploads = uploads.filter((u) => u.source !== "camera");
    }

    if (status !== "all") {
      uploads = uploads.filter((u) => u.status === status);
    }

    return NextResponse.json({ uploads });
  } catch (e) {
    console.error("admin/uploads GET", e);
    return NextResponse.json(
      {
        error: "Failed to list uploads",
        hint: "Create a Firestore index on uploads(createdAt desc) if this is your first query.",
      },
      { status: 500 }
    );
  }
}
