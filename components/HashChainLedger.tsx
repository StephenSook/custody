"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { type ChainEntry, verifyChain } from "@/src/crypto/hashChain";

interface RawEntry {
  seq: number;
  payload: Record<string, unknown>;
  prevHash: string;
  entryHash: string;
}

/**
 * Verifies the REAL per-user consent hash chain fetched live from Aurora DSQL (via
 * /api/ledger), not a client-side constant. Verify recomputes each entry's hash over the
 * stored payload and prev_hash and compares to the stored entry_hash, so a judge can tamper a
 * block and watch the chain break from the first altered index. The data is synthetic.
 */
export function HashChainLedger({
  userId,
  refreshKey = 0,
}: {
  userId: string;
  refreshKey?: number;
}) {
  const [entries, setEntries] = useState<ChainEntry[]>([]);
  const [brokenFrom, setBrokenFrom] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    setBrokenFrom(null);
    try {
      const res = await fetch(`/api/ledger?userId=${encodeURIComponent(userId)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`ledger ${res.status}`);
      }
      const data = (await res.json()) as { entries: RawEntry[] };
      setEntries(
        data.entries.map((e) => ({
          seq: e.seq,
          payload: e.payload,
          prevHash: e.prevHash,
          entryHash: e.entryHash,
        })),
      );
      setStatus("ready");
    } catch (err) {
      console.error("ledger load failed", err);
      setStatus("error");
    }
  }, [userId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional refetch trigger (refetch the live chain after each commit)
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const verify = useCallback(async () => {
    setVerifying(true);
    const result = await verifyChain(entries);
    setBrokenFrom(result.valid ? null : result.firstBrokenIndex);
    setVerifying(false);
  }, [entries]);

  const tamper = useCallback((index: number) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? { ...entry, payload: { ...(entry.payload as Record<string, unknown>), tampered: true } }
          : entry,
      ),
    );
    setBrokenFrom(null);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void verify()}
          disabled={verifying || entries.length === 0}
          className="rounded-md border border-accent-soft px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {verifying ? "verifying" : "verify chain"}
        </button>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:bg-surface-2"
        >
          reload
        </button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em]">
          {status === "loading" ? (
            <span className="text-muted">loading live chain</span>
          ) : status === "error" ? (
            <span className="text-danger">could not load live chain</span>
          ) : brokenFrom === null ? (
            <span className="text-accent">chain intact</span>
          ) : (
            <span className="text-danger">broken from #{brokenFrom + 1}</span>
          )}
        </span>
      </div>

      {status === "ready" && entries.length === 0 ? (
        <p className="font-mono text-[11px] text-muted">
          no consent events yet. grant or revoke consent to append the first block.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const broken = brokenFrom !== null && i >= brokenFrom;
            const eventType = String(
              (entry.payload as { eventType?: string }).eventType ?? "EVENT",
            );
            return (
              <motion.div
                key={`${entry.seq}-${entry.entryHash}`}
                layout
                initial={{ opacity: 0, x: 24, filter: "blur(8px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
                className={`group rounded-lg border px-3 py-2 transition-colors ${
                  broken
                    ? "border-danger/70 bg-danger/10 text-danger"
                    : "border-border bg-surface-2/60 text-fg"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">
                    <span className="text-muted">#{entry.seq}</span> {eventType}
                  </span>
                  <button
                    type="button"
                    onClick={() => tamper(i)}
                    className="font-mono text-[10px] uppercase tracking-wider text-danger opacity-0 transition group-hover:opacity-100"
                  >
                    tamper
                  </button>
                </div>
                <div className="mt-1 truncate font-mono text-[10px] text-muted">
                  prev {entry.prevHash.slice(0, 16)}
                </div>
                <div className="truncate font-mono text-[10px] text-muted">
                  hash{" "}
                  <span className={broken ? "text-danger" : "text-accent/80"}>
                    {entry.entryHash.slice(0, 28)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
