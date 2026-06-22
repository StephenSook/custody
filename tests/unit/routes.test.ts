import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { POST as authorizePOST } from "@/app/api/authorize/route";
import { GET as ledgerGET } from "@/app/api/ledger/route";
import { GET as streamGET } from "@/app/api/stream/[region]/route";

/**
 * Route-handler guard tests. They exercise only the validation branches that return BEFORE the
 * data layer, so no Aurora DSQL cluster is needed. In test (non-production) requireActor and the
 * rate limiter are no-ops, so a request reaches input validation. These lock in the UUID and
 * region guards (a malformed id must be a clean 400, an unknown region a 404), not a 500.
 */

const BASE = "https://custody.test";

describe("/api/ledger guard", () => {
  it("400s when userId is missing", async () => {
    const res = await ledgerGET(new NextRequest(`${BASE}/api/ledger`));
    expect(res.status).toBe(400);
  });

  it("400s when userId is not a uuid", async () => {
    const res = await ledgerGET(new NextRequest(`${BASE}/api/ledger?userId=not-a-uuid`));
    expect(res.status).toBe(400);
  });
});

describe("/api/authorize guard", () => {
  it("404s on an unknown region", async () => {
    const res = await authorizePOST(
      new NextRequest(`${BASE}/api/authorize?region=mars`, { method: "POST" }),
    );
    expect(res.status).toBe(404);
  });

  it("400s on a malformed json body", async () => {
    const res = await authorizePOST(
      new NextRequest(`${BASE}/api/authorize?region=east`, {
        method: "POST",
        body: "{ not json",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s when the body fails the schema", async () => {
    const res = await authorizePOST(
      new NextRequest(`${BASE}/api/authorize?region=east`, {
        method: "POST",
        body: JSON.stringify({ userId: "nope", minorId: "nope", action: "fly" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("/api/stream/[region] guard", () => {
  it("404s on an unknown region", async () => {
    const res = await streamGET(new NextRequest(`${BASE}/api/stream/mars`), {
      params: Promise.resolve({ region: "mars" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s when a present id is not a uuid", async () => {
    const res = await streamGET(new NextRequest(`${BASE}/api/stream/east?userId=not-a-uuid`), {
      params: Promise.resolve({ region: "east" }),
    });
    expect(res.status).toBe(400);
  });
});
