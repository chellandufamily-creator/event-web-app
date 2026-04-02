import type { AppRole } from "@/types/auth";

/**
 * Server-side role for known accounts (overrides Firestore `users/{uid}.role` on email login).
 * - `admin` includes approver-only routes (/review) in this app.
 */
const EMAIL_TO_ROLE: Record<string, AppRole> = {
  "chellandufamily@gmail.com": "admin",
  "sampathr100@gmail.com": "approver",
  "sampath.ramanujam@gmail.com": "user",
};

export function getEmailRoleOverride(email: string | undefined | null): AppRole | null {
  if (!email?.trim()) {
    return null;
  }
  const key = email.trim().toLowerCase();
  return EMAIL_TO_ROLE[key] ?? null;
}
