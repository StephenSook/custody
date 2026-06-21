"use server";

import { createHash } from "node:crypto";
import { proveAgeBracket } from "@/src/crypto/ageCredential";
import type { AgeProofResult } from "@/src/services/dto";

// Synthetic demo subject (no real minor). Issues an SD-JWT with the DOB and bracket both
// disclosable, presents only the bracket, verifies, and reports that the DOB was withheld.
const HIDDEN_CLAIMS = new Set(["iss", "iat", "cnf", "vct", "_sd_alg"]);

export async function proveAgeBracketAction(): Promise<AgeProofResult> {
  try {
    const proof = await proveAgeBracket("2012-05-01", "13-15");
    const credentialHash = createHash("sha256").update(proof.presentation).digest("hex");
    return {
      bracket: proof.bracket,
      dobDisclosed: proof.dobDisclosed,
      credentialHash,
      disclosedClaims: Object.keys(proof.verifiedClaims).filter((key) => !HIDDEN_CLAIMS.has(key)),
    };
  } catch (err) {
    // Surface the real cause server-side; return a safe message the client can render
    // instead of an opaque RSC error digest.
    console.error("[age-actions] proveAgeBracket failed", err);
    throw new Error("age-bracket proof failed");
  }
}
