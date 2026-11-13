import { describe, it, expect } from "vitest";

import { presignGetUrl } from "@/lib/storage/sigv4";

describe("presignGetUrl", () => {
  // Example from AWS docs: "Authenticating Requests: Using Query Parameters (SigV4)".
  it("matches the AWS reference signature", async () => {
    const url = await presignGetUrl({
      host: "examplebucket.s3.amazonaws.com",
      path: "/test.txt",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      expiresSeconds: 86400,
      now: new Date("2013-05-24T00:00:00Z"),
    });
    expect(new URL(url).searchParams.get("X-Amz-Signature")).toBe(
      "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404",
    );
  });

  it("encodes reserved characters in the object path", async () => {
    const url = await presignGetUrl({
      host: "b.example.test",
      path: "/a b/c(1)'.zip",
      accessKeyId: "AK",
      secretAccessKey: "sk",
      region: "auto",
      expiresSeconds: 60,
    });
    expect(new URL(url).pathname).toBe("/a%20b/c%281%29%27.zip");
  });
});
