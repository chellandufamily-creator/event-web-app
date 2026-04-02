import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/require-api-session";
import {
  fetchDriveThumbnail,
  isGoogleDriveConfigured,
  sanitizeDriveFileId,
  sanitizeDriveThumbnailSz,
} from "@/services/googleDrive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }

  const url = new URL(request.url);
  const fileId = sanitizeDriveFileId(url.searchParams.get("id"));
  const sz = sanitizeDriveThumbnailSz(url.searchParams.get("sz")) ?? "w320";

  if (!fileId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Thumbnails unavailable" }, { status: 503 });
  }

  const result = await fetchDriveThumbnail(fileId, sz);
  if (!result.ok) {
    if (result.code === "no_thumbnail") {
      return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
    }
    return NextResponse.json({ error: "Thumbnail failed" }, { status: result.status });
  }

  return new NextResponse(new Uint8Array(result.buffer), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
