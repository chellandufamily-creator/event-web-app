import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth-session-constants";
import { canAccessPath } from "@/lib/authz";
import { verifySessionToken } from "@/lib/session-verify";
import type { AppRole } from "@/types/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth/")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (pathname === "/api/album") {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/admin")) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/api/upload") {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role !== "uploader" && session.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/api/approve" || pathname === "/api/reject") {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role !== "admin" && session.role !== "approver") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/review/camera-roll")) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const adminOnly =
      pathname.endsWith("/depromote") || pathname.endsWith("/repromote");
    if (adminOnly) {
      if (session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } else if (session.role !== "admin" && session.role !== "approver") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/drive")) {
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.role === "user") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/review") || pathname.startsWith("/upload")) {
    if (!session) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    if (!canAccessPath(session.role as AppRole, pathname)) {
      return NextResponse.redirect(new URL("/login?error=forbidden", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    if (!session) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", "/");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/api/album",
    "/admin/:path*",
    "/review/:path*",
    "/upload/:path*",
    "/api/admin/:path*",
    "/api/upload",
    "/api/approve",
    "/api/reject",
    "/api/review/camera-roll",
    "/api/review/camera-roll/:path*",
    "/api/drive/:path*",
  ],
};
