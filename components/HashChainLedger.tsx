"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import {
  type ChainEntry,
  computeEntryHash,
  GENESIS_PREV_HASH,
  verifyChain,
} from "@/src/crypto/hashChain";

// An illustrative chain so the verifier is interactive standalone. In the live demo the
// entries come from the per-user DSQL hash chain; the verification algorithm is identical.
const SEED_EVENTS: Record<string, unknown>[] = [
  { eventType: "GRANT", seq: 1 },
  { eventType: "SET_CAP", capMinor: "2000", seq: 2 },
  { eventType: "SPEND", amountMinor: "500", authorized: true, seq: 3 },
  { eventType: "SPEND", amountMinor: "1800", authorized: false, seq: 4 },
  { eventType: "REVOKE", seq: 5 },
];

async function buildChain(payloads: Record<string, unknown>[]): Promise<ChainEntry[]> {
  const entries: ChainEntry[] = [];
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < payloads.length; i++) {
    const payload = payloads[i] as Record<string, unknown>;
    const entryHash = await computeEntryHash(payload, prev);
    entries.push({ seq: i + 1, payload, prevHash: prev, entryHash });
    prev = entryHash;
  }
  return entries;
}

export function HashChainLedger() {
  const [entries, setEntries] = useState<ChainEntry[]>([]);
  const [brokenFrom, setBrokenFrom] = useState<number | null>(null);
  const [verifying, setVerifying] = useState(false);

  const rebuild = useCallback(async () => {
    setEntries(await buildChain(SEED_EVENTS));
    setBrokenFrom(null);
  }, []);

  useEffect(() => {
    void rebuild();
  }, [rebuild]);

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
          disabled={verifying}
          className="rounded-md border border-accent-soft px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {verifying ? "verifying" : "verify chain"}
        </button>
        <button
          type="button"
          onClick={() => void rebuild()}
          className="rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:bg-surface-2"
        >
          reset
        </button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em]">
          {brokenFrom === null ? (
            <span className="text-accent">chain intact</span>
          ) : (
            <span className="text-danger">broken from #{brokenFrom + 1}</span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const broken = brokenFrom !== null && i >= brokenFrom;
            const eventType = String(
              (entry.payload as { eventType?: string }).eventType ?? "EVENT",
            );
            return (
              <motion.div
                key={entry.entryHash}
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
