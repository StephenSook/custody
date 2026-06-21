/**
 * Narrow data-access ports plus the parameterized SQL the stores execute. The stores
 * depend on Querier/TxnRunner, not on pg or the DSQL pool directly, so the
 * append-plus-projection orchestration is unit-tested with a fake querier and the real
 * pool adapter (see pool.ts) is swapped in at runtime.
 */

export type QueryRow = Record<string, unknown>;

export interface QueryResult<R extends QueryRow = QueryRow> {
  readonly rows: R[];
  readonly rowCount: number;
}

export interface Querier {
  query<R extends QueryRow = QueryRow>(text: string, params?: unknown[]): Promise<QueryResult<R>>;
}

/** Runs a function inside one transaction, retried as a whole on OCC conflict. */
export interface TxnRunner {
  run<T>(fn: (q: Querier) => Promise<T>): Promise<T>;
}

// Consent ledger
export const SELECT_CONSENT_TIP =
  "SELECT last_seq, last_entry_hash FROM consent_status_projection WHERE user_id = $1";

export const SELECT_CONSENT_PROJECTION =
  "SELECT current_status, last_seq, last_entry_hash FROM consent_status_projection WHERE user_id = $1";

export const SELECT_CONSENT_EVENT_BY_IDEM =
  "SELECT seq, entry_hash, event_type FROM consent_event WHERE idempotency_key = $1";

export const INSERT_CONSENT_EVENT =
  "INSERT INTO consent_event (user_id, seq, event_type, payload, prev_hash, entry_hash, idempotency_key) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (idempotency_key) DO NOTHING";

export const UPSERT_CONSENT_PROJECTION =
  "INSERT INTO consent_status_projection (user_id, current_status, last_seq, last_entry_hash) " +
  "VALUES ($1, $2, $3, $4) ON CONFLICT (user_id) DO UPDATE SET " +
  "current_status = EXCLUDED.current_status, last_seq = EXCLUDED.last_seq, " +
  "last_entry_hash = EXCLUDED.last_entry_hash, updated_at = now()";

// Spend ledger
export const SELECT_SPEND_PROJECTION =
  "SELECT total_minor, cap_minor, last_seq, last_entry_hash FROM spend_total_projection WHERE minor_id = $1";

export const UPSERT_SPEND_CAP =
  "INSERT INTO spend_total_projection (minor_id, total_minor, cap_minor, last_seq, last_entry_hash) " +
  "VALUES ($1, 0, $2, 0, $3) ON CONFLICT (minor_id) DO UPDATE SET " +
  "cap_minor = EXCLUDED.cap_minor, updated_at = now()";

export const INSERT_SPEND_EVENT =
  "INSERT INTO spend_event (minor_id, seq, amount_minor, currency, payload, prev_hash, entry_hash, idempotency_key) " +
  "VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (idempotency_key) DO NOTHING";

export const UPDATE_SPEND_PROJECTION =
  "UPDATE spend_total_projection SET total_minor = $2, last_seq = $3, last_entry_hash = $4, " +
  "updated_at = now() WHERE minor_id = $1";

export const SELECT_SPEND_EVENT_BY_IDEM =
  "SELECT seq, entry_hash, (payload->>'authorized')::boolean AS authorized " +
  "FROM spend_event WHERE idempotency_key = $1";
