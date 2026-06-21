import { GENESIS_PREV_HASH } from "@/src/crypto/hashChain";
import { planSpendAppend } from "@/src/domain/ledger";
import {
  INSERT_SPEND_EVENT,
  SELECT_SPEND_EVENT_BY_IDEM,
  SELECT_SPEND_PROJECTION,
  type TxnRunner,
  UPDATE_SPEND_PROJECTION,
  UPSERT_SPEND_CAP,
} from "./sql";

export interface SetCapInputData {
  minorId: string;
  capMinor: bigint;
  idempotencyKey: string;
}

/**
 * Set or update a minor's spend cap. The projection row is created with total 0 and the
 * genesis tip if it does not exist; otherwise only the cap is updated. Setting a cap is
 * naturally idempotent (last write wins to the same value).
 */
export function setCap(txn: TxnRunner, input: SetCapInputData): Promise<void> {
  return txn.run(async (q) => {
    await q.query(UPSERT_SPEND_CAP, [input.minorId, input.capMinor.toString(), GENESIS_PREV_HASH]);
  });
}

export interface RecordSpendInputData {
  minorId: string;
  amountMinor: bigint;
  currency: string;
  idempotencyKey: string;
  body?: Record<string, unknown>;
}

export interface SpendOutcome {
  applied: boolean;
  authorized: boolean;
  totalMinor: bigint;
  seq: number;
  entryHash: string;
}

/**
 * Authorize a purchase against the cumulative cap, append the attempt (authorized or
 * declined) to the per-minor chain, and advance the projection in one transaction. The
 * total only moves when the purchase is authorized; a declined attempt still advances the
 * seq and chain so the audit trail records it. A replay returns the original decision.
 */
export function recordSpend(txn: TxnRunner, input: RecordSpendInputData): Promise<SpendOutcome> {
  return txn.run(async (q) => {
    const projRes = await q.query(SELECT_SPEND_PROJECTION, [input.minorId]);
    const row = projRes.rows[0];
    if (!row) {
      throw new Error(`no spend cap configured for minor ${input.minorId}`);
    }

    const tip = {
      lastSeq: Number(row.last_seq),
      lastEntryHash: String(row.last_entry_hash),
      totalMinor: BigInt(String(row.total_minor)),
      capMinor: BigInt(String(row.cap_minor)),
    };

    const plan = await planSpendAppend(tip, input.amountMinor, input.currency, input.body ?? {});

    const ins = await q.query(INSERT_SPEND_EVENT, [
      input.minorId,
      plan.seq,
      plan.amountMinor.toString(),
      plan.currency,
      JSON.stringify(plan.body),
      plan.prevHash,
      plan.entryHash,
      input.idempotencyKey,
    ]);

    if (ins.rowCount === 0) {
      const ev = await q.query(SELECT_SPEND_EVENT_BY_IDEM, [input.idempotencyKey]);
      const evRow = ev.rows[0];
      return {
        applied: false,
        authorized: Boolean(evRow?.authorized),
        totalMinor: tip.totalMinor,
        seq: evRow ? Number(evRow.seq) : plan.seq,
        entryHash: evRow ? String(evRow.entry_hash) : plan.entryHash,
      };
    }

    await q.query(UPDATE_SPEND_PROJECTION, [
      input.minorId,
      plan.newTotalMinor.toString(),
      plan.seq,
      plan.entryHash,
    ]);

    return {
      applied: true,
      authorized: plan.authorized,
      totalMinor: plan.newTotalMinor,
      seq: plan.seq,
      entryHash: plan.entryHash,
    };
  });
}
