"use client";

import { useState } from "react";
import { OCC_SQLSTATE, withRetry } from "@/src/data/withRetry";

interface Writer {
  attempts: number;
  committed: boolean;
}

// A write whose commit conflicts (SQLSTATE 40001) up to maxConflicts times, then succeeds.
// This drives the REAL withRetry wrapper so the panel demonstrates the actual OCC retry
// algorithm resolving conflicts. The full-scale contention test runs live against DSQL.
function conflictingOp(probability: number, maxConflicts: number) {
  let conflicts = 0;
  return async () => {
    if (conflicts < maxConflicts && Math.random() < probability) {
      conflicts++;
      throw Object.assign(new Error("serialization failure"), { code: OCC_SQLSTATE });
    }
    return true;
  };
}

const WRITERS = 24;

export function ContentionPanel() {
  const [hotKey, setHotKey] = useState(false);
  const [writers, setWriters] = useState<Writer[]>([]);
  const [running, setRunning] = useState(false);

  const fire = async () => {
    setRunning(true);
    setWriters([]);
    const probability = hotKey ? 0.85 : 0.04;
    const maxConflicts = hotKey ? 5 : 1;
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, Math.min(ms, 40)));
    const results = await Promise.all(
      Array.from({ length: WRITERS }, async () => {
        const op = conflictingOp(probability, maxConflicts);
        let attempts = 0;
        try {
          await withRetry(
            async () => {
              attempts++;
              return op();
            },
            { sleep, maxRetries: 10, baseDelayMs: 8 },
          );
          return { attempts, committed: true };
        } catch (err) {
          // An exhausted-retry OCC conflict legitimately means not committed. A non-OCC
          // throw is a real defect, not expected contention, so do not hide it behind a red cell.
          if (!(err instanceof Error) || (err as { code?: string }).code !== OCC_SQLSTATE) {
            console.error("contention writer threw a non-OCC error", err);
          }
          return { attempts, committed: false };
        }
      }),
    );
    setWriters(results);
    setRunning(false);
  };

  const totalAttempts = writers.reduce((sum, w) => sum + w.attempts, 0);
  const retries = totalAttempts - writers.length;
  const conflictRate = totalAttempts > 0 ? Math.round((retries / totalAttempts) * 100) : 0;
  const committed = writers.filter((w) => w.committed).length;
  const cells: (Writer | null)[] = writers.length
    ? writers
    : Array.from({ length: WRITERS }, () => null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void fire()}
          className="rounded-md border border-accent-soft px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {running ? "writing" : "fire 24 writers"}
        </button>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
          <input
            type="checkbox"
            checked={hotKey}
            onChange={(event) => setHotKey(event.target.checked)}
          />
          hot key (force contention)
        </label>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          occ retry on 40001
        </span>
      </div>

      <div className="grid grid-cols-12 gap-1">
        {cells.map((writer, i) => {
          const cls = !writer
            ? "bg-surface-2"
            : !writer.committed
              ? "bg-danger"
              : writer.attempts === 1
                ? "bg-accent"
                : "bg-warn";
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length, non-reordering grid
          return <div key={i} className={`aspect-square rounded-sm ${cls}`} />;
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>
          committed{" "}
          <span className="text-accent">
            {committed}/{writers.length || WRITERS}
          </span>
        </span>
        <span>
          retries <span className="text-warn">{retries}</span>
        </span>
        <span>
          conflict rate{" "}
          <span className={conflictRate > 30 ? "text-warn" : "text-accent"}>{conflictRate}%</span>
        </span>
      </div>
      <p className="font-mono text-[10px] text-muted">
        Random keys spread writes across the key range (near-zero conflict). A hot key forces 40001
        conflicts that the retry wrapper resolves. The live contention test runs against DSQL.
      </p>
    </div>
  );
}
