import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import type { PoolClient } from "pg";
import type { Querier, QueryRow, TxnRunner } from "./sql";
import { withRetry } from "./withRetry";

/**
 * One AuroraDSQLPool per regional endpoint. The connector auto-generates and refreshes
 * the region-scoped IAM token and auto-discovers the region from the hostname. On Vercel,
 * AWS credentials come from OIDC federation (no stored keys). A region token only
 * authenticates against that region's endpoint, so each region gets its own pool.
 */

export type Region = "east" | "west";

function endpointFor(region: Region): string {
  const value = region === "east" ? process.env.DSQL_ENDPOINT_EAST : process.env.DSQL_ENDPOINT_WEST;
  if (!value) {
    throw new Error(`missing DSQL endpoint env var for region "${region}"`);
  }
  return value;
}

// 45 to 55 minutes, under the 60-minute DSQL hard connection cap, with jitter so pooled
// connections do not all recycle at once.
function maxLifetimeSeconds(): number {
  return 45 * 60 + Math.floor(Math.random() * 10 * 60);
}

const pools = new Map<Region, AuroraDSQLPool>();

export function getPool(region: Region): AuroraDSQLPool {
  const existing = pools.get(region);
  if (existing) {
    return existing;
  }
  const roleArn = process.env.AWS_ROLE_ARN;
  const pool = new AuroraDSQLPool({
    host: endpointFor(region),
    user: process.env.DSQL_USER ?? "admin",
    database: process.env.DSQL_DATABASE ?? "postgres",
    ssl: true,
    max: 10,
    idleTimeoutMillis: 30_000,
    maxLifetimeSeconds: maxLifetimeSeconds(),
    // On Vercel, OIDC federation supplies AWS credentials with no stored keys. Locally,
    // omit AWS_ROLE_ARN and the connector falls back to the default credential chain.
    ...(roleArn ? { customCredentialsProvider: awsCredentialsProvider({ roleArn }) } : {}),
  });
  pools.set(region, pool);
  return pool;
}

/**
 * A TxnRunner backed by a real regional pool. Each run acquires a client, wraps the work
 * in BEGIN/COMMIT, rolls back on error, and is retried as a whole on OCC conflict
 * (SQLSTATE 40001) by withRetry. The work function must be a pure write transaction.
 */
export function makeTxnRunner(region: Region): TxnRunner {
  return {
    run<T>(fn: (q: Querier) => Promise<T>): Promise<T> {
      return withRetry(async () => {
        const client: PoolClient = await getPool(region).connect();
        try {
          await client.query("BEGIN");
          const querier: Querier = {
            async query<R extends QueryRow = QueryRow>(text: string, params?: unknown[]) {
              const res = await client.query(text, params);
              return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
            },
          };
          const result = await fn(querier);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Surface the original error, not a rollback failure.
          }
          throw err;
        } finally {
          client.release();
        }
      });
    },
  };
}

/**
 * A read-only Querier backed by a regional pool (no transaction, no retry). DSQL does not
 * conflict-check plain reads, so reads are never wrapped in withRetry. Used by the SSE
 * streams and server-side snapshot reads.
 */
export function readQuerier(region: Region): Querier {
  // getPool is resolved lazily inside query so a missing endpoint surfaces as a caught
  // query error (an SSE "error" event on an open stream), not a synchronous throw that
  // turns the whole route into a 500.
  return {
    async query<R extends QueryRow = QueryRow>(text: string, params?: unknown[]) {
      const res = await getPool(region).query(text, params);
      return { rows: res.rows as R[], rowCount: res.rowCount ?? 0 };
    },
  };
}
