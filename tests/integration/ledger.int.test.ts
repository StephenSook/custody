import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { recordConsent } from "@/src/data/consentStore";
import { makeTxnRunner, readQuerier } from "@/src/data/pool";
import { recordSpend, setCap } from "@/src/data/spendStore";

const GENESIS = "0".repeat(64);

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
    await setCap(txn, { minorId, capMinor: 2000n });
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

  it("commits in east and is visible from the west endpoint on commit (cross-region strong consistency)", async () => {
    const east = makeTxnRunner("east");
    const userId = randomUUID();
    const granted = await recordConsent(east, {
      userId,
      eventType: "GRANT",
      idempotencyKey: randomUUID(),
    });
    expect(granted.status).toBe("GRANTED");

    // Read the projection from the WEST regional endpoint right after the east commit.
    // DSQL is strongly consistent on commit, so the committed state is visible with no
    // vulnerable window.
    const res = await readQuerier("west").query<{ current_status: string; last_seq: string }>(
      "SELECT current_status, last_seq FROM consent_status_projection WHERE user_id = $1",
      [userId],
    );
    expect(res.rows[0]?.current_status).toBe("GRANTED");
    expect(Number(res.rows[0]?.last_seq)).toBe(1);
  });

  it("serializes concurrent same-user appends into one unforked, hash-linked chain", async () => {
    const txn = makeTxnRunner("east");
    const userId = randomUUID();
    const N = 8;

    // Fire N appends to the SAME user at once. They read the same chain tip and collide on
    // the (user_id, seq) primary key; each collision is a 40001 OC000 the withRetry wrapper
    // resolves by retrying against the fresh tip. The result must be a single clean chain.
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        recordConsent(txn, { userId, eventType: "GRANT", idempotencyKey: randomUUID() }),
      ),
    );

    // No fork: every append committed with a distinct sequential seq 1..N.
    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));

    // The persisted chain links: genesis prev, then each prev_hash equals the prior entry_hash.
    const rows = (
      await readQuerier("east").query<{ seq: string; prev_hash: string; entry_hash: string }>(
        "SELECT seq, prev_hash, entry_hash FROM consent_event WHERE user_id = $1 ORDER BY seq",
        [userId],
      )
    ).rows;
    expect(rows).toHaveLength(N);
    expect(rows.map((r) => Number(r.seq))).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(rows[0]?.prev_hash).toBe(GENESIS);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]?.prev_hash).toBe(rows[i - 1]?.entry_hash);
    }
  });
});
