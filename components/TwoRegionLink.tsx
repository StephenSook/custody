import { StatusDot, type Tone } from "./ui";

interface Side {
  label: string;
  status: "live" | "error" | "connecting";
}

const ARC = "M 90 116 Q 300 14 510 116";

function toTone(status: Side["status"]): Tone {
  return status === "live" ? "live" : status === "error" ? "danger" : "idle";
}

/**
 * Bespoke two-region link: a curved arc between the two regional endpoints with a pulse
 * travelling along it (the commit propagating). Planned upgrade: a deck.gl + MapLibre map.
 * The latency readout shows the measured commit-in-A to visible-in-B time when live.
 */
export function TwoRegionLink({
  east,
  west,
  lastLatencyMs,
}: {
  east: Side;
  west: Side;
  lastLatencyMs: number | null;
}) {
  return (
    <div>
      <svg viewBox="0 0 600 150" className="w-full" role="img" aria-label="Two-region link">
        <title>Two-region consistency link</title>
        <defs>
          <linearGradient id="custody-arc" x1="0" x2="1">
            <stop offset="0" stopColor="oklch(0.84 0.17 152)" stopOpacity="0.1" />
            <stop offset="0.5" stopColor="oklch(0.84 0.17 152)" stopOpacity="0.85" />
            <stop offset="1" stopColor="oklch(0.84 0.17 152)" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <path
          d={ARC}
          fill="none"
          stroke="url(#custody-arc)"
          strokeWidth="2"
          strokeDasharray="2 6"
        />
        <circle r="4.5" fill="oklch(0.84 0.17 152)" opacity="0.95">
          <animateMotion
            dur="2.6s"
            repeatCount="indefinite"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="spline"
            keySplines="0.42 0 0.58 1"
            path={ARC}
          />
        </circle>

        {[
          { cx: 90, label: east.label, status: east.status },
          { cx: 510, label: west.label, status: west.status },
        ].map((node) => (
          <g key={node.label}>
            <circle
              cx={node.cx}
              cy={116}
              r="24"
              fill="oklch(0.23 0.016 250)"
              stroke="oklch(0.31 0.015 250)"
            />
            <circle
              cx={node.cx}
              cy={116}
              r="24"
              fill="none"
              stroke="oklch(0.84 0.17 152)"
              strokeOpacity={node.status === "live" ? 0.85 : 0.22}
            />
            <circle
              cx={node.cx}
              cy={116}
              r="3"
              fill="oklch(0.84 0.17 152)"
              fillOpacity={node.status === "live" ? 1 : 0.3}
            />
          </g>
        ))}
      </svg>

      <div className="mt-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <StatusDot tone={toTone(east.status)} /> {east.label}
        </span>
        <span className="text-accent">
          {lastLatencyMs !== null
            ? `commit visible cross-region in ${lastLatencyMs} ms`
            : "strongly consistent on commit"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          {west.label} <StatusDot tone={toTone(west.status)} />
        </span>
      </div>
    </div>
  );
}
