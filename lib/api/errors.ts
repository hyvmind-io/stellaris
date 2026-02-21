import { NextResponse } from "next/server";

export interface ApiError {
  errors: string[];
}

export function notFound(message = "Not found"): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 404 });
}

export function badRequest(message: string): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 400 });
}

export function validationError(
  issues: { message: string }[],
): NextResponse<ApiError> {
  return NextResponse.json(
    { errors: issues.map((i) => i.message) },
    { status: 422 },
  );
}

export function conflict(
  message = "Resource already exists",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 409 });
}

export function unauthorized(message = "Unauthorized"): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 401 });
}

export function forbidden(message = "Forbidden"): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 403 });
}

export function methodNotAllowed(
  message = "Method not allowed",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 405 });
}

/**
 * 428 Precondition Required — mutable admin writes require `If-Match`.
 */
export function preconditionRequired(
  message = "Missing If-Match header",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 428 });
}

/**
 * 412 Precondition Failed — the `If-Match` revision does not match
 * the current resource revision (optimistic concurrency conflict).
 */
export function preconditionFailed(
  message = "If-Match revision does not match current resource revision",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 412 });
}

export function internalError(
  message = "Internal server error",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 500 });
}
