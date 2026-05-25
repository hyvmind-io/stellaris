import { NextResponse, type NextRequest } from "next/server";
import {
  CF_ACCESS_JWT_HEADER,
  isCfAccessEnabled,
} from "@/lib/auth/cf-access-config";
import { verifyCfAccessJwt } from "@/lib/auth/cf-access";
import { bridgeCfAccessSession } from "@/lib/auth/cf-access-bridge";

/**
 * CF Access → app-session bridge.
 *
 * Hit by `middleware.ts` (via internal rewrite) when a request arrives with a
 * verified CF Access identity but no app session cookie. Performs JWT
 * verification, user provisioning, and mints the app cookie session, then
 * redirects to the originally requested path.
 *
 * SAFETY: This endpoint trusts only the cryptographically verified JWT, never
 * the raw `Cf-Access-Authenticated-User-Email` header on its own.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isCfAccessEnabled()) {
    return NextResponse.json({ error: "CF Access not enabled" }, { status: 404 });
  }

  const token = request.headers.get(CF_ACCESS_JWT_HEADER);
  const verified = await verifyCfAccessJwt(token);
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or missing CF Access assertion" },
      { status: 401 },
    );
  }

  try {
    await bridgeCfAccessSession(verified);
  } catch (error) {
    console.error("[cf-access] bridge failed", error);
    return NextResponse.json(
      { error: "Failed to bridge CF Access session" },
      { status: 500 },
    );
  }

  // Always send the user back to a same-origin path; never honor arbitrary URLs.
  const nextParam = request.nextUrl.searchParams.get("next") ?? "/";
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//")
    ? nextParam
    : "/";
  return NextResponse.redirect(new URL(safeNext, request.url));
}

export const GET = handle;
export const POST = handle;
