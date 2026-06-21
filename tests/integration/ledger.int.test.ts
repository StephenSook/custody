import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recordConsent } from "@/src/data/consentStore";
import { makeTxnRunner } from "@/src/data/pool";
import { recordSpend, setCap } from "@/src/data/spendStore";

/**
 * Live integration against a real Aurora DSQL cluster. Skipped unless DSQL_ENDPOINT_EAST
 * is set, so CI (no live DB) skips it. This is the day-0 risk-retirement harness: run it
 * once the two-region cluster exists, plus the concurrent same-user append test that
 * proves exactly one 40001 OC000 and a clean, unforked chain.
 */
const LIVE = Boolean(process.env.DSQL_ENDPOINT_EAST);

describe.skipIf(!LIVE)("ledger integration (live DSQL)", () => {
  it("grant then revoke advances the chain and flips the projection", async () => {
    const txn = makeTxnRunner("east");
    const userId = randomUUID();
    const granted = await recordConsent(txn, {
      userId,
      eventType: "GRANT",
      idempotencyKey: randomUUID(),
    });
    expect(granted.status).toBe("GRANTED");
    const revoked = await recordConsent(txn, {
      userId,
      eventType: "REVOKE",
      idempotencyKey: randomUUID(),
    });
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.seq).toBe(2);
  });

  it("enforces the cumulative spend cap", async () => {
    const txn = makeTxnRunner("east");
    const minorId = randomUUID();
    await setCap(txn, { minorId, capMinor: 2000n, idempotencyKey: randomUUID() });
    const within = await recordSpend(txn, {
      minorId,
      amountMinor: 1500n,
      currency: "USD",
      idempotencyKey: randomUUID(),
    });
    expect(within.authorized).toBe(true);
    const over = await recordSpend(txn, {
      minorId,
      amountMinor: 1000n,
      currency: "USD",
      idempotencyKey: randomUUID(),
    });
    expect(over.authorized).toBe(false);
    expect(over.totalMinor).toBe(1500n);
  });

  it("treats a replayed request as a no-op", async () => {
    const txn = makeTxnRunner("east");
    const userId = randomUUID();
    const idempotencyKey = randomUUID();
    const first = await recordConsent(txn, { userId, eventType: "GRANT", idempotencyKey });
    const replay = await recordConsent(txn, { userId, eventType: "GRANT", idempotencyKey });
    expect(first.applied).toBe(true);
    expect(replay.applied).toBe(false);
  });
});
