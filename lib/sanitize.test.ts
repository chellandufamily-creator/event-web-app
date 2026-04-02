import { describe, expect, it } from "vitest";

import { normalizeLoginEmail, sanitizeFirestoreDocId, sanitizeIdList, sanitizeInviteCode } from "./sanitize";

describe("sanitize", () => {
  it("sanitizeFirestoreDocId accepts typical ids", () => {
    expect(sanitizeFirestoreDocId("abc123")).toBe("abc123");
    expect(sanitizeFirestoreDocId("  x_y-Z12  ")).toBe("x_y-Z12");
  });

  it("sanitizeFirestoreDocId rejects empty and unsafe", () => {
    expect(sanitizeFirestoreDocId("")).toBeNull();
    expect(sanitizeFirestoreDocId("../evil")).toBeNull();
    expect(sanitizeFirestoreDocId("a".repeat(200))).toBeNull();
  });

  it("sanitizeInviteCode bounds length", () => {
    expect(sanitizeInviteCode("ok")).toBe("ok");
    expect(sanitizeInviteCode("a".repeat(100))).toBeNull();
  });

  it("sanitizeIdList caps and filters", () => {
    expect(sanitizeIdList(["a", "b", "../x"], 10)).toEqual(["a", "b"]);
    expect(sanitizeIdList(["x"], 0)).toEqual([]);
  });

  it("normalizeLoginEmail lowercases and validates", () => {
    expect(normalizeLoginEmail("  User@Example.COM  ")).toBe("user@example.com");
    expect(normalizeLoginEmail("bad")).toBeNull();
    expect(normalizeLoginEmail("")).toBeNull();
  });
});
