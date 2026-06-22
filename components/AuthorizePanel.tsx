"use client";

import { useState } from "react";

interface AuthResult {
  region: string;
  allow: boolean;
  reason: string;
  consentStatus: string;
  spendRemaining: string;
}

const BTN =
  "rounded-md border border-border px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition hover:bg-surface-2 disabled:opacity-50";

/**
 * Platform sandbox: the gate check a platform calls before letting a minor play or spend. Fires
 * /api/authorize against BOTH regional endpoints so the identical allow/deny shows the decision
 * is strongly consistent cross-region. Read-only reference contract on synthetic data.
 */
export function AuthorizePanel({ userId, minorId }: { userId: string; minorId: string }) {
  const [results, setResults] = useState<AuthResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  const check = async (action: "play" | "spend", amountMinor: number | undefined, lbl: string) => {
    setRunning(true);
    setLabel(lbl);
    setResults(null);
    try {
      const body = JSON.stringify({
        userId,
        minorId,
        action,
        ...(amountMinor != null ? { amountMinor } : {}),
      });
      const both = await Promise.all(
        (["east", "west"] as const).map(async (region) => {
          const res = await fetch(`/api/authorize?region=${region}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
          });
          if (!res.ok) {
            throw new Error(`authorize ${res.status}`);
          }
          return (await res.json()) as AuthResult;
        }),
      );
      setResults(both);
    } catch (err) {
      console.error("authorize failed", err);
      setResults(null);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] text-muted">
        The call a platform makes at the gate. It reads the strongly-consistent projections, so the
        decision is identical in both regions. Reference integration contract, synthetic data.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={running}
          className={BTN}
          onClick={() => void check("play", undefined, "authorize play")}
        >
          authorize play
        </button>
        <button
          type="button"
          disabled={running}
          className={BTN}
          onClick={() => void check("spend", 500, "authorize $5 spend")}
        >
          authorize $5 spend
        </button>
        <button
          type="button"
          disabled={running}
          className={BTN}
          onClick={() => void check("spend", 1800, "authorize $18 spend")}
        >
          authorize $18 spend
        </button>
      </div>

      {label && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {(results ?? []).map((r) => (
          <div
            key={r.region}
            className={`rounded-lg border p-3 ${
              r.allow ? "border-accent-soft/60 bg-accent/5" : "border-danger/60 bg-danger/10"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider">
              <span className="text-muted">{r.region === "east" ? "us-east-1" : "us-east-2"}</span>
              <span className={r.allow ? "text-accent" : "text-danger"}>
                {r.allow ? "ALLOW" : "DENY"}
              </span>
            </div>
            <div className="mt-1 font-mono text-[11px] text-fg">{r.reason}</div>
            <div className="mt-1 font-mono text-[10px] text-muted">
              consent {r.consentStatus.toLowerCase()} · remaining $
              {(Number(r.spendRemaining) / 100).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2/50 p-3 font-mono text-[10px] text-muted">
        {`curl -X POST custody-zeta.vercel.app/api/authorize?region=west \\
  -H 'content-type: application/json' \\
  -d '{"userId":"...","minorId":"...","action":"spend","amountMinor":1800}'`}
      </pre>
    </div>
  );
}
