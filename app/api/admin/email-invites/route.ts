import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { requireApiSession } from "@/lib/require-api-session";
import { normalizeLoginEmail, truncateUtf16 } from "@/lib/sanitize";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";

export const runtime = "nodejs";

export async function GET() {
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

  try {
    const snap = await getAdminDb()
      .collection(COLLECTIONS.EMAIL_INVITES)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const invites = snap.docs.map((d) => {
      const x = d.data();
      return {
        emailLower: d.id,
        grantedRole: isAppRole(x.grantedRole) ? x.grantedRole : "uploader",
        active: x.active !== false,
        displayNameHint: x.displayNameHint ?? null,
        createdBy: typeof x.createdBy === "string" ? x.createdBy : null,
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
        consumedAt: x.consumedAt?.toDate?.()?.toISOString() ?? null,
        consumedByUid: x.consumedByUid ?? null,
      };
    });
    return NextResponse.json({ invites });
  } catch (e) {
    console.error("admin/email-invites GET", e);
    return NextResponse.json({ error: "Failed to list email invites" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const emailRaw =
    typeof body === "object" && body !== null && "email" in body && typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email
      : "";
  const emailLower = normalizeLoginEmail(emailRaw);
  if (!emailLower) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  let grantedRole: AppRole = "uploader";
  const gr = (body as { grantedRole?: unknown }).grantedRole;
  if (isAppRole(gr)) {
    grantedRole = gr;
  }

  const hintRaw =
    typeof body === "object" &&
    body !== null &&
    "displayNameHint" in body &&
    typeof (body as { displayNameHint: unknown }).displayNameHint === "string"
      ? (body as { displayNameHint: string }).displayNameHint
      : "";
  const displayNameHint = hintRaw.trim()
    ? truncateUtf16(hintRaw.trim().replace(/[\u0000-\u001F\u007F]/g, ""), 200)
    : null;

  const ref = getAdminDb().collection(COLLECTIONS.EMAIL_INVITES).doc(emailLower);
  await ref.set(
    {
      emailLower,
      grantedRole,
      displayNameHint,
      createdBy: gate.userId,
      createdAt: FieldValue.serverTimestamp(),
      active: true,
      consumedAt: null,
      consumedByUid: null,
    },
    { merge: true }
  );

  return NextResponse.json({
    invite: {
      emailLower,
      grantedRole,
      displayNameHint,
    },
  });
}
