import { NextResponse } from "next/server";

import type { AppRole, AuthSession } from "@/types/auth";

/** Reject with 403 unless JWT session role is one of `allowed` (server-derived; never trust the client). */
export function rejectUnlessRoleIn(session: AuthSession, allowed: readonly AppRole[]): NextResponse | null {
  if (!allowed.includes(session.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Admin, approver, or uploader — blocks end-user `user` role from Drive and similar surfaces. */
export const DRIVE_ACCESS_ROLES: readonly AppRole[] = ["admin", "approver", "uploader"];

export function rejectUnlessDriveAccessor(session: AuthSession): NextResponse | null {
  return rejectUnlessRoleIn(session, DRIVE_ACCESS_ROLES);
}
