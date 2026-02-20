import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME, getSessionSecret } from "@/lib/auth/constants";

const isPrivateRegistry = (process.env.PRIVATE_REGISTRY ?? "true") === "true";

// Auth pages — always public (must be reachable to log in)
const AUTH_PATHS = new Set(["/login", "/signup", "/unauthorized"]);

// Infrastructure prefixes — always public regardless of private mode
const INFRA_PREFIXES = [
  "/.well-known",
  "/health",
  "/v1/", // API routes use their own Bearer token auth via requireAuth()
  "/_next/",
  "/favicon",
];

// In public mode, these paths are also public (no auth required)
const PUBLIC_MODE_PATHS = new Set(["/"]);

function isAlwaysPublic(pathname: string): boolean {
  if (AUTH_PATHS.has(pathname)) return true;
  return INFRA_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicModePath(pathname: string): boolean {
  return PUBLIC_MODE_PATHS.has(pathname);
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

  // Infrastructure + auth pages — always allowed
  if (isAlwaysPublic(pathname)) {
    // Redirect authenticated users away from login/signup
    if (isAuthPage(pathname)) {
      const isAuthenticated = await verifySession(request);
      if (isAuthenticated) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  // In public mode, additional paths are public
  if (!isPrivateRegistry && isPublicModePath(pathname)) {
    return NextResponse.next();
  }

  // Everything else requires authentication
  // In private mode: includes "/", "/modules", "/providers", "/admin", "/profile", etc.
  // In public mode: includes "/modules", "/providers", "/admin", "/profile", etc.
  const isAuthenticated = await verifySession(request);
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
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
