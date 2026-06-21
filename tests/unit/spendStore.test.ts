import { describe, expect, it } from "vitest";
import { recordSpend, setCap } from "@/src/data/spendStore";
import { fakeQuerier, ok } from "../support/fakeQuerier";

const MINOR = "123e4567-e89b-12d3-a456-426614174000";
const IDEM = "00000000-0000-4000-8000-000000000002";
const GEN = "0".repeat(64);

describe("setCap", () => {
  it("upserts the cap projection with the genesis tip", async () => {
    const { txn, calls } = fakeQuerier([ok([], 1)]);
    await setCap(txn, { minorId: MINOR, capMinor: 2000n });
    expect(calls[0]?.text).toContain("spend_total_projection");
    expect(calls[0]?.params).toEqual([MINOR, "2000", GEN]);
  });
});

describe("recordSpend", () => {
  it("authorizes a spend within the cap and advances the total", async () => {
    const { txn, calls } = fakeQuerier([
      ok([{ total_minor: "0", cap_minor: "2000", last_seq: "0", last_entry_hash: GEN }]),
      ok([], 1), // INSERT event
      ok([], 1), // UPDATE projection
    ]);
    const r = await recordSpend(txn, {
      minorId: MINOR,
      amountMinor: 500n,
      currency: "USD",
      idempotencyKey: IDEM,
    });
    expect(r.applied).toBe(true);
    expect(r.authorized).toBe(true);
    expect(r.totalMinor).toBe(500n);
    expect(calls[1]?.text).toContain("INSERT INTO spend_event");
    expect(calls[2]?.text).toContain("UPDATE spend_total_projection");
  });

  it("declines over the cap, records the attempt, and leaves the total unchanged", async () => {
    const { txn, calls } = fakeQuerier([
      ok([
        { total_minor: "1800", cap_minor: "2000", last_seq: "3", last_entry_hash: "a".repeat(64) },
      ]),
      ok([], 1), // INSERT event (declined attempt still recorded)
      ok([], 1), // UPDATE projection (seq + hash advance, total unchanged)
    ]);
    const r = await recordSpend(txn, {
      minorId: MINOR,
      amountMinor: 500n,
      currency: "USD",
      idempotencyKey: IDEM,
    });
    expect(r.authorized).toBe(false);
    expect(r.totalMinor).toBe(1800n);
    expect(calls[2]?.params?.[1]).toBe("1800");
  });

  it("rejects a spend when no cap is configured", async () => {
    const { txn } = fakeQuerier([ok([])]);
    await expect(
      recordSpend(txn, {
        minorId: MINOR,
        amountMinor: 100n,
        currency: "USD",
        idempotencyKey: IDEM,
      }),
    ).rejects.toThrow();
  });

  it("is a no-op on replay and returns the original decision", async () => {
    const { txn, calls } = fakeQuerier([
      ok([
        { total_minor: "500", cap_minor: "2000", last_seq: "1", last_entry_hash: "a".repeat(64) },
      ]),
      ok([], 0), // INSERT -> 0 rows (idempotency conflict)
      ok([{ seq: "1", entry_hash: "b".repeat(64), authorized: true }]),
    ]);
    const r = await recordSpend(txn, {
      minorId: MINOR,
      amountMinor: 500n,
      currency: "USD",
      idempotencyKey: IDEM,
    });
    expect(r.applied).toBe(false);
    expect(r.authorized).toBe(true);
    expect(r.totalMinor).toBe(500n);
    const updates = calls.filter((c) => c.text.includes("UPDATE spend_total_projection"));
    expect(updates.length).toBe(0);
  });

  it("throws on replay if the original spend event cannot be found", async () => {
    const { txn } = fakeQuerier([
      ok([
        { total_minor: "500", cap_minor: "2000", last_seq: "1", last_entry_hash: "a".repeat(64) },
      ]),
      ok([], 0), // INSERT -> 0 rows
      ok([]), // event-by-idem -> none
    ]);
    await expect(
      recordSpend(txn, {
        minorId: MINOR,
        amountMinor: 500n,
        currency: "USD",
        idempotencyKey: IDEM,
      }),
    ).rejects.toThrow();
  });
});
