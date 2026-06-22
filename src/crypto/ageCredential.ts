import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { SDJwtInstance } from "@sd-jwt/core";

/**
 * Real SD-JWT selective disclosure for an age bracket. The issuer encodes both the DOB and
 * the bracket as selectively-disclosable claims; the holder presents ONLY the bracket; the
 * verifier sees the bracket and never the DOB. This is the honest equivalent of a ZKP for
 * the demo (no full ZKP, and no holder key binding, is claimed). Runs server-side
 * (node:crypto, bring-your-own-crypto).
 */

// A stable per-process issuer keypair, generated once at module load, so a presentation can be
// verified against a KNOWN issuer key rather than a fresh key per call. Server-only (this
// module is imported only by the "use server" action and the unit tests).
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

const sdjwt = new SDJwtInstance<Record<string, unknown>>({
  signer: async (data: string) =>
    Buffer.from(sign(null, Buffer.from(data), privateKey)).toString("base64url"),
  verifier: async (data: string, signature: string) =>
    verify(null, Buffer.from(data), publicKey, Buffer.from(signature, "base64url")),
  signAlg: "EdDSA",
  hasher: async (data: string | ArrayBuffer, alg: string) => {
    const input = typeof data === "string" ? data : Buffer.from(data);
    return new Uint8Array(createHash(alg.replace("-", "")).update(input).digest());
  },
  hashAlg: "sha-256",
  saltGenerator: async () => randomBytes(16).toString("base64url"),
});

export interface BracketProof {
  bracket: string;
  dobDisclosed: boolean;
  presentation: string;
  verifiedClaims: Record<string, unknown>;
}

export async function proveAgeBracket(dob: string, bracket: string): Promise<BracketProof> {
  const credential = await sdjwt.issue(
    { iss: "custody-demo", iat: 1, dob, ageBracket: bracket },
    { _sd: ["dob", "ageBracket"] },
  );
  // Present disclosing only the bracket; the DOB disclosure is withheld.
  const presentation = await sdjwt.present(credential, { ageBracket: true });
  const claims = await verifyPresentation(presentation);
  return {
    bracket: String(claims.ageBracket ?? ""),
    dobDisclosed: claims.dob !== undefined,
    presentation,
    verifiedClaims: claims,
  };
}

/**
 * Verify a presentation against the known issuer key and return its disclosed claims. Throws
 * if the signature does not verify, so a tampered or forged presentation is rejected.
 */
export async function verifyPresentation(presentation: string): Promise<Record<string, unknown>> {
  const { payload } = await sdjwt.verify(presentation);
  return payload as Record<string, unknown>;
}
