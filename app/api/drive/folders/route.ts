import { NextResponse } from "next/server";

import { rejectUnlessAdmin } from "@/lib/require-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { truncateUtf16 } from "@/lib/sanitize";
import { createFolder, isGoogleDriveConfigured } from "@/services/googleDrive";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessAdmin(gate);
  if (denied) {
    return denied;
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json({ error: "Google Drive is not configured on the server" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const nameRaw =
    typeof body === "object" && body !== null && "name" in body && typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name
      : "";
  const name = truncateUtf16(nameRaw.trim().replace(/[\u0000-\u001F\u007F]/g, ""), 256);
  const parentIdRaw =
    typeof body === "object" &&
    body !== null &&
    "parentId" in body &&
    typeof (body as { parentId: unknown }).parentId === "string"
      ? (body as { parentId: string }).parentId
      : "";
  const parentId = parentIdRaw.trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 256);
  if (!name || !parentId) {
    return NextResponse.json({ error: "name and parentId are required" }, { status: 400 });
  }
  try {
    const folder = await createFolder(name, parentId);
    return NextResponse.json({ folder });
  } catch (e) {
    console.error("drive/folders", e);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
