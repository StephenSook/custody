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
