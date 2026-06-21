import { describe, expect, it, vi } from "vitest";
import { OCC_SQLSTATE, withRetry } from "@/src/data/withRetry";

const occError = (): Error & { code: string } =>
  Object.assign(new Error("serialization failure"), { code: OCC_SQLSTATE });

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("OCC_SQLSTATE is 40001", () => {
    expect(OCC_SQLSTATE).toBe("40001");
  });

  it("returns the value on first success without sleeping", async () => {
    const sleep = vi.fn(noSleep);
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries on SQLSTATE 40001 then succeeds", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw occError();
      return "ok";
    });
    const sleep = vi.fn(noSleep);
    const result = await withRetry(fn, { sleep, maxRetries: 5 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("rethrows after exhausting maxRetries", async () => {
    const fn = vi.fn(async () => {
      throw occError();
    });
    await expect(withRetry(fn, { sleep: noSleep, maxRetries: 2 })).rejects.toMatchObject({
      code: "40001",
    });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("does not retry a non-OCC error", async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error("unique violation"), { code: "23505" });
    });
    const sleep = vi.fn(noSleep);
    await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ code: "23505" });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("does not retry an error with no SQLSTATE code", async () => {
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });
    const sleep = vi.fn(noSleep);
    await expect(withRetry(fn, { sleep })).rejects.toThrow("boom");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("uses exponential backoff (base * 2^attempt) with zero jitter", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw occError();
      return "ok";
    };
    await withRetry(fn, { sleep, baseDelayMs: 50, random: () => 0, maxRetries: 5 });
    expect(delays).toEqual([50, 100]);
  });

  it("bounds jitter so each delay stays under 2x the backoff", async () => {
    const delays: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      delays.push(ms);
    });
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw occError();
      return "ok";
    };
    await withRetry(fn, { sleep, baseDelayMs: 50, random: () => 1, maxRetries: 5 });
    // delay = backoff + random()*backoff; random()=1 gives exactly 2x the backoff.
    expect(delays).toEqual([100, 200]);
  });

  it("calls onRetry once per 40001 retry", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw occError();
      return "ok";
    };
    const onRetry = vi.fn();
    await withRetry(fn, { sleep: noSleep, maxRetries: 5, onRetry });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("does not call onRetry on first success", async () => {
    const onRetry = vi.fn();
    await withRetry(async () => "ok", { sleep: noSleep, onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });
});
