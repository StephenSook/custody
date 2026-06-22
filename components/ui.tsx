import type { ReactNode } from "react";

export function Panel({
  title,
  kicker,
  children,
  className = "",
  id,
}: {
  title?: string;
  kicker?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-xl border border-border bg-surface/60 shadow-[0_1px_0_oklch(1_0_0/0.03)_inset] backdrop-blur-sm ${className}`}
    >
      {(title || kicker) && (
        <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
          {title && <h2 className="text-sm font-medium tracking-tight text-fg">{title}</h2>}
          {kicker && (
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              {kicker}
            </span>
          )}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export type Tone = "live" | "warn" | "danger" | "idle";

export function StatusDot({ tone }: { tone: Tone }) {
  const color =
    tone === "live"
      ? "bg-accent"
      : tone === "warn"
        ? "bg-warn"
        : tone === "danger"
          ? "bg-danger"
          : "bg-muted";
  return (
    <span className="relative inline-flex h-2 w-2">
      {tone === "live" && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
    </span>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "danger" | "warn";
}) {
  const cls =
    tone === "accent"
      ? "border-accent-soft text-accent"
      : tone === "danger"
        ? "border-danger/60 text-danger"
        : tone === "warn"
          ? "border-warn/60 text-warn"
          : "border-border text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] ${cls}`}
    >
      {children}
    </span>
  );
}
