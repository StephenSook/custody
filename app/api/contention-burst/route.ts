import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { recordConsent } from "@/src/data/consentStore";
import { makeTxnRunner } from "@/src/data/pool";
import { requireActor } from "@/src/services/auth";
import { assertWithinRateLimit } from "@/src/services/rateLimit";

export const dynamic = "force-dynamic";

// Bounded so a public burst cannot hammer the cluster. 8 mirrors the integration harness.
const DEFAULT_WRITERS = 8;
const MAX_WRITERS = 12;

/**
 * Fires N concurrent appends against the LIVE Aurora DSQL cluster and reports the real
 * outcome: how many SQLSTATE 40001 (OC000) commit conflicts the retry wrapper actually
 * resolved, and that the chain stayed unforked. "hot" mode targets one throwaway subject so
 * the appends collide on the composite primary key; "spread" mode uses a fresh subject per
 * writer so there is no collision. This is the real thing, not a simulation. Synthetic
 * throwaway subjects only; never the demo subject.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  // Mutation route: fail closed if the limiter is unavailable (429), then require the demo
  // actor (403). Kept separate so an auth failure is not mislabeled as a rate-limit error.
  try {
    await assertWithinRateLimit(`contention:${ip}`);
  } catch {
    return json({ error: "rate limit exceeded" }, 429);
  }
  try {
    requireActor();
  } catch {
    return json({ error: "forbidden" }, 403);
  }

  const mode = req.nextUrl.searchParams.get("mode") === "spread" ? "spread" : "hot";
  const requested = Number(req.nextUrl.searchParams.get("n") ?? DEFAULT_WRITERS);
  const writers = Math.min(
    MAX_WRITERS,
    Math.max(2, Number.isFinite(requested) ? requested : DEFAULT_WRITERS),
  );

  let conflicts = 0;
  const txn = makeTxnRunner("east", () => {
    conflicts++;
  });
  const hotSubject = randomUUID(); // throwaway, never the demo subject

  const t0 = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: writers }, () =>
      recordConsent(txn, {
        userId: mode === "hot" ? hotSubject : randomUUID(),
        eventType: "GRANT",
        idempotencyKey: randomUUID(),
      }),
    ),
  );
  const ms = Math.round(performance.now() - t0);

  const committedSeqs: number[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      committedSeqs.push(r.value.seq);
    }
  }
  committedSeqs.sort((a, b) => a - b);

  // In hot mode every writer shares one chain, so an unforked result is exactly seqs 1..k.
  const expected = Array.from({ length: committedSeqs.length }, (_, i) => i + 1);
  const forked = mode === "hot" && JSON.stringify(committedSeqs) !== JSON.stringify(expected);

  const failures = results.filter((r) => r.status === "rejected").length;
  if (failures > 0) {
    console.error(`[contention-burst] ${failures}/${writers} writers failed`);
  }

  return json({
    mode,
    writers,
    committed: committedSeqs.length,
    conflicts,
    forked,
    ms,
    seqs: mode === "hot" ? committedSeqs : undefined,
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
