import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME, getSessionSecret } from "@/lib/auth/constants";
import {
  CF_ACCESS_JWT_HEADER,
  isCfAccessEnabled,
} from "@/lib/auth/cf-access-config";

const isPrivateRegistry = (process.env.PRIVATE_REGISTRY ?? "true") === "true";

// Auth pages — always public (must be reachable to log in)
const AUTH_PATHS = new Set(["/login", "/signup", "/unauthorized"]);

const CF_ACCESS_BRIDGE_PATH = "/api/auth/cf-access-bridge";

// Infrastructure prefixes — always public regardless of private mode
const INFRA_PREFIXES = [
  "/.well-known",
  "/health",
  "/v1/", // API routes use their own Bearer token auth via requireAuth()
  "/_next/",
  "/favicon",
  CF_ACCESS_BRIDGE_PATH, // internal CF Access bridge — guards itself
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

/**
 * If the request carries a CF Access JWT but no app session cookie, redirect
 * to the bridge endpoint so it can cryptographically verify the JWT,
 * provision the user, and mint the app session cookie. Returns null when no
 * Access bridging is applicable.
 *
 * Cookie session takes precedence over Access (cheaper, no JWKS fetch on the
 * hot path) and the bridge is only used to bootstrap the cookie.
 */
function maybeBridgeCfAccess(request: NextRequest): NextResponse | null {
  if (!isCfAccessEnabled()) return null;
  if (request.cookies.get(SESSION_COOKIE_NAME)) return null;
  if (!request.headers.get(CF_ACCESS_JWT_HEADER)) return null;

  const { pathname, search } = request.nextUrl;
  const bridgeUrl = new URL(CF_ACCESS_BRIDGE_PATH, request.url);
  bridgeUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(bridgeUrl);
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

  // In public mode, additional paths are public — but still bridge a CF Access
  // identity so signed-in Access users land with a usable app session.
  if (!isPrivateRegistry && isPublicModePath(pathname)) {
    const bridge = maybeBridgeCfAccess(request);
    if (bridge) return bridge;
    return NextResponse.next();
  }

  // Cookie session wins — avoids JWKS round-trip on every hop.
  const isAuthenticated = await verifySession(request);
  if (isAuthenticated) {
    return NextResponse.next();
  }

  // No cookie session — try to bridge from a verified CF Access assertion.
  const bridge = maybeBridgeCfAccess(request);
  if (bridge) return bridge;

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
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
