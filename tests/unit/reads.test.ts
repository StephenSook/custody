import { describe, expect, it } from "vitest";
import { getConsentSnapshot, getSpendSnapshot } from "@/src/data/reads";
import { fakeQuerier, ok } from "../support/fakeQuerier";

const ID = "123e4567-e89b-12d3-a456-426614174000";

describe("getConsentSnapshot", () => {
  it("returns null when there is no projection row", async () => {
    const { querier } = fakeQuerier([ok([])]);
    expect(await getConsentSnapshot(querier, ID)).toBeNull();
  });

  it("maps the projection row", async () => {
    const { querier } = fakeQuerier([
      ok([{ current_status: "REVOKED", last_seq: "3", last_entry_hash: "a".repeat(64) }]),
    ]);
    expect(await getConsentSnapshot(querier, ID)).toEqual({
      status: "REVOKED",
      lastSeq: 3,
      lastEntryHash: "a".repeat(64),
    });
  });
});

describe("getSpendSnapshot", () => {
  it("returns null when there is no projection row", async () => {
    const { querier } = fakeQuerier([ok([])]);
    expect(await getSpendSnapshot(querier, ID)).toBeNull();
  });

  it("maps the bigint money fields exactly", async () => {
    const { querier } = fakeQuerier([
      ok([{ total_minor: "500", cap_minor: "2000", last_seq: "2" }]),
    ]);
    expect(await getSpendSnapshot(querier, ID)).toEqual({
      totalMinor: 500n,
      capMinor: 2000n,
      lastSeq: 2,
    });
  });
});
