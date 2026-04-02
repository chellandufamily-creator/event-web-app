import { randomBytes } from "crypto";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { sanitizeExpiresDays, sanitizePositiveInt, truncateUtf16 } from "@/lib/sanitize";
import { requireApiSession } from "@/lib/require-api-session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";

export const runtime = "nodejs";

function generateCode(): string {
  return randomBytes(5).toString("hex").toUpperCase().slice(0, 10);
}

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
      .collection(COLLECTIONS.INVITE_CODES)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const codes = snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        code: x.code,
        label: x.label ?? null,
        guestName: x.guestName ?? null,
        grantedRole: x.grantedRole ?? "uploader",
        active: x.active !== false,
        usedCount: typeof x.usedCount === "number" ? x.usedCount : 0,
        maxUses: x.maxUses ?? null,
        createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
        expiresAt: x.expiresAt?.toDate?.()?.toISOString() ?? null,
      };
    });
    return NextResponse.json({ codes });
  } catch (e) {
    console.error("admin/invite-codes GET", e);
    return NextResponse.json({ error: "Failed to list codes" }, { status: 500 });
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

  const labelRaw =
    typeof body === "object" && body !== null && "label" in body && typeof (body as { label: unknown }).label === "string"
      ? (body as { label: string }).label
      : "";
  const label = truncateUtf16(labelRaw.trim().replace(/[\u0000-\u001F\u007F]/g, ""), 200);
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  let grantedRole: AppRole = "uploader";
  const gr = (body as { grantedRole?: unknown }).grantedRole;
  if (isAppRole(gr)) {
    grantedRole = gr;
  }

  let maxUses: number | null = null;
  const muSan = sanitizePositiveInt((body as { maxUses?: unknown }).maxUses, 1_000_000);
  if (muSan != null) {
    maxUses = muSan;
  }

  let expiresAt: Timestamp | null = null;
  const daysSan = sanitizeExpiresDays((body as { expiresInDays?: unknown }).expiresInDays, 365);
  if (daysSan != null) {
    const d = new Date();
    d.setDate(d.getDate() + daysSan);
    expiresAt = Timestamp.fromDate(d);
  }

  const db = getAdminDb();
  const col = db.collection(COLLECTIONS.INVITE_CODES);

  let code = generateCode();
  for (let i = 0; i < 5; i++) {
    const dup = await col.where("code", "==", code).limit(1).get();
    if (dup.empty) {
      break;
    }
    code = generateCode();
  }

  const docRef = col.doc();
  await docRef.set({
    code,
    label,
    guestName: label,
    createdBy: gate.userId,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    maxUses,
    usedCount: 0,
    active: true,
    grantedRole,
  });

  return NextResponse.json({
    invite: {
      id: docRef.id,
      code,
      label,
      grantedRole,
      maxUses,
      expiresAt: expiresAt?.toDate().toISOString() ?? null,
    },
  });
}
