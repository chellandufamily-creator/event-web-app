import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/require-api-session";
import {
  fetchDriveFileMediaWebStream,
  isGoogleDriveConfigured,
  sanitizeDriveFileId,
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

  if (!fileId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "View unavailable" }, { status: 503 });
  }

  const result = await fetchDriveFileMediaWebStream(fileId);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not load file" }, { status: result.status });
  }

  return new NextResponse(result.body, {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "private, max-age=120",
    },
  });
}
