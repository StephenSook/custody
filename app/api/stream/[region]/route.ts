import type { NextRequest } from "next/server";
import { z } from "zod";
import { type Region, readQuerier } from "@/src/data/pool";
import { getConsentSnapshot, getSpendSnapshot } from "@/src/data/reads";
import { assertWithinRateLimit } from "@/src/services/rateLimit";

// A live consistency demo must never serve cached state.
export const dynamic = "force-dynamic";

const REGIONS: readonly Region[] = ["east", "west"];
const POLL_MS = 500;
const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events stream for one region. Polls that region's projections for the given
 * subject and pushes a "state" event whenever they change. This is the primary realtime
 * transport (Vercel cannot host WebSocket servers); a managed provider is the hot standby.
 *
 * Demo seam: userId/minorId come from the query string and the demo data is synthetic
 * (no real minors). In production the subject MUST be derived from the caller's session
 * and a custody check, returning 403 for any subject the caller does not own; do not ship
 * this query-param read against real data.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ region: string }> },
): Promise<Response> {
  const { region } = await ctx.params;
  if (!REGIONS.includes(region as Region)) {
    return new Response("unknown region", { status: 404 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  try {
    // Reads are best-effort rate-limited: enforce when a limiter is configured, but do not
    // take the live read stream down in production if the limiter backend is absent. Mutations
    // (the wipe-state risk) keep the default fail-closed behavior in their actions.
    await assertWithinRateLimit(`stream:${ip}`, { failClosed: false });
  } catch {
    return new Response("rate limit exceeded", { status: 429 });
  }

  // A present-but-malformed id returns a clean 400 upfront; absent is allowed (that side just
  // streams null). Demo seam: synthetic subject from the query string; in production derive it
  // from the caller's session and a custody check.
  const uuidOrNull = z.uuid().nullable();
  const userIdParsed = uuidOrNull.safeParse(req.nextUrl.searchParams.get("userId"));
  const minorIdParsed = uuidOrNull.safeParse(req.nextUrl.searchParams.get("minorId"));
  if (!userIdParsed.success || !minorIdParsed.success) {
    return new Response("userId and minorId must be valid uuids", { status: 400 });
  }
  const userId = userIdParsed.data;
  const minorId = minorIdParsed.data;
  const querier = readQuerier(region as Region);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastState = "";
      let pollTimer: ReturnType<typeof setInterval> | undefined;
      let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        if (pollTimer) {
          clearInterval(pollTimer);
        }
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller closed between the guard and the enqueue (race with abort).
          cleanup();
        }
      };

      const poll = async () => {
        try {
          const [consent, spend] = await Promise.all([
            userId ? getConsentSnapshot(querier, userId) : Promise.resolve(null),
            minorId ? getSpendSnapshot(querier, minorId) : Promise.resolve(null),
          ]);
          const state = {
            region,
            consent,
            spend: spend
              ? {
                  totalMinor: spend.totalMinor.toString(),
                  capMinor: spend.capMinor.toString(),
                  lastSeq: spend.lastSeq,
                }
              : null,
          };
          const serialized = JSON.stringify(state);
          if (serialized !== lastState) {
            lastState = serialized;
            send("state", { ...state, at: Date.now() });
          }
        } catch (err) {
          if (closed) {
            return;
          }
          // Log server-side so a permanently-failing poll is diagnosable, not just a
          // stream that heartbeats forever while every read fails.
          console.error("[sse] poll failed", { region, userId, minorId, err });
          send("error", { message: err instanceof Error ? err.message : "poll failed" });
        }
      };

      // Initial event immediately so the stream never sits idle waiting to time out.
      send("ready", { region });
      void poll();

      pollTimer = setInterval(() => void poll(), POLL_MS);
      heartbeatTimer = setInterval(() => {
        if (closed) {
          return;
        }
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          cleanup();
        }
      }, HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
