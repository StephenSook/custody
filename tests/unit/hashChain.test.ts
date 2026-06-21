import { describe, expect, it } from "vitest";
import {
  type ChainEntry,
  computeEntryHash,
  GENESIS_PREV_HASH,
  verifyChain,
} from "@/src/crypto/hashChain";

async function buildChain(payloads: unknown[]): Promise<ChainEntry[]> {
  const entries: ChainEntry[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < payloads.length; i++) {
    const entryHash = await computeEntryHash(payloads[i], prev);
    entries.push({ seq: i, payload: payloads[i], prevHash: prev, entryHash });
    prev = entryHash;
  }
  return entries;
}

describe("GENESIS_PREV_HASH", () => {
  it("is 64 zero hex characters", () => {
    expect(GENESIS_PREV_HASH).toBe("0".repeat(64));
  });
});

describe("computeEntryHash", () => {
  it("returns a 64-character lowercase hex digest", async () => {
    const h = await computeEntryHash({ type: "GRANT" }, GENESIS_PREV_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same payload and prevHash", async () => {
    const a = await computeEntryHash({ type: "GRANT", at: 1 }, GENESIS_PREV_HASH);
    const b = await computeEntryHash({ type: "GRANT", at: 1 }, GENESIS_PREV_HASH);
    expect(a).toBe(b);
  });

  it("is independent of payload key order (canonical JSON)", async () => {
    const a = await computeEntryHash({ type: "GRANT", at: 1 }, GENESIS_PREV_HASH);
    const b = await computeEntryHash({ at: 1, type: "GRANT" }, GENESIS_PREV_HASH);
    expect(a).toBe(b);
  });

  it("changes when prevHash changes", async () => {
    const a = await computeEntryHash({ type: "GRANT" }, GENESIS_PREV_HASH);
    const b = await computeEntryHash({ type: "GRANT" }, "f".repeat(64));
    expect(a).not.toBe(b);
  });

  it("hashes a payload that carries bigint money without throwing", async () => {
    const h = await computeEntryHash({ amountMinor: 2000n, currency: "USD" }, GENESIS_PREV_HASH);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const again = await computeEntryHash(
      { currency: "USD", amountMinor: 2000n },
      GENESIS_PREV_HASH,
    );
    expect(h).toBe(again);
  });
});

describe("verifyChain", () => {
  it("accepts an intact chain", async () => {
    const chain = await buildChain([{ type: "GRANT" }, { type: "REVOKE" }, { type: "GRANT" }]);
    expect(await verifyChain(chain)).toEqual({ valid: true, firstBrokenIndex: null });
  });

  it("accepts an empty chain", async () => {
    expect(await verifyChain([])).toEqual({ valid: true, firstBrokenIndex: null });
  });

  it("pinpoints a tampered payload at the exact index", async () => {
    const chain = await buildChain([{ type: "GRANT" }, { type: "REVOKE" }, { type: "GRANT" }]);
    const tampered = chain.map((e, i) => (i === 1 ? { ...e, payload: { type: "GRANT" } } : e));
    expect(await verifyChain(tampered)).toEqual({ valid: false, firstBrokenIndex: 1 });
  });

  it("pinpoints a broken prevHash link", async () => {
    const chain = await buildChain([{ type: "GRANT" }, { type: "REVOKE" }, { type: "GRANT" }]);
    const broken = chain.map((e, i) => (i === 2 ? { ...e, prevHash: "a".repeat(64) } : e));
    expect(await verifyChain(broken)).toEqual({ valid: false, firstBrokenIndex: 2 });
  });

  it("detects a deleted (reordered) entry via the broken link", async () => {
    const chain = await buildChain([{ type: "GRANT" }, { type: "REVOKE" }, { type: "GRANT" }]);
    const withGap = [chain[0], chain[2]] as ChainEntry[];
    expect(await verifyChain(withGap)).toEqual({ valid: false, firstBrokenIndex: 1 });
  });

  it("rejects a tampered genesis prevHash", async () => {
    const chain = await buildChain([{ type: "GRANT" }]);
    const broken = [{ ...chain[0], prevHash: "b".repeat(64) }] as ChainEntry[];
    expect(await verifyChain(broken)).toEqual({ valid: false, firstBrokenIndex: 0 });
  });
});
