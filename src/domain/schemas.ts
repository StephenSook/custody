import { z } from "zod";

/**
 * Input schemas for the four mutations. Every Server Action validates with these at
 * the transport boundary. The client supplies a UUID idempotency key so a replay is
 * a no-op. Money is coerced to bigint minor units; never a float.
 */

const uuid = z.uuid();
const idempotencyKey = z.uuid();

export const grantConsentInput = z.object({
  userId: uuid,
  idempotencyKey,
});

export const revokeConsentInput = z.object({
  userId: uuid,
  idempotencyKey,
});

export const setCapInput = z.object({
  minorId: uuid,
  capMinor: z
    .number()
    .int()
    .nonnegative()
    .transform((n) => BigInt(n)),
  idempotencyKey,
});

export const recordSpendInput = z.object({
  minorId: uuid,
  amountMinor: z
    .number()
    .int()
    .positive()
    .transform((n) => BigInt(n)),
  currency: z.string().regex(/^[A-Z]{3}$/, "currency must be a 3-letter ISO code"),
  idempotencyKey,
});

export type GrantConsentInput = z.infer<typeof grantConsentInput>;
export type RevokeConsentInput = z.infer<typeof revokeConsentInput>;
export type SetCapInput = z.infer<typeof setCapInput>;
export type RecordSpendInput = z.infer<typeof recordSpendInput>;
