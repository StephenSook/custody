/** Shared domain types for the consent and spend ledgers. */

export type ConsentEventType = "GRANT" | "REVOKE";
export type ConsentStatus = "GRANTED" | "REVOKED";

export interface SpendDecision {
  readonly authorized: boolean;
  /** The new cumulative total in minor units. Unchanged when a purchase is declined. */
  readonly newTotalMinor: bigint;
}
