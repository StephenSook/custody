# Custody

Globally-consistent parental-consent and minor-spend-control ledger. A neutral system-of-record for gaming, social, and entertainment platforms.

A parent grants or revokes consent and sets a spending cap for a minor. The decision is strongly consistent across regions on commit, backed by a tamper-evident, hash-chained audit trail.

Built for the H0 hackathon (Hack the Zero Stack with Vercel v0 and AWS Databases), Track 3 (million-scale global app).

## The problem

When a parent revokes consent or hits a spend cap on a global platform, the decision often does not take effect everywhere at once. The child can keep playing, or keep spending, in another region while the systems reconcile, and the platform holds no verifiable proof of when the parent acted. Custody closes that window.

## What it does

- Strongly-consistent cross-region consent: a revocation is authoritative in every region on commit, with no replication-lag window to exploit.
- Strongly-consistent spend caps: once cumulative spend reaches the cap in any region, no other region authorizes the next purchase.
- Tamper-evident audit trail: a per-user SHA-256 hash chain proves exactly when each decision took effect, and a live verification pinpoints any tampering.

## Stack

- Database: Amazon Aurora DSQL, active-active multi-region (strong consistency on commit, no replication-lag window).
- Frontend: Next.js 16 (App Router) on Vercel.
- Connection: Vercel OIDC federation to an AWS IAM role to a region-scoped DSQL token. No stored database password.
- Crypto: per-user SHA-256 hash chain in the application layer (DSQL has no database extensions).

## Architecture

Three strict layers:
1. Transport (Next.js): Server Actions for mutations, Route Handlers for reads and the cross-region streams. Every input validated with Zod.
2. Domain and services (pure TypeScript): business rules, the optimistic-concurrency retry wrapper, and all cryptography. Framework-independent and unit-tested.
3. Data access (node-postgres, one pool per regional endpoint): the only layer that touches the database or credentials.

See `docs/architecture/` for the diagram.

## Data

All data is synthetic operational data. No real minors, no biometrics, no personal data.

## Develop

Requires Node 22+ and pnpm.

```
pnpm install
pnpm dev          # local dev server
pnpm typecheck    # tsc --noEmit
pnpm lint
pnpm test         # unit + integration
pnpm test:e2e     # playwright
pnpm build
pnpm migrate      # run DSQL migrations
pnpm seed         # load synthetic data
```

Copy `.env.example` to `.env` and fill in your Aurora DSQL endpoints (provisioned via the Vercel AWS integration or the AWS console). Never commit `.env`.

## License

Apache-2.0. See `LICENSE`.
