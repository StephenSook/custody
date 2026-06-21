import type { ConsentStatus } from "@/src/domain/types";
import { type Querier, SELECT_CONSENT_PROJECTION, SELECT_SPEND_PROJECTION } from "./sql";

/**
 * Read-only projection snapshots. Reads are NEVER wrapped in withRetry (DSQL does not
 * conflict-check plain reads), so these take a plain Querier (a pooled connection), not a
 * TxnRunner. Used by the SSE streams and the initial server render.
 */

export interface ConsentSnapshot {
  status: ConsentStatus;
  lastSeq: number;
  lastEntryHash: string;
}

export async function getConsentSnapshot(
  q: Querier,
  userId: string,
): Promise<ConsentSnapshot | null> {
  const res = await q.query(SELECT_CONSENT_PROJECTION, [userId]);
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    status: row.current_status as ConsentStatus,
    lastSeq: Number(row.last_seq),
    lastEntryHash: String(row.last_entry_hash),
  };
}

export interface SpendSnapshot {
  totalMinor: bigint;
  capMinor: bigint;
  lastSeq: number;
}

export async function getSpendSnapshot(q: Querier, minorId: string): Promise<SpendSnapshot | null> {
  const res = await q.query(SELECT_SPEND_PROJECTION, [minorId]);
  const row = res.rows[0];
  if (!row) {
    return null;
  }
  return {
    totalMinor: BigInt(String(row.total_minor)),
    capMinor: BigInt(String(row.cap_minor)),
    lastSeq: Number(row.last_seq),
  };
}
