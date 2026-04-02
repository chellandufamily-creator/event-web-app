import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth-session-constants";
import { verifySessionToken } from "@/lib/session-verify";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ session: null });
  }
  const session = await verifySessionToken(token);
  return NextResponse.json({ session });
}
