import { describe, expect, it } from "vitest";
import { authorizeAccess } from "@/src/domain/authorize";

const base = { consentGranted: true, totalMinor: 0n, capMinor: 2000n, amountMinor: 0n };

describe("authorizeAccess", () => {
  it("allows play when consent is granted", () => {
    const d = authorizeAccess({ ...base, action: "play" });
    expect(d.allow).toBe(true);
  });

  it("denies play when consent is not granted", () => {
    const d = authorizeAccess({ ...base, consentGranted: false, action: "play" });
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/consent/i);
  });

  it("allows a spend within the cap", () => {
    const d = authorizeAccess({ ...base, action: "spend", totalMinor: 500n, amountMinor: 1000n });
    expect(d.allow).toBe(true);
  });

  it("denies a spend that breaches the cap", () => {
    const d = authorizeAccess({ ...base, action: "spend", totalMinor: 500n, amountMinor: 1800n });
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/cap/i);
  });

  it("denies a spend when consent is revoked, before checking the cap", () => {
    const d = authorizeAccess({
      ...base,
      consentGranted: false,
      action: "spend",
      amountMinor: 1n,
    });
    expect(d.allow).toBe(false);
    expect(d.reason).toMatch(/consent/i);
  });

  it("reports remaining headroom, floored at zero", () => {
    expect(authorizeAccess({ ...base, action: "play", totalMinor: 1500n }).spendRemaining).toBe(
      500n,
    );
    expect(authorizeAccess({ ...base, action: "play", totalMinor: 2500n }).spendRemaining).toBe(0n);
  });
});
