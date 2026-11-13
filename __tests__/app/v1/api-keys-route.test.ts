import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type * as ApiKeysModule from "@/lib/auth/api-keys";

const record = { id: 1, name: "admin", description: null, permissions: ["admin"], createdAt: new Date(), expiresAt: null };
const insert = vi.fn(() => ({ select: () => ({ returning: async () => [record] }) }));
const select = vi.fn(() => ({ from: async () => [{ total: 0 }] }));

// Empty api_keys table: the state in which bootstrap used to grant a key.
vi.mock("@/db/client", () => ({ getDb: () => ({ insert, select }) }));
vi.mock("@/lib/auth/api-keys", async (importOriginal) => ({
  ...(await importOriginal<typeof ApiKeysModule>()),
  validateApiKey: vi.fn().mockResolvedValue(null),
}));

import { POST } from "@/app/v1/api-keys/route";

function post(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/v1/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ name: "admin", permissions: ["admin"] }),
  });
}

describe("POST /v1/api-keys without an admin key", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an unauthenticated request on an empty registry", async () => {
    const response = await POST(post());

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects an unknown key on an empty registry", async () => {
    const response = await POST(post({ Authorization: "Bearer stlr_unknown" }));

    expect(response.status).toBe(401);
    expect(insert).not.toHaveBeenCalled();
  });
});
