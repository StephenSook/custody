import {
  recordSpend as recordSpendStore,
  type SpendOutcome,
  setCap as setCapStore,
} from "@/src/data/spendStore";
import type { TxnRunner } from "@/src/data/sql";
import { recordSpendInput, setCapInput } from "@/src/domain/schemas";

/**
 * Spend services: validate raw input with Zod (coerces money to bigint minor units), then
 * delegate to the store. The runner is injected for unit tests.
 */

export async function setCap(runner: TxnRunner, raw: unknown): Promise<void> {
  const input = setCapInput.parse(raw);
  return setCapStore(runner, { minorId: input.minorId, capMinor: input.capMinor });
}

export async function recordSpend(runner: TxnRunner, raw: unknown): Promise<SpendOutcome> {
  const input = recordSpendInput.parse(raw);
  return recordSpendStore(runner, {
    minorId: input.minorId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    idempotencyKey: input.idempotencyKey,
  });
}
