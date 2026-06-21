import type { Querier, QueryResult, QueryRow, TxnRunner } from "@/src/data/sql";

export interface RecordedCall {
  text: string;
  params: unknown[] | undefined;
}

/** A scripted querier: returns queued results in call order and records every call. */
export function fakeQuerier(scripted: QueryResult[]) {
  const calls: RecordedCall[] = [];
  let i = 0;
  const querier: Querier = {
    async query<R extends QueryRow = QueryRow>(text: string, params?: unknown[]) {
      calls.push({ text, params });
      const result = scripted[i++] ?? { rows: [], rowCount: 0 };
      return result as QueryResult<R>;
    },
  };
  // The fake transaction simply runs the function once with the scripted querier.
  const txn: TxnRunner = { run: (fn) => fn(querier) };
  return { querier, txn, calls };
}

export function ok(rows: QueryRow[], rowCount = rows.length): QueryResult {
  return { rows, rowCount };
}
