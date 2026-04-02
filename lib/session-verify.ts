import { jwtVerify } from "jose/jwt/verify";

import type { AuthSession, AuthType } from "@/types/auth";
import { isAppRole } from "@/types/auth";

import { getSessionSecretKey } from "@/lib/session-secret";

function payloadToSession(payload: Record<string, unknown>): AuthSession | null {
  const userId =
    typeof payload.userId === "string" ? payload.userId : typeof payload.sub === "string" ? payload.sub : null;
  const name = typeof payload.name === "string" ? payload.name : null;
  const role = payload.role;
  const authType = payload.authType;
  if (!userId || !name || !isAppRole(role) || (authType !== "code" && authType !== "email")) {
    return null;
  }
  return {
    userId,
    name,
    role,
    authType: authType as AuthType,
  };
}

/** Edge-safe JWT verify (imports only `jose/jwt/verify`, not the full `jose` entry). */
export async function verifySessionToken(token: string): Promise<AuthSession | null> {
  try {
    const key = getSessionSecretKey();
    const { payload } = await jwtVerify(token, key);
    return payloadToSession(payload as Record<string, unknown>);
  } catch {
    return null;
  }
}
