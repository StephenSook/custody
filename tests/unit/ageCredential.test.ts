import { describe, expect, it } from "vitest";
import { proveAgeBracket, verifyPresentation } from "@/src/crypto/ageCredential";

// Flip the last character of the JWT signature so the presentation no longer verifies.
function tamperSignature(presentation: string): string {
  const parts = presentation.split("~");
  const jwt = (parts[0] ?? "").split(".");
  const sig = jwt[2] ?? "";
  jwt[2] = sig.slice(0, -1) + (sig.slice(-1) === "A" ? "B" : "A");
  parts[0] = jwt.join(".");
  return parts.join("~");
}

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

  it("does not hardcode the bracket", async () => {
    const proof = await proveAgeBracket("2008-03-09", "16-17");
    expect(proof.bracket).toBe("16-17");
  });
});

describe("verifyPresentation", () => {
  it("accepts a genuine presentation against the known issuer key", async () => {
    const proof = await proveAgeBracket("2012-05-01", "13-15");
    const claims = await verifyPresentation(proof.presentation);
    expect(claims.ageBracket).toBe("13-15");
    expect(claims.dob).toBeUndefined();
  });

  it("rejects a presentation whose signature was tampered", async () => {
    const proof = await proveAgeBracket("2012-05-01", "13-15");
    await expect(verifyPresentation(tamperSignature(proof.presentation))).rejects.toThrow();
  });
});
