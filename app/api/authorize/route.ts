import type { NextRequest } from "next/server";
import { type Region, readQuerier } from "@/src/data/pool";
import { getConsentSnapshot, getSpendSnapshot } from "@/src/data/reads";
import { authorizeAccess } from "@/src/domain/authorize";
import { authorizeInput } from "@/src/domain/schemas";
import { assertWithinRateLimit } from "@/src/services/rateLimit";

export const dynamic = "force-dynamic";

const REGIONS: readonly Region[] = ["east", "west"];

/**
 * The platform-facing gate check. A gaming or social platform calls this at the play/spend
 * gate and gets back a deny that is identical in every region, because it reads the
 * strongly-consistent consent and spend projections. Read-only: it makes a decision, it does
 * not mutate. Demo seam: the subject comes from the body and the data is synthetic; in
 * production derive it from the caller's authenticated session.
 *
 * Body: { userId, minorId, action: "play" | "spend", amountMinor? }
 * Query: ?region=east|west (default east)
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  try {
    // A gate check is a read; best-effort rate-limited, never failing the gate closed.
    await assertWithinRateLimit(`authorize:${ip}`, { failClosed: false });
  } catch {
    return json({ error: "unavailable" }, 429);
  }

  const region = (req.nextUrl.searchParams.get("region") ?? "east") as Region;
  if (!REGIONS.includes(region)) {
    return json({ error: "unknown region" }, 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const parsed = authorizeInput.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid request" }, 400);
  }
  const { userId, minorId, action, amountMinor } = parsed.data;

  try {
    const q = readQuerier(region);
    const [consent, spend] = await Promise.all([
      getConsentSnapshot(q, userId),
      getSpendSnapshot(q, minorId),
    ]);
    const decision = authorizeAccess({
      consentGranted: consent?.status === "GRANTED",
      totalMinor: spend?.totalMinor ?? 0n,
      capMinor: spend?.capMinor ?? 0n,
      action,
      amountMinor: amountMinor ?? 0n,
    });
    return json({
      region,
      action,
      allow: decision.allow,
      reason: decision.reason,
      consentStatus: consent?.status ?? "NONE",
      spendRemaining: decision.spendRemaining.toString(),
      lastEntryHash: consent?.lastEntryHash ?? null,
    });
  } catch (err) {
    console.error("[authorize] read failed", err);
    return json({ error: "could not evaluate" }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
