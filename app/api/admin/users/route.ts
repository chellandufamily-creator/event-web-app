import { NextResponse } from "next/server";

import { getAdminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { rejectUnlessAdmin } from "@/lib/require-admin";
import { requireApiSession } from "@/lib/require-api-session";
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
    const snap = await getAdminDb().collection(COLLECTIONS.USERS).limit(300).get();
    const users = snap.docs
      .map((d) => {
        const x = d.data();
        const role: AppRole = isAppRole(x.role) ? x.role : "user";
        return {
          id: d.id,
          email: x.email ?? null,
          displayName: x.displayName ?? null,
          role,
          createdAt: x.createdAt?.toDate?.()?.toISOString() ?? null,
          updatedAt: x.updatedAt?.toDate?.()?.toISOString() ?? null,
        };
      })
      .sort((a, b) => {
        const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      })
      .slice(0, 200);
    return NextResponse.json({ users });
  } catch (e) {
    console.error("admin/users GET", e);
    return NextResponse.json({ error: "Failed to list users" }, { status: 500 });
  }
}
