import { NextResponse } from "next/server";

import type { AuthSession } from "@/types/auth";

export function rejectUnlessAdmin(session: AuthSession): NextResponse | null {
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}
