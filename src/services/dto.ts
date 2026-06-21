/** Serializable result shapes returned by the Server Actions (money as string). */

export interface ConsentActionResult {
  applied: boolean;
  status: string;
  seq: number;
  entryHash: string;
  // Measured ms for the committed change to be readable from the peer region's endpoint.
  crossRegionMs: number | null;
}

export interface SpendActionResult {
  applied: boolean;
  authorized: boolean;
  totalMinor: string;
  seq: number;
  entryHash: string;
  crossRegionMs: number | null;
}

export interface AgeProofResult {
  bracket: string;
  dobDisclosed: boolean;
  credentialHash: string;
  disclosedClaims: string[];
}
