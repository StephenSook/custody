import { type ConsentOutcome, recordConsent } from "@/src/data/consentStore";
import type { TxnRunner } from "@/src/data/sql";
import { grantConsentInput, revokeConsentInput } from "@/src/domain/schemas";

/**
 * Consent services: validate raw input with Zod at the boundary, then record the event.
 * The runner is injected so these are unit-tested with a fake; the Server Action supplies
 * the real regional runner.
 */

export async function grantConsent(runner: TxnRunner, raw: unknown): Promise<ConsentOutcome> {
  const input = grantConsentInput.parse(raw);
  return recordConsent(runner, {
    userId: input.userId,
    eventType: "GRANT",
    idempotencyKey: input.idempotencyKey,
  });
}

export async function revokeConsent(runner: TxnRunner, raw: unknown): Promise<ConsentOutcome> {
  const input = revokeConsentInput.parse(raw);
  return recordConsent(runner, {
    userId: input.userId,
    eventType: "REVOKE",
    idempotencyKey: input.idempotencyKey,
  });
}
