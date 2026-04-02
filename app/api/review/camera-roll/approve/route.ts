import { NextResponse } from "next/server";

import { approveCameraOriginals } from "@/lib/camera-roll";
import { rejectUnlessUploadReviewer } from "@/lib/require-upload-reviewer";
import { requireApiSession } from "@/lib/require-api-session";
import { sanitizeDriveFileId } from "@/lib/sanitize";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessUploadReviewer(gate);
  if (denied) {
    return denied;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds =
    typeof body === "object" && body !== null && Array.isArray((body as { fileIds?: unknown }).fileIds)
      ? (body as { fileIds: unknown[] }).fileIds
      : [];

  const fileIds: string[] = [];
  for (const x of rawIds.slice(0, 50)) {
    if (typeof x !== "string") {
      continue;
    }
    const id = sanitizeDriveFileId(x);
    if (id) {
      fileIds.push(id);
    }
  }

  if (fileIds.length === 0) {
    return NextResponse.json({ error: "Provide fileIds: string[] (max 50)" }, { status: 400 });
  }

  try {
    const results = await approveCameraOriginals(fileIds, gate);
    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ results, approved: okCount });
  } catch (e) {
    console.error("review/camera-roll/approve", e);
    return NextResponse.json({ error: "Approve failed" }, { status: 500 });
  }
}
