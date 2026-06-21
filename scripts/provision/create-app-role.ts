import { getPool } from "@/src/data/pool";

/**
 * Create the least-privilege runtime database role for the public judging surface.
 *
 * custody_app holds only SELECT, INSERT, UPDATE on the app tables. It cannot DELETE, and DSQL
 * has no TRUNCATE, and it owns no tables so it cannot DROP or run DDL. That is exactly read +
 * append + projection-upsert: a judge cannot wipe state. It is associated with the Vercel OIDC
 * runtime IAM role via the DSQL `AWS IAM GRANT` extension, and connects with dsql:DbConnect
 * (not the admin dsql:DbConnectAdmin).
 *
 * Run as admin (your live AWS session, dsql:DbConnectAdmin):
 *   eval "$(aws configure export-credentials --format env)"
 *   set -a && source .env.dsql && set +a
 *   pnpm tsx scripts/provision/create-app-role.ts
 *
 * Idempotent and additive: it does not change how the currently-deployed app connects (that
 * switches only when DSQL_USER is set to custody_app by harden-runtime.sh).
 */

const DB_ROLE = "custody_app";
const IAM_ROLE_ARN =
  process.env.RUNTIME_ROLE_ARN ?? "arn:aws:iam::741030561008:role/custody-vercel-oidc";
const TABLES = [
  "consent_event",
  "spend_event",
  "consent_status_projection",
  "spend_total_projection",
  "parent_child_link",
];

interface PgError {
  message: string;
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : String((err as PgError)?.message ?? err);
}

async function main(): Promise<void> {
  const pool = getPool("east");
  const run = async (sql: string, ignoreIfContains: string[] = []): Promise<void> => {
    try {
      await pool.query(sql);
      console.log("ok:   ", sql.replace(/\s+/g, " ").slice(0, 72));
    } catch (err) {
      const m = message(err);
      if (ignoreIfContains.some((s) => m.toLowerCase().includes(s.toLowerCase()))) {
        console.log("skip: ", sql.replace(/\s+/g, " ").slice(0, 48), `(${m.slice(0, 40)})`);
        return;
      }
      throw err;
    }
  };

  // 1. The role (WITH LOGIN is required for an IAM-connectable role). Idempotent.
  await run(`CREATE ROLE ${DB_ROLE} WITH LOGIN`, ["already exists", "duplicate"]);

  // 2. Associate it with the runtime IAM role (DSQL extension). Idempotent.
  await run(`AWS IAM GRANT ${DB_ROLE} TO '${IAM_ROLE_ARN}'`, ["already", "duplicate", "exists"]);

  // 3. Least privilege: read + append + projection upsert. Deliberately NO DELETE, NO DDL.
  // USAGE on the public schema is implicit in DSQL and cannot be granted explicitly
  // (public is a system entity), so tolerate that and grant the table privileges directly.
  await run(`GRANT USAGE ON SCHEMA public TO ${DB_ROLE}`, ["not supported", "system entity"]);
  for (const table of TABLES) {
    await run(`GRANT SELECT, INSERT, UPDATE ON ${table} TO ${DB_ROLE}`);
  }

  // 4. Prove the deny: as custody_app, DELETE must be refused.
  try {
    await pool.query(`SET ROLE ${DB_ROLE}`);
    try {
      await pool.query("DELETE FROM consent_event WHERE false");
      console.log("WARNING: DELETE was NOT denied for custody_app. Check the grants.");
      process.exitCode = 1;
    } catch (err) {
      console.log("verified: DELETE denied for custody_app ->", message(err).slice(0, 60));
    }
    await pool.query("RESET ROLE");
  } catch (err) {
    console.log("note: SET ROLE check skipped ->", message(err).slice(0, 60));
  }

  // 5. Show the IAM <-> DB role mapping.
  try {
    const mappings = await pool.query("SELECT * FROM sys.iam_pg_role_mappings");
    console.log("iam_pg_role_mappings:", JSON.stringify(mappings.rows));
  } catch (err) {
    console.log("note: could not read sys.iam_pg_role_mappings ->", message(err).slice(0, 60));
  }

  await pool.end();
  console.log(`done: ${DB_ROLE} ready (read + append + upsert, no delete/ddl).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
