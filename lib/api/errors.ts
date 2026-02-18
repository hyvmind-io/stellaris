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

export function internalError(
  message = "Internal server error",
): NextResponse<ApiError> {
  return NextResponse.json({ errors: [message] }, { status: 500 });
}
