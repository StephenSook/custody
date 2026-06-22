import { authorizeSpend } from "./spend";

/**
 * The gate decision a platform makes before letting a minor play or spend. Pure: it takes the
 * strongly-consistent consent and spend state and returns allow/deny with a reason. Consent is
 * checked first, then the cap (reusing authorizeSpend, the single source of cap truth). Runs
 * identically in every region against the same committed state.
 */

export type AccessAction = "play" | "spend";

export interface AccessInput {
  consentGranted: boolean;
  totalMinor: bigint;
  capMinor: bigint;
  action: AccessAction;
  amountMinor: bigint;
}

export interface AccessDecision {
  allow: boolean;
  reason: string;
  spendRemaining: bigint;
}

export function authorizeAccess(input: AccessInput): AccessDecision {
  const spendRemaining = input.capMinor > input.totalMinor ? input.capMinor - input.totalMinor : 0n;

  if (!input.consentGranted) {
    return { allow: false, reason: "consent not granted", spendRemaining };
  }
  if (input.action === "spend") {
    const decision = authorizeSpend(input.totalMinor, input.capMinor, input.amountMinor);
    if (!decision.authorized) {
      return { allow: false, reason: "spend cap reached", spendRemaining };
    }
  }
  return { allow: true, reason: "authorized", spendRemaining };
}
