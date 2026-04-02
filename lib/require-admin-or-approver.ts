import { NextResponse } from "next/server";

import type { AuthSession } from "@/types/auth";

export function rejectUnlessAdminOrApprover(session: AuthSession): NextResponse | null {
  if (session.role !== "admin" && session.role !== "approver") {
    return NextResponse.json({ error: "Admin or approver role required" }, { status: 403 });
  }
  return null;
}
