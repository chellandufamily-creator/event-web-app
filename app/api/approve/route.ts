import { NextResponse } from "next/server";

import { rejectUnlessUploadReviewer } from "@/lib/require-upload-reviewer";
import { requireApiSession } from "@/lib/require-api-session";
import { approveUploadDocuments, parseUploadReviewIds } from "@/lib/upload-review";

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

  const ids = parseUploadReviewIds(body);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide id or ids[]" }, { status: 400 });
  }

  try {
    const results = await approveUploadDocuments(ids, gate);
    const okCount = results.filter((r) => r.ok).length;
    return NextResponse.json({ results, approved: okCount });
  } catch (e) {
    console.error("api/approve", e);
    return NextResponse.json({ error: "Approve failed" }, { status: 500 });
  }
}
