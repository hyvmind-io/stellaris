import { describe, it, expect } from "vitest";
import {
  notFound,
  badRequest,
  validationError,
  conflict,
  preconditionRequired,
  preconditionFailed,
  internalError,
} from "@/lib/api/errors";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse the JSON body from a NextResponse returned by error helpers.
 * NextResponse.json() stores the body as a ReadableStream; calling .json()
 * on the Response resolves it.
 */
async function parseBody(response: Response): Promise<{ errors: string[] }> {
  return response.json();
}

// ============================================================================
// notFound
// ============================================================================

describe("notFound", () => {
  it("returns status 404", async () => {
    const response = notFound();
    expect(response.status).toBe(404);
  });

  it("uses the default message when none is provided", async () => {
    const body = await parseBody(notFound());
    expect(body.errors).toEqual(["Not found"]);
  });

  it("uses the custom message when provided", async () => {
    const body = await parseBody(notFound("Module not found"));
    expect(body.errors).toEqual(["Module not found"]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(notFound());
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array has exactly one entry by default", async () => {
    const body = await parseBody(notFound());
    expect(body.errors).toHaveLength(1);
  });
});

// ============================================================================
// badRequest
// ============================================================================

describe("badRequest", () => {
  it("returns status 400", async () => {
    const response = badRequest("Invalid input");
    expect(response.status).toBe(400);
  });

  it("includes the provided message in the errors array", async () => {
    const body = await parseBody(badRequest("Invalid input"));
    expect(body.errors).toEqual(["Invalid input"]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(badRequest("oops"));
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array has exactly one entry", async () => {
    const body = await parseBody(badRequest("bad"));
    expect(body.errors).toHaveLength(1);
  });
});

// ============================================================================
// validationError
// ============================================================================

describe("validationError", () => {
  it("returns status 422", async () => {
    const response = validationError([{ message: "field required" }]);
    expect(response.status).toBe(422);
  });

  it("maps each issue to its message in the errors array", async () => {
    const issues = [
      { message: "namespace is required" },
      { message: "version must be semver" },
    ];
    const body = await parseBody(validationError(issues));
    expect(body.errors).toEqual([
      "namespace is required",
      "version must be semver",
    ]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(validationError([{ message: "err" }]));
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array length matches the number of issues", async () => {
    const issues = [{ message: "a" }, { message: "b" }, { message: "c" }];
    const body = await parseBody(validationError(issues));
    expect(body.errors).toHaveLength(3);
  });

  it("handles a single issue", async () => {
    const body = await parseBody(
      validationError([{ message: "single error" }]),
    );
    expect(body.errors).toEqual(["single error"]);
  });

  it("handles an empty issues array", async () => {
    const body = await parseBody(validationError([]));
    expect(body.errors).toEqual([]);
  });
});

// ============================================================================
// conflict
// ============================================================================

describe("conflict", () => {
  it("returns status 409", async () => {
    const response = conflict();
    expect(response.status).toBe(409);
  });

  it("uses the default message when none is provided", async () => {
    const body = await parseBody(conflict());
    expect(body.errors).toEqual(["Resource already exists"]);
  });

  it("uses the custom message when provided", async () => {
    const body = await parseBody(conflict("Module version already published"));
    expect(body.errors).toEqual(["Module version already published"]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(conflict());
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array has exactly one entry by default", async () => {
    const body = await parseBody(conflict());
    expect(body.errors).toHaveLength(1);
  });
});

// ============================================================================
// preconditionRequired
// ============================================================================

describe("preconditionRequired", () => {
  it("returns status 428", async () => {
    const response = preconditionRequired();
    expect(response.status).toBe(428);
  });

  it("uses the default message when none is provided", async () => {
    const body = await parseBody(preconditionRequired());
    expect(body.errors).toEqual(["Missing If-Match header"]);
  });
});

// ============================================================================
// preconditionFailed
// ============================================================================

describe("preconditionFailed", () => {
  it("returns status 412", async () => {
    const response = preconditionFailed();
    expect(response.status).toBe(412);
  });

  it("uses the default message when none is provided", async () => {
    const body = await parseBody(preconditionFailed());
    expect(body.errors).toEqual([
      "If-Match revision does not match current resource revision",
    ]);
  });

  it("uses the custom message when provided", async () => {
    const body = await parseBody(
      preconditionFailed("Revision mismatch on module"),
    );
    expect(body.errors).toEqual(["Revision mismatch on module"]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(preconditionFailed());
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array has exactly one entry by default", async () => {
    const body = await parseBody(preconditionFailed());
    expect(body.errors).toHaveLength(1);
  });
});

// ============================================================================
// internalError
// ============================================================================

describe("internalError", () => {
  it("returns status 500", async () => {
    const response = internalError();
    expect(response.status).toBe(500);
  });

  it("uses the default message when none is provided", async () => {
    const body = await parseBody(internalError());
    expect(body.errors).toEqual(["Internal server error"]);
  });

  it("uses the custom message when provided", async () => {
    const body = await parseBody(internalError("Database connection failed"));
    expect(body.errors).toEqual(["Database connection failed"]);
  });

  it("returns a body with an 'errors' array", async () => {
    const body = await parseBody(internalError());
    expect(body).toHaveProperty("errors");
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it("errors array has exactly one entry by default", async () => {
    const body = await parseBody(internalError());
    expect(body.errors).toHaveLength(1);
  });
});
