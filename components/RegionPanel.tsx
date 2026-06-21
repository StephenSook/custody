import { Pill, StatusDot } from "./ui";
import type { RegionState, StreamStatus } from "./useRegionStream";

function dollars(minor: string): string {
  return `$${(Number(minor) / 100).toFixed(2)}`;
}

export function RegionPanel({
  label,
  state,
  status,
}: {
  label: string;
  state: RegionState | null;
  status: StreamStatus;
}) {
  const consent = state?.consent ?? null;
  const spend = state?.spend ?? null;
  const tone = status === "live" ? "live" : status === "error" ? "danger" : "idle";

  return (
    <div className="rounded-lg border border-border bg-surface-2/50 p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">{label}</span>
        <StatusDot tone={tone} />
      </div>
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">consent</span>
          {consent ? (
            <Pill tone={consent.status === "GRANTED" ? "accent" : "danger"}>{consent.status}</Pill>
          ) : (
            <span className="font-mono text-xs text-muted">standby</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">spend</span>
          <span className="font-mono text-xs text-fg">
            {spend ? `${dollars(spend.totalMinor)} / ${dollars(spend.capMinor)}` : "standby"}
          </span>
        </div>
      </div>
    </div>
  );
}
