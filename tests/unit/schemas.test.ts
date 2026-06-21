import { describe, expect, it } from "vitest";
import { grantConsentInput, recordSpendInput, setCapInput } from "@/src/domain/schemas";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const UUID2 = "00000000-0000-4000-8000-000000000000";

describe("grantConsentInput", () => {
  it("accepts valid uuids", () => {
    const parsed = grantConsentInput.parse({ userId: UUID, idempotencyKey: UUID2 });
    expect(parsed.userId).toBe(UUID);
  });

  it("rejects a malformed userId", () => {
    expect(() => grantConsentInput.parse({ userId: "nope", idempotencyKey: UUID2 })).toThrow();
  });

  it("rejects a missing idempotency key", () => {
    expect(() => grantConsentInput.parse({ userId: UUID })).toThrow();
  });
});

describe("recordSpendInput", () => {
  it("coerces a positive integer amount to bigint minor units", () => {
    const parsed = recordSpendInput.parse({
      minorId: UUID,
      amountMinor: 500,
      currency: "USD",
      idempotencyKey: UUID2,
    });
    expect(parsed.amountMinor).toBe(500n);
  });

  it("rejects a zero or negative amount", () => {
    expect(() =>
      recordSpendInput.parse({
        minorId: UUID,
        amountMinor: 0,
        currency: "USD",
        idempotencyKey: UUID2,
      }),
    ).toThrow();
  });

  it("rejects a non-ISO currency code", () => {
    expect(() =>
      recordSpendInput.parse({
        minorId: UUID,
        amountMinor: 100,
        currency: "usd",
        idempotencyKey: UUID2,
      }),
    ).toThrow();
  });
});

describe("setCapInput", () => {
  it("accepts a zero cap as bigint", () => {
    const parsed = setCapInput.parse({ minorId: UUID, capMinor: 0, idempotencyKey: UUID2 });
    expect(parsed.capMinor).toBe(0n);
  });
});
