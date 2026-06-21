import { describe, expect, it } from "vitest";
import { nextConsentStatus } from "@/src/domain/consent";

describe("nextConsentStatus", () => {
  it("maps GRANT to GRANTED", () => {
    expect(nextConsentStatus("GRANT")).toBe("GRANTED");
  });

  it("maps REVOKE to REVOKED", () => {
    expect(nextConsentStatus("REVOKE")).toBe("REVOKED");
  });
});
