import { describe, expect, it } from "vitest";
import { authorizeSpend } from "@/src/domain/spend";

describe("authorizeSpend", () => {
  it("authorizes a purchase that stays within the cap and advances the total", () => {
    expect(authorizeSpend(0n, 2000n, 500n)).toEqual({ authorized: true, newTotalMinor: 500n });
  });

  it("authorizes a purchase that lands exactly on the cap", () => {
    expect(authorizeSpend(1500n, 2000n, 500n)).toEqual({ authorized: true, newTotalMinor: 2000n });
  });

  it("declines a purchase that would exceed the cap and leaves the total unchanged", () => {
    expect(authorizeSpend(1800n, 2000n, 500n)).toEqual({
      authorized: false,
      newTotalMinor: 1800n,
    });
  });

  it("declines any further purchase once the cap is already reached", () => {
    expect(authorizeSpend(2000n, 2000n, 1n)).toEqual({ authorized: false, newTotalMinor: 2000n });
  });

  it("uses bigint so large minor-unit sums stay exact", () => {
    const big = 9_007_199_254_740_993n; // beyond Number.MAX_SAFE_INTEGER
    expect(authorizeSpend(big, big + 5n, 5n)).toEqual({
      authorized: true,
      newTotalMinor: big + 5n,
    });
  });
});
