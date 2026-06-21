"use client";

import { useState, useTransition } from "react";
import {
  grantConsentAction,
  recordSpendAction,
  revokeConsentAction,
  setCapAction,
} from "@/app/actions";

const BTN =
  "rounded-md border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition disabled:opacity-50";
const ACCENT = `${BTN} border-accent-soft text-accent hover:bg-accent/10`;
const DANGER = `${BTN} border-danger/60 text-danger hover:bg-danger/10`;
const NEUTRAL = `${BTN} border-border text-muted hover:bg-surface-2`;

function uuid(): string {
  return crypto.randomUUID();
}

export function ConsentControls({ userId, minorId }: { userId: string; minorId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (action: () => Promise<unknown>, label: string) => {
    startTransition(async () => {
      try {
        await action();
        setMessage(`${label}: committed`);
      } catch (err) {
        setMessage(`${label}: ${err instanceof Error ? err.message : "failed"}`);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={ACCENT}
          onClick={() => run(() => grantConsentAction({ userId, idempotencyKey: uuid() }), "grant")}
        >
          grant consent
        </button>
        <button
          type="button"
          disabled={pending}
          className={DANGER}
          onClick={() =>
            run(() => revokeConsentAction({ userId, idempotencyKey: uuid() }), "revoke")
          }
        >
          revoke
        </button>
        <button
          type="button"
          disabled={pending}
          className={NEUTRAL}
          onClick={() =>
            run(
              () => setCapAction({ minorId, capMinor: 2000, idempotencyKey: uuid() }),
              "set cap $20",
            )
          }
        >
          set cap $20
        </button>
        <button
          type="button"
          disabled={pending}
          className={NEUTRAL}
          onClick={() =>
            run(
              () =>
                recordSpendAction({
                  minorId,
                  amountMinor: 500,
                  currency: "USD",
                  idempotencyKey: uuid(),
                }),
              "spend $5",
            )
          }
        >
          spend $5
        </button>
        <button
          type="button"
          disabled={pending}
          className={NEUTRAL}
          onClick={() =>
            run(
              () =>
                recordSpendAction({
                  minorId,
                  amountMinor: 1800,
                  currency: "USD",
                  idempotencyKey: uuid(),
                }),
              "spend $18",
            )
          }
        >
          spend $18
        </button>
      </div>
      {message && <p className="font-mono text-[11px] text-muted">{message}</p>}
    </div>
  );
}
