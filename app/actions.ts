"use server";

import { headers } from "next/headers";
import { makeTxnRunner, readQuerier } from "@/src/data/pool";
import { getConsentSnapshot, getSpendSnapshot } from "@/src/data/reads";
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

// Measure cross-region strong consistency: right after the Region A (east) commit, read the
// SAME entity from the Region B (west) endpoint and time it. DSQL is strongly consistent on
// commit, so the west read already reflects the committed seq. A real measurement, not "instant".
const PEER = "west" as const;
async function measureCrossRegion(
  kind: "consent" | "spend",
  id: unknown,
  committedSeq: number,
): Promise<number | null> {
  if (typeof id !== "string") {
    return null;
  }
  try {
    const t0 = performance.now();
    const snap =
      kind === "consent"
        ? await getConsentSnapshot(readQuerier(PEER), id)
        : await getSpendSnapshot(readQuerier(PEER), id);
    const ms = Math.round(performance.now() - t0);
    return snap && snap.lastSeq >= committedSeq ? ms : null;
  } catch (err) {
    console.error("[action] cross-region measurement failed", err);
    return null;
  }
}

export async function grantConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await guard("grantConsent");
  try {
    const r = await consentService.grantConsent(makeTxnRunner(REGION), raw);
    const crossRegionMs = r.applied
      ? await measureCrossRegion("consent", (raw as { userId?: unknown }).userId, r.seq)
      : null;
    return {
      applied: r.applied,
      status: r.status,
      seq: r.seq,
      entryHash: r.entryHash,
      crossRegionMs,
    };
  } catch (err) {
    fail("grantConsent", err, "Could not record consent.");
  }
}

export async function revokeConsentAction(raw: unknown): Promise<ConsentActionResult> {
  await guard("revokeConsent");
  try {
    const r = await consentService.revokeConsent(makeTxnRunner(REGION), raw);
    const crossRegionMs = r.applied
      ? await measureCrossRegion("consent", (raw as { userId?: unknown }).userId, r.seq)
      : null;
    return {
      applied: r.applied,
      status: r.status,
      seq: r.seq,
      entryHash: r.entryHash,
      crossRegionMs,
    };
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
    const crossRegionMs = r.applied
      ? await measureCrossRegion("spend", (raw as { minorId?: unknown }).minorId, r.seq)
      : null;
    return {
      applied: r.applied,
      authorized: r.authorized,
      totalMinor: r.totalMinor.toString(),
      seq: r.seq,
      entryHash: r.entryHash,
      crossRegionMs,
    };
  } catch (err) {
    fail("recordSpend", err, "Could not record the purchase.");
  }
}
