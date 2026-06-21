"use server";

import { makeTxnRunner } from "@/src/data/pool";
import { requireActor } from "@/src/services/auth";
import * as consentService from "@/src/services/consentService";
import type { ConsentActionResult, SpendActionResult } from "@/src/services/dto";
import { assertWithinRateLimit } from "@/src/services/rateLimit";
import * as spendService from "@/src/services/spendService";

// Mutations write to Region A (us-east-1). DSQL is active-active and strongly consistent on
// commit, so the write is visible from Region B's endpoint the moment it commits.
const REGION = "east" as const;

export async function grantConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await assertWithinRateLimit("mutation");
  requireActor();
  const r = await consentService.grantConsent(makeTxnRunner(REGION), raw);
  return { applied: r.applied, status: r.status, seq: r.seq, entryHash: r.entryHash };
}

export async function revokeConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await assertWithinRateLimit("mutation");
  requireActor();
  const r = await consentService.revokeConsent(makeTxnRunner(REGION), raw);
  return { applied: r.applied, status: r.status, seq: r.seq, entryHash: r.entryHash };
}

export async function setCapAction(raw: unknown): Promise<{ ok: true }> {
  await assertWithinRateLimit("mutation");
  requireActor();
  await spendService.setCap(makeTxnRunner(REGION), raw);
  return { ok: true };
}

export async function recordSpendAction(raw: unknown): Promise<SpendActionResult> {
  await assertWithinRateLimit("mutation");
  requireActor();
  const r = await spendService.recordSpend(makeTxnRunner(REGION), raw);
  return {
    applied: r.applied,
    authorized: r.authorized,
    totalMinor: r.totalMinor.toString(),
    seq: r.seq,
    entryHash: r.entryHash,
  };
}
