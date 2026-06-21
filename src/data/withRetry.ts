/**
 * Aurora DSQL detects write-write and schema conflicts at commit and returns
 * SQLSTATE 40001 (subcodes OC000 row conflict, OC001 schema conflict). Both are
 * safe to retry. Wrap EVERY write transaction in this helper. Reads NEVER retry,
 * so reads must not be wrapped.
 */
export const OCC_SQLSTATE = "40001";

const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_BASE_DELAY_MS = 50;

export interface WithRetryOptions {
  /** Max retries after the initial attempt. Total attempts = maxRetries + 1. */
  maxRetries?: number;
  /** Base backoff in milliseconds; grows as base * 2^attempt. */
  baseDelayMs?: number;
  /** Injectable for tests. Defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests. Defaults to Math.random. */
  random?: () => number;
  /** Called once each time a 40001 conflict is caught and a retry is scheduled. */
  onRetry?: () => void;
}

function isOccConflict(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === OCC_SQLSTATE
  );
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run a write transaction, retrying only on SQLSTATE 40001 with exponential
 * backoff plus full jitter. Retry the WHOLE transaction, never part of it.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: WithRetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isOccConflict(err) || attempt === maxRetries) {
        throw err;
      }
      options.onRetry?.();
      const backoff = baseDelayMs * 2 ** attempt;
      const jitter = random() * backoff;
      await sleep(backoff + jitter);
    }
  }
  // Unreachable: the loop either returns or throws on the final attempt.
  throw new Error("withRetry: exhausted retries without returning or throwing");
}
