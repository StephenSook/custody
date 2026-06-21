"use client";

import { ConsentControls } from "./ConsentControls";
import { HashChainLedger } from "./HashChainLedger";
import { RegionPanel } from "./RegionPanel";
import { SpendCapMeter } from "./SpendCapMeter";
import { TwoRegionLink } from "./TwoRegionLink";
import { Panel } from "./ui";
import { useRegionStream } from "./useRegionStream";

// The watched demo subject. In the live demo this is the seeded id; the data is synthetic
// (no real minors). The consent controls act on it and the region streams observe it.
const DEMO_USER = "00000000-0000-4000-8000-000000000abc";
const DEMO_MINOR = DEMO_USER;

export function ControlRoom() {
  const east = useRegionStream("east", DEMO_USER, DEMO_MINOR);
  const west = useRegionStream("west", DEMO_USER, DEMO_MINOR);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-accent">Custody</p>
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
          <TwoRegionLink
            east={{ label: "us-east-1", status: east.status }}
            west={{ label: "us-east-2", status: west.status }}
            lastLatencyMs={null}
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
          <ConsentControls userId={DEMO_USER} minorId={DEMO_MINOR} />
        </Panel>

        <Panel title="Tamper-evident ledger" kicker="sha-256 hash chain" className="lg:col-span-3">
          <HashChainLedger />
        </Panel>
      </div>
    </div>
  );
}
