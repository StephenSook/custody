import { afterEach, describe, expect, it, vi } from "vitest";

// getLimiter caches the limiter at module scope and reads env on first call, so each case
// needs a fresh module import after stubbing env.
async function freshAssert() {
  vi.resetModules();
  return (await import("@/src/services/rateLimit")).assertWithinRateLimit;
}

function unconfiguredProduction() {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("assertWithinRateLimit", () => {
  it("fails closed in production by default when Upstash is unconfigured (mutations)", async () => {
    unconfiguredProduction();
    const assert = await freshAssert();
    await expect(assert("mutation-key")).rejects.toThrow();
  });

  it("is best-effort for reads (failClosed=false) in production when unconfigured", async () => {
    unconfiguredProduction();
    const assert = await freshAssert();
    await expect(assert("read-key", { failClosed: false })).resolves.toBeUndefined();
  });

  it("does not throw in non-production when unconfigured", async () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    const assert = await freshAssert();
    await expect(assert("any-key")).resolves.toBeUndefined();
  });
});
