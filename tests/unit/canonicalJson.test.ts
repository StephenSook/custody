import { describe, expect, it } from "vitest";
import { canonicalJson } from "@/src/crypto/canonicalJson";

describe("canonicalJson", () => {
  it("sorts object keys deterministically regardless of input order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("sorts keys in nested objects recursively", () => {
    expect(canonicalJson({ z: { y: 1, x: 2 } })).toBe('{"z":{"x":2,"y":1}}');
  });

  it("sorts keys inside objects nested in arrays", () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("encodes primitives and null", () => {
    expect(canonicalJson("a")).toBe('"a"');
    expect(canonicalJson(5)).toBe("5");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(null)).toBe("null");
  });
});

describe("canonicalJson money and representability (tamper-evidence guards)", () => {
  it("serializes bigint as an exact decimal string (money is bigint minor units)", () => {
    expect(canonicalJson(500n)).toBe('"500"');
    expect(canonicalJson({ amountMinor: 500n })).toBe('{"amountMinor":"500"}');
  });

  it("keeps bigint distinct from a same-valued number so they never collide", () => {
    expect(canonicalJson(5)).toBe("5");
    expect(canonicalJson(5n)).toBe('"5"');
    expect(canonicalJson(5)).not.toBe(canonicalJson(5n));
  });

  it("fails closed on undefined rather than dropping it (false-tamper-negative guard)", () => {
    expect(() => canonicalJson(undefined)).toThrow();
    expect(() => canonicalJson({ a: undefined, b: 1 })).toThrow();
  });

  it("fails closed on NaN rather than coercing to null", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
  });

  it("fails closed on Infinity and -Infinity", () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalJson(Number.NEGATIVE_INFINITY)).toThrow();
  });

  it("fails closed on functions and symbols", () => {
    expect(() => canonicalJson(() => 1)).toThrow();
    expect(() => canonicalJson(Symbol("x"))).toThrow();
  });
});
