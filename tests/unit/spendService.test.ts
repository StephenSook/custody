import { describe, expect, it } from "vitest";
import { recordSpend, setCap } from "@/src/services/spendService";
import { fakeQuerier, ok } from "../support/fakeQuerier";

const MINOR = "123e4567-e89b-12d3-a456-426614174000";
const IDEM = "00000000-0000-4000-8000-000000000002";
const GEN = "0".repeat(64);

describe("setCap service", () => {
  it("validates input and upserts the cap as bigint", async () => {
    const { txn, calls } = fakeQuerier([ok([], 1)]);
    await setCap(txn, { minorId: MINOR, capMinor: 2000, idempotencyKey: IDEM });
    expect(calls[0]?.params).toEqual([MINOR, "2000", GEN]);
  });

  it("rejects a negative cap", async () => {
    const { txn } = fakeQuerier([ok([], 1)]);
    await expect(
      setCap(txn, { minorId: MINOR, capMinor: -5, idempotencyKey: IDEM }),
    ).rejects.toThrow();
  });
});

describe("recordSpend service", () => {
  it("validates input and records an authorized spend", async () => {
    const { txn } = fakeQuerier([
      ok([{ total_minor: "0", cap_minor: "2000", last_seq: "0", last_entry_hash: GEN }]),
      ok([], 1),
      ok([], 1),
    ]);
    const r = await recordSpend(txn, {
      minorId: MINOR,
      amountMinor: 500,
      currency: "USD",
      idempotencyKey: IDEM,
    });
    expect(r.authorized).toBe(true);
    expect(r.totalMinor).toBe(500n);
  });

  it("rejects a non-ISO currency", async () => {
    const { txn } = fakeQuerier([
      ok([{ total_minor: "0", cap_minor: "2000", last_seq: "0", last_entry_hash: GEN }]),
    ]);
    await expect(
      recordSpend(txn, { minorId: MINOR, amountMinor: 500, currency: "usd", idempotencyKey: IDEM }),
    ).rejects.toThrow();
  });
});
