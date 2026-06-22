import { defineConfig } from "@playwright/test";

/**
 * The E2E runs against the DEPLOYED app (BASE_URL, default the production URL) because the live
 * cross-region happy path needs the real Aurora DSQL backend, which a local server cannot reach
 * without cluster credentials. Run it pre-submission, or in the manual e2e CI job. It is
 * serialized and state-restoring (it grants consent back), so it is safe to run against prod.
 */
const baseURL = process.env.BASE_URL ?? "https://custody-zeta.vercel.app";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 1,
  reporter: "line",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
});
