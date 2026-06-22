import { recordConsent } from "@/src/data/consentStore";
import { getPool, makeTxnRunner } from "@/src/data/pool";
import { recordSpend, setCap } from "@/src/data/spendStore";
import { DEMO_SUBJECT_ID } from "@/src/demoSubject";

/**
 * Seed synthetic operational data. No real minors, no biometrics, no personal data.
 * Creates one parent-child link, grants consent, sets a 20.00 USD cap, then records one
 * authorized purchase and one that pushes over the cap (declined). Run: `pnpm seed`.
 */
async function main(): Promise<void> {
  const region = "east" as const;
  const txn = makeTxnRunner(region);
  const pool = getPool(region);

  // The fixed synthetic demo subject the app watches, with deterministic idempotency keys so
  // a fresh seed populates exactly what the UI reads and re-running the seed is a no-op.
  const userId = DEMO_SUBJECT_ID;
  const parentId = "00000000-0000-4000-8000-0000000009ff";

  await pool.query(
    "INSERT INTO parent_child_link (parent_id, child_id, status) VALUES ($1, $2, 'ACTIVE') " +
      "ON CONFLICT (parent_id, child_id) DO NOTHING",
    [parentId, userId],
  );

  await recordConsent(txn, {
    userId,
    eventType: "GRANT",
    idempotencyKey: "00000000-0000-4000-8000-000000000a01",
    body: { actor: "parent" },
  });

  await setCap(txn, { minorId: userId, capMinor: 2000n });

  const authorized = await recordSpend(txn, {
    minorId: userId,
    amountMinor: 500n,
    currency: "USD",
    idempotencyKey: "00000000-0000-4000-8000-000000000a02",
  });
  const declined = await recordSpend(txn, {
    minorId: userId,
    amountMinor: 1800n,
    currency: "USD",
    idempotencyKey: "00000000-0000-4000-8000-000000000a03",
  });

  console.log(
    `seeded user ${userId}: cap 2000, spend 500 authorized=${authorized.authorized}, ` +
      `spend 1800 authorized=${declined.authorized} (total ${declined.totalMinor})`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
