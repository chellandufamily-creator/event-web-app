import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { sanitizeFirestoreDocId } from "@/lib/sanitize";
import { requireApiSession } from "@/lib/require-api-session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ uid: string }> };

export async function PATCH(request: Request, ctx: RouteCtx) {
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

  const rawUid = (await ctx.params).uid;
  const uid = rawUid ? sanitizeFirestoreDocId(rawUid) : null;
  if (!uid) {
    return NextResponse.json({ error: "Invalid uid" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const roleRaw = (body as { role?: unknown }).role;
  if (!isAppRole(roleRaw)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const role = roleRaw as AppRole;

  try {
    const ref = getAdminDb().collection(COLLECTIONS.USERS).doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: "User document not found. Users appear after they have a Firestore profile." },
        { status: 404 }
      );
    }
    await ref.update({
      role,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, uid, role });
  } catch (e) {
    console.error("admin/users PATCH", e);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
