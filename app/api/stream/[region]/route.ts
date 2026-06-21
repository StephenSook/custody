import type { NextRequest } from "next/server";
import { type Region, readQuerier } from "@/src/data/pool";
import { getConsentSnapshot, getSpendSnapshot } from "@/src/data/reads";

// A live consistency demo must never serve cached state.
export const dynamic = "force-dynamic";

const REGIONS: readonly Region[] = ["east", "west"];
const POLL_MS = 500;
const HEARTBEAT_MS = 15_000;

/**
 * Server-Sent Events stream for one region. Polls that region's projections for the given
 * subject and pushes a "state" event whenever they change. This is the primary realtime
 * transport (Vercel cannot host WebSocket servers); a managed provider is the hot standby.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ region: string }> },
): Promise<Response> {
  const { region } = await ctx.params;
  if (!REGIONS.includes(region as Region)) {
    return new Response("unknown region", { status: 404 });
  }
  const userId = req.nextUrl.searchParams.get("userId");
  const minorId = req.nextUrl.searchParams.get("minorId");
  const querier = readQuerier(region as Region);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastState = "";

      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
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
          send("error", { message: err instanceof Error ? err.message : "poll failed" });
        }
      };

      // Initial event immediately so the stream never sits idle waiting to time out.
      send("ready", { region });
      void poll();

      const pollTimer = setInterval(() => void poll(), POLL_MS);
      const heartbeatTimer = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) {
          return;
        }
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
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
