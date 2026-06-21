import { describe, expect, it } from "vitest";
import { recordConsent } from "@/src/data/consentStore";
import { fakeQuerier, ok } from "../support/fakeQuerier";

const USER = "123e4567-e89b-12d3-a456-426614174000";
const IDEM = "00000000-0000-4000-8000-000000000001";
const TIP_HASH = "a".repeat(64);

describe("recordConsent", () => {
  it("appends a first event and writes the projection", async () => {
    const { txn, calls } = fakeQuerier([
      ok([]), // SELECT tip -> none
      ok([], 1), // INSERT event -> 1 row
      ok([], 1), // UPSERT projection
    ]);
    const r = await recordConsent(txn, { userId: USER, eventType: "GRANT", idempotencyKey: IDEM });
    expect(r.applied).toBe(true);
    expect(r.status).toBe("GRANTED");
    expect(r.seq).toBe(1);
    expect(calls[1]?.text).toContain("INSERT INTO consent_event");
    expect(calls[2]?.text).toContain("INSERT INTO consent_status_projection");
  });

  it("links to the existing tip and increments seq", async () => {
    const { txn } = fakeQuerier([
      ok([{ last_seq: "1", last_entry_hash: TIP_HASH }]),
      ok([], 1),
      ok([], 1),
    ]);
    const r = await recordConsent(txn, { userId: USER, eventType: "REVOKE", idempotencyKey: IDEM });
    expect(r.seq).toBe(2);
    expect(r.status).toBe("REVOKED");
  });

  it("is a no-op on replay (insert affects 0 rows) and does not write the projection", async () => {
    const { txn, calls } = fakeQuerier([
      ok([{ last_seq: "1", last_entry_hash: TIP_HASH }]), // tip
      ok([], 0), // INSERT -> 0 rows (idempotency conflict)
      ok([{ current_status: "GRANTED", last_seq: "1", last_entry_hash: TIP_HASH }]), // re-read
    ]);
    const r = await recordConsent(txn, { userId: USER, eventType: "GRANT", idempotencyKey: IDEM });
    expect(r.applied).toBe(false);
    expect(r.status).toBe("GRANTED");
    const projWrites = calls.filter((c) =>
      c.text.includes("INSERT INTO consent_status_projection"),
    );
    expect(projWrites.length).toBe(0);
  });
});
