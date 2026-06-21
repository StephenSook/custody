import { describe, expect, it } from "vitest";
import { grantConsent, revokeConsent } from "@/src/services/consentService";
import { fakeQuerier, ok } from "../support/fakeQuerier";

const USER = "123e4567-e89b-12d3-a456-426614174000";
const IDEM = "00000000-0000-4000-8000-000000000001";
const TIP = "a".repeat(64);

describe("grantConsent service", () => {
  it("validates input and records a GRANT", async () => {
    const { txn } = fakeQuerier([ok([]), ok([], 1), ok([], 1)]);
    const r = await grantConsent(txn, { userId: USER, idempotencyKey: IDEM });
    expect(r.status).toBe("GRANTED");
  });

  it("rejects a malformed userId", async () => {
    const { txn } = fakeQuerier([ok([]), ok([], 1), ok([], 1)]);
    await expect(grantConsent(txn, { userId: "nope", idempotencyKey: IDEM })).rejects.toThrow();
  });
});

describe("revokeConsent service", () => {
  it("validates input and records a REVOKE", async () => {
    const { txn } = fakeQuerier([
      ok([{ last_seq: "1", last_entry_hash: TIP }]),
      ok([], 1),
      ok([], 1),
    ]);
    const r = await revokeConsent(txn, { userId: USER, idempotencyKey: IDEM });
    expect(r.status).toBe("REVOKED");
  });
});
