import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME, getSessionSecret } from "@/lib/auth/constants";

// Public routes — never redirect, no auth check
const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/unauthorized"]);
const PUBLIC_PREFIXES = [
  "/.well-known",
  "/health",
  "/v1/", // API routes use their own Bearer token auth via requireAuth()
  "/_next/",
  "/favicon",
];

// Protected routes — require session cookie
const PROTECTED_PREFIXES = ["/modules", "/providers", "/admin", "/profile"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isAuthPage(pathname: string): boolean {
  return pathname === "/login" || pathname === "/signup";
}

async function verifySession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, getSessionSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Always allow public paths and API routes
  if (isPublic(pathname)) {
    // If user is on login/signup page and is already authenticated, redirect to home
    if (isAuthPage(pathname)) {
      const isAuthenticated = await verifySession(request);
      if (isAuthenticated) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // Protected routes require authentication
  if (isProtected(pathname)) {
    const isAuthenticated = await verifySession(request);
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
