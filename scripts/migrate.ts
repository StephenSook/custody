import { setTimeout as sleep } from "node:timers/promises";
import { getPool, type Region } from "@/src/data/pool";

/**
 * Aurora DSQL migrations. One DDL statement per call (DSQL forbids mixing DDL and DML in
 * a transaction), random UUID keys, no foreign keys (enforced in the app layer), no
 * triggers. Every index is built with CREATE INDEX ASYNC; a UNIQUE async index does not
 * enforce uniqueness until its build job completes, so we wait afterward.
 *
 * Run per region: `pnpm migrate east` then `pnpm migrate west`.
 */

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS consent_event (
     user_id         uuid        NOT NULL,
     seq             bigint      NOT NULL,
     event_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
     event_type      varchar(32) NOT NULL,
     payload         jsonb       NOT NULL,
     prev_hash       char(64)    NOT NULL,
     entry_hash      char(64)    NOT NULL,
     idempotency_key uuid        NOT NULL,
     created_at      timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (user_id, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS spend_event (
     minor_id        uuid        NOT NULL,
     seq             bigint      NOT NULL,
     event_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
     amount_minor    bigint      NOT NULL,
     currency        char(3)     NOT NULL,
     payload         jsonb       NOT NULL,
     prev_hash       char(64)    NOT NULL,
     entry_hash      char(64)    NOT NULL,
     idempotency_key uuid        NOT NULL,
     created_at      timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (minor_id, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS consent_status_projection (
     user_id         uuid        NOT NULL PRIMARY KEY,
     current_status  varchar(32) NOT NULL,
     last_seq        bigint      NOT NULL,
     last_entry_hash char(64)    NOT NULL,
     updated_at      timestamptz NOT NULL DEFAULT now()
   )`,
  // last_entry_hash added here (vs the reference schema) so the spend chain can link its
  // next entry from a single projection read, same as the consent projection.
  `CREATE TABLE IF NOT EXISTS spend_total_projection (
     minor_id        uuid        NOT NULL PRIMARY KEY,
     total_minor     bigint      NOT NULL,
     cap_minor       bigint      NOT NULL,
     last_seq        bigint      NOT NULL,
     last_entry_hash char(64)    NOT NULL,
     updated_at      timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS parent_child_link (
     parent_id  uuid        NOT NULL,
     child_id   uuid        NOT NULL,
     status     varchar(16) NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (parent_id, child_id)
   )`,
];

const INDEXES: string[] = [
  "CREATE UNIQUE INDEX ASYNC IF NOT EXISTS consent_idem_idx ON consent_event (idempotency_key)",
  "CREATE UNIQUE INDEX ASYNC IF NOT EXISTS spend_idem_idx ON spend_event (idempotency_key)",
  "CREATE INDEX ASYNC IF NOT EXISTS consent_user_time_idx ON consent_event (user_id, created_at)",
  "CREATE INDEX ASYNC IF NOT EXISTS spend_minor_time_idx ON spend_event (minor_id, created_at)",
  "CREATE INDEX ASYNC IF NOT EXISTS pcl_child_idx ON parent_child_link (child_id)",
];

type RunQuery = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

type IndexWaitResult = "verified" | "unverified" | "timeout";

async function waitForAsyncIndexes(query: RunQuery): Promise<IndexWaitResult> {
  // CREATE INDEX ASYNC builds in the background. Verify the exact sys.jobs columns against
  // the live cluster on day 0. Returns "verified" ONLY when it confirmed zero pending
  // jobs, so a poll failure or unexpected shape never becomes a false green.
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await query(
        "SELECT count(*)::int AS pending FROM sys.jobs WHERE status <> 'completed'",
      );
      const pending = res.rows[0]?.pending;
      if (pending === undefined || pending === null) {
        return "unverified";
      }
      if (Number(pending) === 0) {
        return "verified";
      }
    } catch (err) {
      console.warn("could not poll sys.jobs (verify schema on day 0):", err);
      return "unverified";
    }
    await sleep(2000);
  }
  return "timeout";
}

async function main(): Promise<void> {
  const region = (process.argv[2] as Region | undefined) ?? "east";
  const pool = getPool(region);
  const query: RunQuery = (text, params) => pool.query(text, params);

  for (const ddl of TABLES) {
    await query(ddl);
    console.log("table ok:", ddl.slice(0, 56).replace(/\s+/g, " "));
  }
  for (const ddl of INDEXES) {
    await query(ddl);
    console.log("index ok:", ddl.slice(0, 64).replace(/\s+/g, " "));
  }
  const indexStatus = await waitForAsyncIndexes(query);
  if (indexStatus === "verified") {
    console.log(`migration complete for region "${region}" (async indexes verified)`);
  } else {
    console.warn(
      `WARNING: migration ran for region "${region}" but async index build is ${indexStatus}. ` +
        "The UNIQUE idempotency indexes may not yet enforce uniqueness. Do not rely on " +
        "idempotency for this region until confirmed against sys.jobs on the live cluster.",
    );
    process.exitCode = 1;
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
