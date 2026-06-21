import { canonicalJson } from "./canonicalJson";

/** Genesis link for a per-user chain: 64 hex zeros. */
export const GENESIS_PREV_HASH = "0".repeat(64);

export interface ChainEntry {
  readonly seq: number;
  readonly payload: unknown;
  readonly prevHash: string;
  readonly entryHash: string;
}

/**
 * entry_hash = SHA-256( canonicalJSON(payload) + prev_hash ), hex.
 * Uses Web Crypto so the exact same function runs on the server (Node) and in the
 * browser (the live "verify" showpiece), guaranteeing identical digests.
 */
export async function computeEntryHash(payload: unknown, prevHash: string): Promise<string> {
  const data = new TextEncoder().encode(canonicalJson(payload) + prevHash);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toHex(digest);
}

/**
 * Recompute the whole chain and report the first index that does not verify, either
 * because its stored hash does not match the recomputed hash, or because its prevHash
 * does not link to the previous entry (which also catches deletes and reorders).
 *
 * For a deletion, firstBrokenIndex points at the first surviving entry whose prevHash
 * no longer links (the slot after the removed one), since the removed entry is gone.
 * Fails closed: a sparse or holey array returns valid:false rather than skipping.
 */
export async function verifyChain(
  entries: readonly ChainEntry[],
): Promise<{ valid: boolean; firstBrokenIndex: number | null }> {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === undefined) {
      return { valid: false, firstBrokenIndex: i };
    }
    const expectedPrev = i === 0 ? GENESIS_PREV_HASH : entries[i - 1]?.entryHash;
    if (entry.prevHash !== expectedPrev) {
      return { valid: false, firstBrokenIndex: i };
    }
    const recomputed = await computeEntryHash(entry.payload, entry.prevHash);
    if (recomputed !== entry.entryHash) {
      return { valid: false, firstBrokenIndex: i };
    }
  }
  return { valid: true, firstBrokenIndex: null };
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
