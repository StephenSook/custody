import { createHash, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { SDJwtInstance } from "@sd-jwt/core";

/**
 * Real SD-JWT selective disclosure for an age bracket. The issuer encodes both the DOB and
 * the bracket as selectively-disclosable claims; the holder presents ONLY the bracket; the
 * verifier sees the bracket and never the DOB. This is the honest equivalent of a ZKP for
 * the demo (no full ZKP is claimed). Runs server-side (node:crypto, bring-your-own-crypto).
 */

function newInstance(): SDJwtInstance<Record<string, unknown>> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return new SDJwtInstance<Record<string, unknown>>({
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
}

export interface BracketProof {
  bracket: string;
  dobDisclosed: boolean;
  presentation: string;
  verifiedClaims: Record<string, unknown>;
}

export async function proveAgeBracket(dob: string, bracket: string): Promise<BracketProof> {
  const sdjwt = newInstance();
  const credential = await sdjwt.issue(
    { iss: "custody-demo", iat: 1, dob, ageBracket: bracket },
    { _sd: ["dob", "ageBracket"] },
  );
  // Present disclosing only the bracket; the DOB disclosure is withheld.
  const presentation = await sdjwt.present(credential, { ageBracket: true });
  const { payload } = await sdjwt.verify(presentation);
  const claims = payload as Record<string, unknown>;
  return {
    bracket: String(claims.ageBracket ?? ""),
    dobDisclosed: claims.dob !== undefined,
    presentation,
    verifiedClaims: claims,
  };
}
