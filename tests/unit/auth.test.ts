import { afterEach, describe, expect, it, vi } from "vitest";
import { requireActor } from "@/src/services/auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireActor", () => {
  it("returns the demo actor outside production", () => {
    vi.stubEnv("VERCEL_ENV", "development");
    vi.stubEnv("NODE_ENV", "test");
    expect(requireActor()).toEqual({ id: "demo", role: "demo" });
  });

  it("throws in production when DEMO_MODE is not set (fail loud, no silent auth bypass)", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_MODE", "");
    expect(() => requireActor()).toThrow();
  });

  it("allows the demo actor in production only when DEMO_MODE is explicitly true", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("DEMO_MODE", "true");
    expect(requireActor()).toEqual({ id: "demo", role: "demo" });
  });
});
