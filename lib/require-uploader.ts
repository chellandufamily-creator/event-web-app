import { NextResponse } from "next/server";

import type { AuthSession } from "@/types/auth";

/** POST /api/upload — uploader or admin (matches /upload route guard). */
export function rejectUnlessUploader(session: AuthSession): NextResponse | null {
  if (session.role !== "uploader" && session.role !== "admin") {
    return NextResponse.json({ error: "Uploader or admin role required" }, { status: 403 });
  }
  return null;
}
