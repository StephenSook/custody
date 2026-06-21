import { describe, expect, it } from "vitest";
import { computeEntryHash, GENESIS_PREV_HASH } from "@/src/crypto/hashChain";
import { planConsentAppend, planSpendAppend } from "@/src/domain/ledger";

describe("planConsentAppend", () => {
  it("starts a chain at seq 1 with the genesis prevHash when there is no tip", async () => {
    const p = await planConsentAppend(null, "GRANT", {});
    expect(p.seq).toBe(1);
    expect(p.prevHash).toBe(GENESIS_PREV_HASH);
    expect(p.status).toBe("GRANTED");
    expect(p.entryHash).toBe(await computeEntryHash(p.body, p.prevHash));
  });

  it("links the next event to the tip and increments seq", async () => {
    const tipHash = "a".repeat(64);
    const p = await planConsentAppend({ lastSeq: 1, lastEntryHash: tipHash }, "REVOKE", {});
    expect(p.seq).toBe(2);
    expect(p.prevHash).toBe(tipHash);
    expect(p.status).toBe("REVOKED");
    expect(p.entryHash).toBe(await computeEntryHash(p.body, tipHash));
  });

  it("includes seq and eventType in the hashed body", async () => {
    const p = await planConsentAppend(null, "GRANT", { actor: "parent" });
    expect(p.body).toMatchObject({ actor: "parent", eventType: "GRANT", seq: 1 });
  });
});

describe("planSpendAppend", () => {
  const tip = { lastSeq: 0, lastEntryHash: GENESIS_PREV_HASH, totalMinor: 0n, capMinor: 2000n };

  it("authorizes a spend within the cap and advances the total", async () => {
    const p = await planSpendAppend(tip, 500n, "USD", {});
    expect(p.authorized).toBe(true);
    expect(p.newTotalMinor).toBe(500n);
    expect(p.seq).toBe(1);
    expect(p.prevHash).toBe(GENESIS_PREV_HASH);
    expect(p.entryHash).toBe(await computeEntryHash(p.body, p.prevHash));
  });

  it("declines over the cap but still advances seq and records the attempt", async () => {
    const p = await planSpendAppend({ ...tip, totalMinor: 1800n }, 500n, "USD", {});
    expect(p.authorized).toBe(false);
    expect(p.newTotalMinor).toBe(1800n);
    expect(p.seq).toBe(1);
    expect(p.entryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("records the authorized flag and amount as a string in the hashed body", async () => {
    const p = await planSpendAppend({ ...tip, totalMinor: 1800n }, 500n, "USD", {});
    expect(p.body).toMatchObject({
      amountMinor: "500",
      currency: "USD",
      authorized: false,
      seq: 1,
    });
  });
});
