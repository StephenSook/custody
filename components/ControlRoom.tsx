"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AuthorizePanel } from "./AuthorizePanel";
import { ConsentControls } from "./ConsentControls";
import { ContentionPanel } from "./ContentionPanel";
import { HashChainLedger } from "./HashChainLedger";
import { RegionPanel } from "./RegionPanel";
import { SdJwtPanel } from "./SdJwtPanel";
import { SpendCapMeter } from "./SpendCapMeter";
import { Starfield } from "./Starfield";
import { Panel } from "./ui";
import { useRegionStream } from "./useRegionStream";

// deck.gl + MapLibre are WebGL and must not server-render: load the map client-only.
const RegionArcMap = dynamic(() => import("./RegionArcMap"), {
  ssr: false,
  loading: () => (
    <div className="h-[340px] w-full rounded-lg border border-border bg-surface-2/40" />
  ),
});

// The watched demo subject. In the live demo this is the seeded id; the data is synthetic
// (no real minors). The consent controls act on it and the region streams observe it.
const DEMO_USER = "00000000-0000-4000-8000-000000000abc";
const DEMO_MINOR = DEMO_USER;

export function ControlRoom() {
  const east = useRegionStream("east", DEMO_USER, DEMO_MINOR);
  const west = useRegionStream("west", DEMO_USER, DEMO_MINOR);
  // Latest measured cross-region latency plus a counter that re-triggers the map pulse on
  // every commit (even when the measured value repeats).
  const [latency, setLatency] = useState<{ ms: number | null; key: number }>({ ms: null, key: 0 });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="aurora" aria-hidden />
      <Starfield />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="neon font-mono text-[11px] uppercase tracking-[0.35em] text-accent">
            Custody
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight text-fg sm:text-3xl">
            Consistency control room
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Parental consent and minor spend, strongly consistent across regions on commit, with a
            tamper-evident audit trail. Synthetic operational data only.
          </p>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
          Aurora DSQL, active-active
        </span>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Two-region link" kicker="strong consistency" className="lg:col-span-3">
          <RegionArcMap
            east={east.status}
            west={west.status}
            lastLatencyMs={latency.ms}
            pulseKey={latency.key}
          />
        </Panel>

        <Panel title="Region A" kicker="us-east-1">
          <RegionPanel label="primary" state={east.state} status={east.status} />
        </Panel>
        <Panel title="Region B" kicker="us-east-2">
          <RegionPanel label="peer" state={west.state} status={west.status} />
        </Panel>
        <Panel title="Spend cap" kicker="per minor">
          <SpendCapMeter
            totalMinor={east.state?.spend?.totalMinor ?? null}
            capMinor={east.state?.spend?.capMinor ?? null}
          />
        </Panel>

        <Panel title="Parent actions" kicker="server actions" className="lg:col-span-3">
          <ConsentControls
            userId={DEMO_USER}
            minorId={DEMO_MINOR}
            onLatency={(ms) => setLatency((p) => ({ ms, key: p.key + 1 }))}
          />
        </Panel>

        <Panel title="Platform gate" kicker="reference integration" className="lg:col-span-3">
          <AuthorizePanel userId={DEMO_USER} minorId={DEMO_MINOR} />
        </Panel>

        <Panel title="Tamper-evident ledger" kicker="sha-256 hash chain" className="lg:col-span-3">
          <HashChainLedger userId={DEMO_USER} refreshKey={latency.key} />
        </Panel>

        <Panel title="Concurrency" kicker="occ under contention" className="lg:col-span-3">
          <ContentionPanel />
        </Panel>

        <Panel
          title="Age verification"
          kicker="sd-jwt selective disclosure"
          className="lg:col-span-3"
        >
          <SdJwtPanel />
        </Panel>
      </div>
    </div>
  );
}
