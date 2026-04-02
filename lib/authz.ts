import type { AppRole } from "@/types/auth";

/**
 * Page access (mirrored in root `proxy.ts` for `/`, /admin, /review, /upload).
 * APIs re-check roles from the signed session JWT — never trust client-sent roles.
 *
 * `/` → any valid session (album; proxy redirects anonymous users to /login)
 * /admin → admin only
 * /review → admin or approver (family approver)
 * /upload → uploader or admin (POST /api/upload + proxy)
 */
export function canAccessPath(role: AppRole, pathname: string): boolean {
  if (pathname.startsWith("/admin")) {
    return role === "admin";
  }
  if (pathname.startsWith("/review")) {
    return role === "admin" || role === "approver";
  }
  if (pathname.startsWith("/upload")) {
    return role === "uploader" || role === "admin";
  }
  return true;
}
