"use client";

import { motion } from "motion/react";

export function SpendCapMeter({
  totalMinor,
  capMinor,
}: {
  totalMinor: string | null;
  capMinor: string | null;
}) {
  const total = totalMinor ? Number(totalMinor) : 0;
  const cap = capMinor ? Number(capMinor) : 0;
  const pct = cap > 0 ? Math.min(100, (total / cap) * 100) : 0;
  const atCap = cap > 0 && total >= cap;
  const near = pct >= 80;
  const color = atCap
    ? "oklch(0.66 0.21 25)"
    : near
      ? "oklch(0.83 0.15 85)"
      : "oklch(0.84 0.17 152)";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-muted">spend / cap</span>
        <span className="text-fg">
          {cap > 0 ? `$${(total / 100).toFixed(2)} / $${(cap / 100).toFixed(2)}` : "no cap set"}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      {atCap && (
        <p className="font-mono text-[10px] uppercase tracking-wider text-danger">
          cap reached: further spend declined in every region
        </p>
      )}
    </div>
  );
}
