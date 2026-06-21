import { describe, expect, it } from "vitest";
import { proveAgeBracket } from "@/src/crypto/ageCredential";

describe("proveAgeBracket", () => {
  it("discloses only the age bracket and never the date of birth", async () => {
    const proof = await proveAgeBracket("2012-05-01", "13-15");
    expect(proof.bracket).toBe("13-15");
    expect(proof.dobDisclosed).toBe(false);
    // The raw DOB must not appear anywhere in the presented token.
    expect(proof.presentation).not.toContain("2012-05-01");
  });

  it("verifies to claims that contain the bracket but not the dob", async () => {
    const proof = await proveAgeBracket("2012-05-01", "13-15");
    expect(proof.verifiedClaims.ageBracket).toBe("13-15");
    expect(proof.verifiedClaims.dob).toBeUndefined();
  });
});
