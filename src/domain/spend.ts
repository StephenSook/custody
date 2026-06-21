import type { SpendDecision } from "./types";

/**
 * Authorize a purchase against a cumulative cap, in integer minor units (bigint).
 * Authorized only when the running total plus the amount stays at or under the cap.
 * A declined purchase leaves the total unchanged. This is the single source of truth
 * for cap enforcement; it runs identically in every region against the same total.
 */
export function authorizeSpend(
  currentTotalMinor: bigint,
  capMinor: bigint,
  amountMinor: bigint,
): SpendDecision {
  const next = currentTotalMinor + amountMinor;
  if (next <= capMinor) {
    return { authorized: true, newTotalMinor: next };
  }
  return { authorized: false, newTotalMinor: currentTotalMinor };
}
