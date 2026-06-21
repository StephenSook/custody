import { computeEntryHash, GENESIS_PREV_HASH } from "@/src/crypto/hashChain";
import { nextConsentStatus } from "./consent";
import { authorizeSpend } from "./spend";
import type { ConsentEventType, ConsentStatus } from "./types";

/**
 * Pure planners that turn the current chain tip plus an input into the exact next
 * ledger entry (seq, prevHash, entryHash, and the body that was hashed). The data
 * layer executes the result inside one OCC-retried transaction. Keeping this pure
 * means the chain-linking and cap logic are unit-tested without a database.
 */

export interface ConsentTip {
  readonly lastSeq: number;
  readonly lastEntryHash: string;
}

export interface PlannedConsentEvent {
  readonly seq: number;
  readonly prevHash: string;
  readonly entryHash: string;
  readonly eventType: ConsentEventType;
  readonly status: ConsentStatus;
  readonly body: Record<string, unknown>;
}

export async function planConsentAppend(
  tip: ConsentTip | null,
  eventType: ConsentEventType,
  extra: Record<string, unknown> = {},
): Promise<PlannedConsentEvent> {
  const seq = (tip?.lastSeq ?? 0) + 1;
  const prevHash = tip?.lastEntryHash ?? GENESIS_PREV_HASH;
  const body: Record<string, unknown> = { ...extra, eventType, seq };
  const entryHash = await computeEntryHash(body, prevHash);
  return { seq, prevHash, entryHash, eventType, status: nextConsentStatus(eventType), body };
}

export interface SpendTip {
  readonly lastSeq: number;
  readonly lastEntryHash: string;
  readonly totalMinor: bigint;
  readonly capMinor: bigint;
}

export interface PlannedSpendEvent {
  readonly authorized: boolean;
  readonly seq: number;
  readonly prevHash: string;
  readonly entryHash: string;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly newTotalMinor: bigint;
  readonly body: Record<string, unknown>;
}

export async function planSpendAppend(
  tip: SpendTip,
  amountMinor: bigint,
  currency: string,
  extra: Record<string, unknown> = {},
): Promise<PlannedSpendEvent> {
  const decision = authorizeSpend(tip.totalMinor, tip.capMinor, amountMinor);
  const seq = tip.lastSeq + 1;
  const prevHash = tip.lastEntryHash;
  const body: Record<string, unknown> = {
    ...extra,
    amountMinor: amountMinor.toString(),
    currency,
    authorized: decision.authorized,
    seq,
  };
  const entryHash = await computeEntryHash(body, prevHash);
  return {
    authorized: decision.authorized,
    seq,
    prevHash,
    entryHash,
    amountMinor,
    currency,
    newTotalMinor: decision.newTotalMinor,
    body,
  };
}
