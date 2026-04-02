export type AuthType = "code" | "email";

/** Roles used for route protection and Firestore. */
export type AppRole = "admin" | "approver" | "uploader" | "user";

/** Public session shape (JWT claims + API responses). */
export interface AuthSession {
  userId: string;
  name: string;
  role: AppRole;
  authType: AuthType;
}

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "approver" || value === "uploader" || value === "user";
}
