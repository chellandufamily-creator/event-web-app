import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth-session-constants";
import { clearSessionCookieOptions } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
  return res;
}
