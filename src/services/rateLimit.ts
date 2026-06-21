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
  // Accept either naming scheme: the Upstash-native integration injects UPSTASH_REDIS_REST_*,
  // the Vercel Marketplace Redis (Upstash KV) product injects KV_REST_API_*.
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    // Fail closed in production: a missing limiter must not silently disable the named
    // defense. In non-production, warn loudly so the gap is visible in logs.
    const isProduction =
      process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
    if (isProduction) {
      throw new Error(
        "rate limiter not configured in production (UPSTASH_REDIS_REST_URL / TOKEN missing).",
      );
    }
    console.warn("[rateLimit] Upstash not configured; rate limiting is DISABLED (non-production).");
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

export async function assertWithinRateLimit(
  key: string,
  opts: { failClosed?: boolean } = {},
): Promise<void> {
  const failClosed = opts.failClosed ?? true;
  let active: Ratelimit | null;
  try {
    active = getLimiter();
  } catch (err) {
    // getLimiter throws only when the limiter is unconfigured in production. Mutations
    // (failClosed) must not run unprotected, so the error propagates. Reads (failClosed:
    // false) degrade to best-effort: rate-limiting a read is abuse-prevention, not the
    // wipe-state defense, so a missing limiter backend must not take the read path down.
    // This is an explicit, logged per-call choice, not a silent global disable.
    if (failClosed) {
      throw err;
    }
    console.warn(
      "[rateLimit] limiter unavailable; allowing read best-effort:",
      (err as Error).message,
    );
    return;
  }
  if (!active) {
    return;
  }
  const { success } = await active.limit(key);
  if (!success) {
    throw new Error("rate limit exceeded");
  }
}
