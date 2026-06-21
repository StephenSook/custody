"use client";

import { useState, useTransition } from "react";
import { proveAgeBracketAction } from "@/app/age-actions";
import type { AgeProofResult } from "@/src/services/dto";

export function SdJwtPanel() {
  const [proof, setProof] = useState<AgeProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const prove = () => {
    setError(null);
    startTransition(async () => {
      try {
        setProof(await proveAgeBracketAction());
      } catch (err) {
        // The proof is a scored showpiece; surface failure, do not swallow it.
        console.error("age-bracket proof failed", err);
        setProof(null);
        setError(err instanceof Error ? err.message : "proof failed");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2/50 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            issuer credential
          </p>
          <dl className="mt-2 space-y-1 font-mono text-xs">
            <div className="flex justify-between">
              <dt className="text-muted">date of birth</dt>
              <dd className="text-fg">2012-**-**</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">age bracket</dt>
              <dd className="text-fg">13-15</dd>
            </div>
          </dl>
        </div>
        <div className="rounded-lg border border-accent-soft/60 bg-accent/5 p-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
            disclosed to platform
          </p>
          {proof ? (
            <dl className="mt-2 space-y-1 font-mono text-xs">
              <div className="flex justify-between">
                <dt className="text-muted">date of birth</dt>
                <dd className="text-danger">withheld</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">age bracket</dt>
                <dd className="text-accent">{proof.bracket}</dd>
              </div>
            </dl>
          ) : (
            <p className={`mt-2 font-mono text-xs ${error ? "text-danger" : "text-muted"}`}>
              {error ? "proof failed, retry" : "run the proof"}
            </p>
          )}
        </div>
      </div>

      {proof && (
        <div className="space-y-1 font-mono text-[10px] text-muted">
          <p>
            dob disclosed:{" "}
            <span className={proof.dobDisclosed ? "text-danger" : "text-accent"}>
              {String(proof.dobDisclosed)}
            </span>{" "}
            (selective disclosure, RFC 9901)
          </p>
          <p>stored: age bracket plus a credential hash, never the date of birth</p>
          <p className="truncate">hash {proof.credentialHash.slice(0, 40)}</p>
        </div>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={prove}
        className="rounded-md border border-accent-soft px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        {pending ? "proving" : proof ? "re-prove bracket" : "prove age bracket"}
      </button>
    </div>
  );
}
