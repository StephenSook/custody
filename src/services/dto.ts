/** Serializable result shapes returned by the Server Actions (money as string). */

export interface ConsentActionResult {
  applied: boolean;
  status: string;
  seq: number;
  entryHash: string;
}

export interface SpendActionResult {
  applied: boolean;
  authorized: boolean;
  totalMinor: string;
  seq: number;
  entryHash: string;
}

export interface AgeProofResult {
  bracket: string;
  dobDisclosed: boolean;
  credentialHash: string;
  disclosedClaims: string[];
}
