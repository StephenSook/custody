import type { NextRequest } from "next/server";
import { z } from "zod";
import { readQuerier } from "@/src/data/pool";
import { SELECT_CONSENT_EVENTS } from "@/src/data/sql";
import { assertWithinRateLimit } from "@/src/services/rateLimit";

// A live consistency demo must never serve cached state.
export const dynamic = "force-dynamic";

/**
 * Returns the REAL per-user consent hash chain from Aurora DSQL so the ledger verifies live
 * rows, not a client-side constant. The stored payload is the exact body that was hashed, so
 * the client recomputes entry_hash = SHA256(canonicalJSON(payload) + prev_hash) and confirms
 * it matches. Demo seam: the subject comes from the query string and the data is synthetic; in
 * production derive it from the caller's session and a custody check.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  try {
    // Reads are best-effort rate-limited (enforced when a limiter is configured), never failing
    // the live read closed when the limiter backend is absent.
    await assertWithinRateLimit(`ledger:${ip}`, { failClosed: false });
  } catch {
    return new Response("rate limit exceeded", { status: 429 });
  }

  // Validate the subject is a UUID so a malformed id returns a clean 400 instead of falling
  // through to the DB and erroring as a 500. (Demo seam: synthetic subject from the query
  // string; in production derive it from the caller's session and a custody check.)
  const userId = z.uuid().safeParse(req.nextUrl.searchParams.get("userId"));
  if (!userId.success) {
    return new Response(JSON.stringify({ error: "a valid userId (uuid) is required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const res = await readQuerier("east").query<{
      seq: string;
      payload: Record<string, unknown>;
      prev_hash: string;
      entry_hash: string;
    }>(SELECT_CONSENT_EVENTS, [userId.data]);
    const entries = res.rows.map((r) => ({
      seq: Number(r.seq),
      payload: r.payload,
      prevHash: r.prev_hash,
      entryHash: r.entry_hash,
    }));
    return new Response(JSON.stringify({ entries }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (err) {
    console.error("[ledger] read failed", err);
    return new Response(JSON.stringify({ error: "could not read the chain" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
