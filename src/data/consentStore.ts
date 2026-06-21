import { nextConsentStatus } from "@/src/domain/consent";
import { planConsentAppend } from "@/src/domain/ledger";
import type { ConsentEventType, ConsentStatus } from "@/src/domain/types";
import {
  INSERT_CONSENT_EVENT,
  SELECT_CONSENT_EVENT_BY_IDEM,
  SELECT_CONSENT_TIP,
  type TxnRunner,
  UPSERT_CONSENT_PROJECTION,
} from "./sql";

export interface RecordConsentInput {
  userId: string;
  eventType: ConsentEventType;
  idempotencyKey: string;
  body?: Record<string, unknown>;
}

export interface ConsentOutcome {
  applied: boolean;
  status: ConsentStatus;
  seq: number;
  entryHash: string;
}

/**
 * Append a consent event and update the per-user status projection in one transaction.
 * The composite PK (user_id, seq) serializes concurrent appends (a stale read produces a
 * duplicate key, the commit conflicts, and the OCC wrapper retries with a fresh tip).
 * A replay (same idempotency_key) inserts zero rows via ON CONFLICT and is a no-op.
 */
export function recordConsent(txn: TxnRunner, input: RecordConsentInput): Promise<ConsentOutcome> {
  return txn.run(async (q) => {
    const tipRes = await q.query(SELECT_CONSENT_TIP, [input.userId]);
    const tipRow = tipRes.rows[0];
    const tip = tipRow
      ? { lastSeq: Number(tipRow.last_seq), lastEntryHash: String(tipRow.last_entry_hash) }
      : null;

    const plan = await planConsentAppend(tip, input.eventType, input.body ?? {});

    const ins = await q.query(INSERT_CONSENT_EVENT, [
      input.userId,
      plan.seq,
      plan.eventType,
      JSON.stringify(plan.body),
      plan.prevHash,
      plan.entryHash,
      input.idempotencyKey,
    ]);

    if (ins.rowCount === 0) {
      // Replay: the idempotency key already committed. Return the ORIGINAL event's data,
      // not the freshly computed plan (which reflects the replaying caller's tip/input).
      const existing = await q.query(SELECT_CONSENT_EVENT_BY_IDEM, [input.idempotencyKey]);
      const evRow = existing.rows[0];
      if (!evRow) {
        throw new Error(
          `consent replay: original event missing for idempotency key ${input.idempotencyKey}`,
        );
      }
      return {
        applied: false,
        status: nextConsentStatus(evRow.event_type as ConsentEventType),
        seq: Number(evRow.seq),
        entryHash: String(evRow.entry_hash),
      };
    }

    await q.query(UPSERT_CONSENT_PROJECTION, [input.userId, plan.status, plan.seq, plan.entryHash]);

    return { applied: true, status: plan.status, seq: plan.seq, entryHash: plan.entryHash };
  });
}
