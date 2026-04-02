import { NextResponse } from "next/server";

import { getEmailRoleOverride } from "@/lib/email-role-overrides";
import { getAdminAuth, getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { tryProvisionUserFromEmailInvite } from "@/lib/provision-email-invite";
import { SESSION_COOKIE_NAME, sessionCookieOptions, signSessionToken } from "@/lib/session";
import { COLLECTIONS } from "@/types/firestore-collections";
import type { AppRole } from "@/types/auth";
import { isAppRole } from "@/types/auth";

export const runtime = "nodejs";

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

  const idToken =
    typeof body === "object" &&
    body !== null &&
    "idToken" in body &&
    typeof (body as { idToken: unknown }).idToken === "string"
      ? (body as { idToken: string }).idToken
      : null;

  const trimmed = idToken?.trim() ?? "";
  if (!trimmed || trimmed.length > 16_384) {
    return NextResponse.json({ error: "Missing or invalid idToken" }, { status: 400 });
  }

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(trimmed);
    const uid = decoded.uid;
    const tokenEmail = decoded.email ?? null;
    const roleOverride = getEmailRoleOverride(tokenEmail);

    const db = getAdminDb();
    let userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();

    if (!userSnap.exists && roleOverride === null && tokenEmail) {
      await tryProvisionUserFromEmailInvite(db, uid, decoded, tokenEmail);
      userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
    }

    let role: AppRole;
    let name: string;

    if (roleOverride !== null) {
      role = roleOverride;
      if (userSnap.exists) {
        const u = userSnap.data()!;
        name =
          (typeof u.displayName === "string" && u.displayName.trim() && u.displayName) ||
          (typeof u.email === "string" && u.email) ||
          tokenEmail ||
          "User";
      } else {
        name = tokenEmail || "User";
      }
    } else {
      if (!userSnap.exists) {
        return NextResponse.json(
          {
            error:
              "No access yet. Ask an admin to invite your email under Admin → Users, or add a Firestore users/{uid} document.",
          },
          { status: 403 }
        );
      }
      const u = userSnap.data()!;
      const roleRaw = u.role;
      role = isAppRole(roleRaw) ? roleRaw : "user";
      name =
        (typeof u.displayName === "string" && u.displayName.trim() && u.displayName) ||
        (typeof u.email === "string" && u.email) ||
        tokenEmail ||
        "User";
    }

    const session = {
      userId: uid,
      name,
      role,
      authType: "email" as const,
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
    console.error("email-login", e);
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}
