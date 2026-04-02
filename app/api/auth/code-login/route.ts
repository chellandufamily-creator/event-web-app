import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { sanitizeInviteCode } from "@/lib/sanitize";
import { SESSION_COOKIE_NAME, sessionCookieOptions, signSessionToken } from "@/lib/session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";

export const runtime = "nodejs";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export async function POST(request: Request) {
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server is not configured for Firebase Admin (FIREBASE_SERVICE_ACCOUNT_JSON)." },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const codeRaw =
    typeof body === "object" && body !== null && "code" in body && typeof (body as { code: unknown }).code === "string"
      ? (body as { code: string }).code
      : null;

  const codeSanitized = codeRaw ? sanitizeInviteCode(codeRaw) : null;
  if (!codeSanitized) {
    return NextResponse.json({ error: "Missing or invalid code" }, { status: 400 });
  }

  const normalized = normalizeCode(codeSanitized);

  try {
    const db = getAdminDb();
    const snap = await db.collection(COLLECTIONS.INVITE_CODES).where("code", "==", normalized).limit(1).get();

    if (snap.empty) {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }

    const docRef = snap.docs[0].ref;
    const data = snap.docs[0].data();

    if (data.active === false) {
      return NextResponse.json({ error: "Code is disabled" }, { status: 403 });
    }

    const expiresAt = data.expiresAt as { toDate?: () => Date } | null | undefined;
    if (expiresAt?.toDate && expiresAt.toDate() < new Date()) {
      return NextResponse.json({ error: "Code has expired" }, { status: 403 });
    }

    const maxUses = data.maxUses as number | null | undefined;
    const usedCount = typeof data.usedCount === "number" ? data.usedCount : 0;

    if (maxUses != null && usedCount >= maxUses) {
      return NextResponse.json({ error: "Code has no uses left" }, { status: 403 });
    }

    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(docRef);
      if (!fresh.exists) {
        throw new Error("missing");
      }
      const d = fresh.data()!;
      const u = typeof d.usedCount === "number" ? d.usedCount : 0;
      const max = d.maxUses as number | null | undefined;
      if (d.active === false) {
        throw new Error("inactive");
      }
      if (max != null && u >= max) {
        throw new Error("exhausted");
      }
      tx.update(docRef, { usedCount: FieldValue.increment(1) });
    });

    let role: AppRole = "uploader";
    const gr = data.grantedRole;
    if (isAppRole(gr)) {
      role = gr;
    }

    const session = {
      userId: `code:${docRef.id}`,
      name: typeof data.guestName === "string" && data.guestName.trim() ? data.guestName.trim() : "Guest",
      role,
      authType: "code" as const,
    };

    let token: string;
    try {
      token = await signSessionToken(session);
    } catch {
      return NextResponse.json({ error: "Session could not be created (check SESSION_SECRET)." }, { status: 500 });
    }
    const res = NextResponse.json({ session });
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "inactive") {
      return NextResponse.json({ error: "Code is disabled" }, { status: 403 });
    }
    if (msg === "exhausted") {
      return NextResponse.json({ error: "Code has no uses left" }, { status: 403 });
    }
    if (msg === "missing") {
      return NextResponse.json({ error: "Invalid code" }, { status: 401 });
    }
    console.error("code-login", e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
