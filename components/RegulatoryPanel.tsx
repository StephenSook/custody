"use client";

/**
 * Compliance mapping. Each row links a regulatory obligation to a Custody feature that is
 * already built and live, with a link to the official source text. Custody is a neutral
 * system of record, so the framing is always "supports" or "evidence for", never "certified
 * compliant". The obligations are condensed from the official text (verified against the
 * linked sources); click a row to jump to the feature that backs it. Synthetic data only.
 */

interface RegRow {
  reg: string;
  citation: string;
  obligation: string;
  supports: string;
  anchor: string;
  href: string;
}

// Citations and source URLs verified against EUR-Lex, the eCFR (via Cornell LII) and
// legislation.gov.uk. Obligations are short faithful summaries of the linked text.
const ROWS: RegRow[] = [
  {
    reg: "EU Digital Services Act",
    citation: "Reg (EU) 2022/2065, Art 28(1)",
    obligation:
      "Platforms accessible to minors must take proportionate measures for a high level of minors' privacy, safety, and security.",
    supports: "cross-region revocation",
    anchor: "parent-actions",
    href: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2065",
  },
  {
    reg: "GDPR",
    citation: "Reg (EU) 2016/679, Art 7(3)",
    obligation: "Withdrawing consent must be possible at any time and as easy as giving it.",
    supports: "cross-region revocation",
    anchor: "parent-actions",
    href: "https://eur-lex.europa.eu/eli/reg/2016/679/art_7/par_3/oj",
  },
  {
    reg: "GDPR",
    citation: "Reg (EU) 2016/679, Art 8(1)",
    obligation:
      "Below the applicable age (16, or as low as 13 by member state), consent-based processing of a child's data is lawful only with verified parental authorization.",
    supports: "age-bracket consent gate",
    anchor: "age-verification",
    href: "https://eur-lex.europa.eu/eli/reg/2016/679",
  },
  {
    reg: "GDPR",
    citation: "Reg (EU) 2016/679, Art 5(1)(c)",
    obligation:
      "Personal data must be limited to what is necessary for the purpose (data minimisation).",
    supports: "age-bracket disclosure",
    anchor: "age-verification",
    href: "https://eur-lex.europa.eu/eli/reg/2016/679",
  },
  {
    reg: "GDPR",
    citation: "Reg (EU) 2016/679, Art 17",
    obligation:
      "On withdrawal of consent with no other legal ground, the controller must erase the personal data without undue delay.",
    supports: "append-only audit trail",
    anchor: "ledger",
    href: "https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng",
  },
  {
    reg: "US COPPA Rule",
    citation: "16 CFR 312.5",
    obligation:
      "Operators must obtain verifiable parental consent before collecting a child's personal information.",
    supports: "verifiable consent record",
    anchor: "ledger",
    href: "https://www.law.cornell.edu/cfr/text/16/312.5",
  },
  {
    reg: "UK Online Safety Act 2023",
    citation: "c.50, s.12 (Ofcom)",
    obligation:
      "Services likely to be accessed by children must apply highly effective age assurance and proportionate protection.",
    supports: "age-assurance record",
    anchor: "age-verification",
    href: "https://www.legislation.gov.uk/ukpga/2023/50/section/12/enacted",
  },
];

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
}

export function RegulatoryPanel() {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] text-muted">
        Custody supports compliance with these regimes. It is a neutral system of record, not a
        legal certification, and the regulated platform remains the responsible party. Each row
        links a built, live feature to the obligation it provides evidence for. Click a row to jump
        to the feature.
      </p>

      <div className="flex flex-col gap-2">
        {ROWS.map((r) => (
          <div
            key={r.citation}
            className="rounded-lg border border-border bg-surface-2/40 p-3 transition-colors hover:border-accent-soft/60"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[11px] font-medium text-fg">{r.reg}</span>
              <a
                href={r.href}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[10px] uppercase tracking-wider text-muted underline-offset-2 hover:text-accent hover:underline"
              >
                {r.citation}
              </a>
            </div>
            <p className="mt-1 text-[11px] text-muted">{r.obligation}</p>
            <button
              type="button"
              onClick={() => jumpTo(r.anchor)}
              className="mt-2 inline-flex items-center gap-1 rounded-full border border-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-accent transition hover:bg-accent/10"
            >
              supports: {r.supports}
            </button>
          </div>
        ))}
      </div>

      <p className="font-mono text-[10px] text-muted">
        Architectural note: Amazon QLDB ends support on 31 July 2025. Custody rebuilds its
        tamper-evident, hash-chained ledger capability in the application layer on Aurora DSQL.
      </p>
    </div>
  );
}
