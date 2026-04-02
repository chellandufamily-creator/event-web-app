import { NextResponse } from "next/server";

import { depromoteCameraOriginal } from "@/lib/camera-roll";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { sanitizeFirestoreDocId } from "@/lib/sanitize";

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const idRaw =
    typeof body === "object" && body !== null && "id" in body && typeof (body as { id: unknown }).id === "string"
      ? (body as { id: string }).id
      : "";
  const id = sanitizeFirestoreDocId(idRaw.trim());
  if (!id) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  const result = await depromoteCameraOriginal(id, gate);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
