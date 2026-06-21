"use client";

import { useState } from "react";

interface BurstResult {
  mode: "hot" | "spread";
  writers: number;
  committed: number;
  conflicts: number;
  forked: boolean;
  ms: number;
  seqs?: number[];
}

const WRITERS = 8;

/**
 * Fires real concurrent appends against the live Aurora DSQL cluster via /api/contention-burst
 * and shows the real outcome: how many SQLSTATE 40001 (OC000) commit conflicts the retry
 * wrapper resolved and that the chain stayed unforked. Not a simulation.
 */
export function ContentionPanel() {
  const [hotKey, setHotKey] = useState(true);
  const [result, setResult] = useState<BurstResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fire = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const mode = hotKey ? "hot" : "spread";
      const res = await fetch(`/api/contention-burst?mode=${mode}&n=${WRITERS}`, {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`burst ${res.status}`);
      }
      setResult((await res.json()) as BurstResult);
    } catch (err) {
      console.error("contention burst failed", err);
      setError("burst unavailable");
    } finally {
      setRunning(false);
    }
  };

  const committed = result?.committed ?? 0;
  const writers = result?.writers ?? WRITERS;
  const cells: (boolean | null)[] = Array.from({ length: writers }, (_, i) =>
    result ? i < committed : null,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={running}
          onClick={() => void fire()}
          className="rounded-md border border-accent-soft px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {running ? "writing live" : `fire ${WRITERS} writers`}
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
          live · sqlstate 40001
        </span>
      </div>

      <div className="grid grid-cols-12 gap-1">
        {cells.map((ok, i) => {
          const cls = ok === null ? "bg-surface-2" : ok ? "bg-accent" : "bg-danger";
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length, non-reordering grid
          return <div key={i} className={`aspect-square rounded-sm ${cls}`} />;
        })}
      </div>

      <div className="flex flex-wrap justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-muted">
        <span>
          committed{" "}
          <span className="text-accent">
            {committed}/{writers}
          </span>
        </span>
        <span>
          real 40001 conflicts <span className="text-warn">{result?.conflicts ?? 0}</span>
        </span>
        <span>
          chain forks{" "}
          <span className={result?.forked ? "text-danger" : "text-accent"}>
            {result?.forked ? "1+" : 0}
          </span>
        </span>
        <span>{result ? `${result.ms}ms` : ""}</span>
      </div>

      {error && <p className="font-mono text-[10px] text-danger">{error}</p>}
      <p className="font-mono text-[10px] text-muted">
        Fires real concurrent appends against the live Aurora DSQL cluster. A hot key makes them
        collide on the composite primary key, returning real SQLSTATE 40001 conflicts that the retry
        wrapper resolves into one unforked chain. Random keys (hot key off) spread writes so they do
        not conflict. Synthetic throwaway subjects.
      </p>
    </div>
  );
}
