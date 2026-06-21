"use server";

import { headers } from "next/headers";
import { makeTxnRunner } from "@/src/data/pool";
import { requireActor } from "@/src/services/auth";
import * as consentService from "@/src/services/consentService";
import type { ConsentActionResult, SpendActionResult } from "@/src/services/dto";
import { isValidationError, publicErrorMessage } from "@/src/services/errors";
import { assertWithinRateLimit } from "@/src/services/rateLimit";
import * as spendService from "@/src/services/spendService";

// Mutations write to Region A (us-east-1). DSQL is active-active and strongly consistent on
// commit, so the write is visible from Region B's endpoint the moment it commits.
const REGION = "east" as const;

// Per-caller rate-limit key from the forwarded client IP (best effort behind Vercel), so
// one caller cannot exhaust a single global bucket.
async function callerKey(scope: string): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

async function guard(scope: string): Promise<void> {
  await assertWithinRateLimit(await callerKey(scope));
  requireActor();
}

function fail(scope: string, err: unknown, fallback: string): never {
  // Log the unexpected (infrastructure) errors server-side; never leak the raw message.
  if (!isValidationError(err)) {
    console.error(`[action] ${scope} failed`, err);
  }
  throw new Error(publicErrorMessage(err, fallback));
}

export async function grantConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await guard("grantConsent");
  try {
    const r = await consentService.grantConsent(makeTxnRunner(REGION), raw);
    return { applied: r.applied, status: r.status, seq: r.seq, entryHash: r.entryHash };
  } catch (err) {
    fail("grantConsent", err, "Could not record consent.");
  }
}

export async function revokeConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await guard("revokeConsent");
  try {
    const r = await consentService.revokeConsent(makeTxnRunner(REGION), raw);
    return { applied: r.applied, status: r.status, seq: r.seq, entryHash: r.entryHash };
  } catch (err) {
    fail("revokeConsent", err, "Could not record consent.");
  }
}

export async function setCapAction(raw: unknown): Promise<{ ok: true }> {
  await guard("setCap");
  try {
    await spendService.setCap(makeTxnRunner(REGION), raw);
    return { ok: true };
  } catch (err) {
    fail("setCap", err, "Could not set the spend cap.");
  }
}

export async function recordSpendAction(raw: unknown): Promise<SpendActionResult> {
  await guard("recordSpend");
  try {
    const r = await spendService.recordSpend(makeTxnRunner(REGION), raw);
    return {
      applied: r.applied,
      authorized: r.authorized,
      totalMinor: r.totalMinor.toString(),
      seq: r.seq,
      entryHash: r.entryHash,
    };
  } catch (err) {
    fail("recordSpend", err, "Could not record the purchase.");
  }
}
