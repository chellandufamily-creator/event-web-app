import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { normalizeLoginEmail } from "@/lib/sanitize";
import { COLLECTIONS } from "@/types/firestore-collections";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ email: string }> };

export async function DELETE(_request: Request, ctx: RouteCtx) {
  const gate = await requireApiSession();
  if (gate instanceof NextResponse) {
    return gate;
  }
  const denied = rejectUnlessAdmin(gate);
  if (denied) {
    return denied;
  }
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "Firebase Admin not configured" }, { status: 503 });
  }

  const rawParam = (await ctx.params).email;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawParam);
  } catch {
    return NextResponse.json({ error: "Invalid email parameter" }, { status: 400 });
  }

  const emailLower = normalizeLoginEmail(decoded);
  if (!emailLower) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const ref = getAdminDb().collection(COLLECTIONS.EMAIL_INVITES).doc(emailLower);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }
    await ref.update({ active: false });
    return NextResponse.json({ ok: true, emailLower });
  } catch (e) {
    console.error("admin/email-invites DELETE", e);
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}
