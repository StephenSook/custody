import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Sliding-window rate limit for mutation routes (judges cannot spam the public demo). A
 * no-op when Upstash is not configured, so local dev and tests run without Redis. The
 * public judging demo also runs on a read-only or append-only DB role as defense in depth.
 */

let limiter: Ratelimit | null | undefined;

function getLimiter(): Ratelimit | null {
  if (limiter !== undefined) {
    return limiter;
  }
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    limiter = null;
    return limiter;
  }
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "10 s"),
    prefix: "custody",
  });
  return limiter;
}

export async function assertWithinRateLimit(key: string): Promise<void> {
  const active = getLimiter();
  if (!active) {
    return;
  }
  const { success } = await active.limit(key);
  if (!success) {
    throw new Error("rate limit exceeded");
  }
}
