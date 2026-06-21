/**
 * Canonical JSON (JCS-style): object keys sorted recursively so semantically identical
 * payloads always serialize to the same bytes. This is the input to the hash chain, so
 * correctness here is load-bearing for tamper-evidence.
 *
 * Two deliberate rules beyond plain JSON.stringify:
 * - bigint serializes to an exact decimal string. Money is bigint minor units, and
 *   JSON.stringify throws on bigint, so this keeps money payloads hashable. A bigint
 *   stays distinct from a same-valued number (5n -> "5", 5 -> 5) so they never collide.
 * - Non-representable values fail closed (throw) instead of silently changing. Plain
 *   JSON.stringify drops `undefined` keys and coerces NaN/Infinity to null, which would
 *   let a tampered payload hash identically to the original (a false tamper-negative).
 *
 * Note: number formatting relies on the JS engine, which is identical on the server and
 * in the browser verify panel, so digests match across both. It is not full RFC 8785.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  const type = typeof value;

  if (type === "bigint") {
    return (value as bigint).toString();
  }
  if (type === "number" && !Number.isFinite(value)) {
    throw new Error(`canonicalJson: non-finite number is not representable: ${String(value)}`);
  }
  if (value === undefined || type === "function" || type === "symbol") {
    throw new Error(`canonicalJson: value of type ${type} is not representable`);
  }
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && type === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortValue(source[key]);
    }
    return out;
  }
  return value;
}
