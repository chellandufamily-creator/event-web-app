import { SignJWT } from "jose/jwt/sign";

import type { AuthSession } from "@/types/auth";

import { SESSION_MAX_AGE_SEC } from "@/lib/auth-session-constants";
import { getSessionSecretKey } from "@/lib/session-secret";

export { SESSION_COOKIE_NAME } from "@/lib/auth-session-constants";
export { verifySessionToken } from "@/lib/session-verify";

export async function signSessionToken(session: AuthSession): Promise<string> {
  const key = getSessionSecretKey();
  return new SignJWT({
    userId: session.userId,
    name: session.name,
    role: session.role,
    authType: session.authType,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SEC}s`)
    .sign(key);
}

/** Use Secure cookies in production or when FORCE_SECURE_COOKIES=1 (e.g. HTTPS staging). */
export function sessionCookieSecure(): boolean {
  return process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIES === "1";
}

export function sessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

/** Clears session cookie with the same security flags as set (prevents cookie fixation quirks). */
export function clearSessionCookieOptions() {
  return {
    httpOnly: true as const,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
