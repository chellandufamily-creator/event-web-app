import { NextResponse } from "next/server";

import type { AuthSession } from "@/types/auth";

/** List/review uploads: admin or approver (e.g. family approver). */
export function rejectUnlessUploadReviewer(session: AuthSession): NextResponse | null {
  if (session.role !== "admin" && session.role !== "approver") {
    return NextResponse.json({ error: "Admin or approver only" }, { status: 403 });
  }
  return null;
}
