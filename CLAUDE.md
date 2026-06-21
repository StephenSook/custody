# CLAUDE.md

This is the single source of truth for building Custody. Follow every rule here. When a rule says YOU MUST or NEVER, treat it as non-negotiable.

## Project overview

Custody is a globally-consistent parental-consent and minor-spend-control ledger: a neutral system-of-record for gaming and social platforms. A parent grants or revokes consent and sets spending caps for a minor, and the decision is strongly consistent across regions on commit, backed by a tamper-evident audit trail.

Built for the H0 hackathon, Track 3 (million-scale global app). The database spine is Amazon Aurora DSQL (active-active multi-region). The frontend is Next.js on Vercel. All data is synthetic operational data: no real minors, no biometrics, no personal data.

The headline demo is a live cross-region consent revocation and a live cross-region spend-cap enforcement, both strongly consistent on commit, plus live hash-chain verification of the audit trail.

IMPORTANT framing rule: never describe the cross-region behavior as "instant" or "within the same second." The correct claim is "strongly consistent on commit, with no vulnerable window." The commit pays roughly two cross-region round trips, and OCC retries can add time. Stating this precisely is more credible than claiming instant.

## Architecture map

Three layers, strict separation:

1. Transport (Next.js 16 App Router). Server Actions for internal mutations (grant consent, revoke consent, set cap, record spend). Route Handlers for GET endpoints and the cross-region read demo. Validate every input with Zod at this boundary.
2. Domain and services (pure TypeScript, framework-independent). Owns the business rules, the OCC retry wrapper, and all cryptography. This layer is where the correctness logic lives so it can be unit-tested without the framework.
3. Data access (node-postgres via AuroraDSQLPool). One pool per regional endpoint. This is the only layer that touches the database or environment credentials. NEVER import it from a client component.

Connection path: Vercel OIDC federation to an AWS IAM role to a region-scoped DSQL IAM token. There is no stored database password.

Crypto runs in the app layer (optionally a Lambda) because DSQL has no extensions. Lambda is optional and only worth it to showcase a least-privileged crypto boundary. Inline crypto is fine.

Directory layout:

```
custody/
  app/                      # App Router routes, layouts, route handlers
    api/.../route.ts        # GET endpoints + cross-region read demo
  src/
    domain/                 # pure business rules: consent/spend logic, projection updates
    services/               # Server Action implementations, orchestration
    data/                   # AuroraDSQLPool, OCC retry helper, parameterized queries
    crypto/                 # SHA-256 hash chain, SD-JWT selective-disclosure verify
    types/                  # shared TypeScript types and Zod schemas
  scripts/seed/             # synthetic-data seeding (no real minors)
  tests/{unit,integration,e2e}/
  .claude/                  # settings, skills, agents, commands
  CLAUDE.md
  .env.example
  LICENSE  NOTICE
```

## Commands

Use pnpm.

```
pnpm dev          # local dev server
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint (or biome)
pnpm test         # vitest (unit + integration)
pnpm test:e2e     # playwright
pnpm build        # next build
pnpm seed         # load synthetic operational data
pnpm migrate      # run DSQL migrations (one DDL per transaction, async indexes)
```

## Hard database rules (Aurora DSQL)

DSQL is PostgreSQL-compatible but it is NOT PostgreSQL. YOU MUST follow every rule below.

Keys and integrity:
- Use random UUID primary keys via gen_random_uuid(). NEVER use SERIAL or BIGSERIAL (they create hot keys and DSQL rejects the pseudo-type).
- NEVER use foreign key constraints. Enforce referential integrity in the application layer.
- NEVER use triggers or stored procedures (PL/pgSQL). DSQL does not support them.

Writes and concurrency:
- ALWAYS wrap every write transaction in the withRetry OCC helper. Reads NEVER retry.
- DSQL detects conflicts at commit and returns SQLSTATE 40001 (OC000 is a row write-write conflict, OC001 is a schema conflict). Both are safe to retry. Retry the whole transaction, never part of it.
- Make every write idempotent. The client supplies a request UUID, store it under a UNIQUE async index, and use INSERT ... ON CONFLICT (idempotency_key) DO NOTHING so a replay is a no-op.
- Keep each transaction tiny. Hard limits: 3,000 rows changed per transaction, 10 MiB per transaction, 5 minutes per transaction, 60 minutes per connection, 10,000 connections per cluster.

The append-only plus projection pattern (the core correctness design):
- Event tables are append-only. NEVER UPDATE or DELETE a ledger row. DSQL has no triggers, so enforce append-only in the data-access layer.
- Current consent status and current spend total are DERIVED per-entity projection rows, updated in the SAME transaction as the event append. One row per user or per minor. NEVER a single global counter row, which is a hot key and will throw cascading conflicts.
- CRITICAL hash-chain serialization: serialize same-user appends through a shared composite primary key (user_id, seq), so two concurrent appends collide on the primary key, conflict, and one retries. Do NOT serialize by reading the chain tip with a plain SELECT. DSQL does not conflict-check plain reads, so a read-then-insert with an independent key would let both commit and silently fork the chain. If a design must read-then-decide on a tip, use SELECT ... FOR UPDATE on that row, but the composite-key approach is cleaner and preferred.

Schema and migrations:
- Build every index with CREATE INDEX ASYNC, NEVER CREATE INDEX. Wait on sys.jobs or sys.wait_for_job before relying on a new index, especially the UNIQUE idempotency indexes (a UNIQUE async index does not enforce uniqueness until its build job completes).
- One DDL statement per transaction. NEVER mix DDL and DML in one transaction. NEVER use TRUNCATE (use DELETE).
- JSON and JSONB are supported but NOT indexable (there is no GIN on DSQL). Store the opaque event payload as jsonb, but promote any field you filter or look up on into a typed, indexed column.
- Store money as integer minor units (bigint). NEVER use a float for money.

Connection rules:
- One AuroraDSQLPool per regional endpoint, each with its own region-scoped token. A token for one region will NOT authenticate against another region's endpoint.
- Set pool max lifetime to 45 to 55 minutes with jitter, under the 60-minute hard cap. Use sslmode=require.
- NEVER use PgBouncer, pgpool, or RDS Proxy. Client-side pooling only.
- A multi-region cluster must be one same-geography Region set (for example us-east-1 and us-east-2 with a us-west-2 witness). Cross-continent multi-region is not supported. Confirm the chosen region pair is in a supported set.

## Crypto rules

- All cryptography runs in the app or Lambda layer. DSQL has no pgcrypto.
- The audit trail is a per-user SHA-256 hash chain. entry_hash = SHA256(canonicalJSON(payload) + prev_hash). The genesis prev_hash is 64 zeros.
- Use canonical JSON (RFC 8785 / JCS): sorted keys, stable number formatting, hash the UTF-8 bytes. Without this you will get false tamper positives.
- The verify function recomputes every entry and reports the first entry where the stored hash does not equal the recomputed hash.
- SD-JWT: use @sd-jwt/sd-jwt-vc (RFC 9901). Verify holder key binding BEFORE trusting any disclosed claim: check cnf.jwk, typ is kb+jwt, alg is not none, iat is within an acceptable window, and nonce, aud, and sd_hash. Verify the issuer signature against a known issuer key.
- Store only the age bracket and a credential hash. NEVER store raw date of birth, identity, or biometrics.
- Full zero-knowledge proofs are out of scope. Selective disclosure of an age bracket is the realistic equivalent. NEVER claim a ZKP that was not built.

## Security rules

- NEVER commit secrets. .env is gitignored, .env.example holds placeholders only, and GitHub push protection stays on.
- Every Server Action is a public POST endpoint. Validate all input with Zod and re-check authentication and authorization inside the action. A page-level check is not enough.
- proxy.ts (formerly middleware.ts) is routing and UX, NOT a security boundary. Auth lives in actions, route handlers, and the data layer.
- NEVER use localStorage or sessionStorage. Use React state in the client, and httpOnly secure sameSite cookies for sessions.
- Mark every credential-bearing Vercel environment variable as sensitive. Connect to AWS via OIDC with no stored keys.
- Scope the runtime IAM role to dsql:DbConnect on the specific cluster ARN. Use dsql:DbConnectAdmin only for migrations.
- The public judging demo runs on a read-only or append-only database role so judges cannot wipe state. Rate-limit mutation routes with Upstash.
- Pin Next.js to 16.2.6 or later.

## Style and voice guardrails

- IMPORTANT: NEVER use em-dashes anywhere. Not in code comments, commit messages, README, UI copy, or any output. Use periods, commas, colons, or parentheses.
- Plain builder voice. No startup fluff, no marketing language, no overclaiming a capability that was not built.
- The product UI stays generic and universal. NEVER hardcode persona names into the product, demo pages, or seed data shown in the app. Named personas belong only to spoken pitch narration, never the product layer.
- There is a private internal planning methodology. NEVER reference it, describe it, or write any part of it into the repo, code comments, commits, README, the demo, or any public artifact. As far as the codebase is concerned, it does not exist.

## Workflow

- Explore, then plan, then implement. For any non-trivial feature, write a short plan before writing code.
- Build the correctness core (OCC retry helper, hash chain, idempotency) test-first. These carry both the Technical Implementation score and the demo reliability.
- After any change, run typecheck and the targeted tests before moving on.
- Use conventional commits.
- Day-one order: stand up the two-region DSQL cluster and the Vercel OIDC path FIRST. Verify a cross-region commit, then run a concurrent same-user append test to confirm exactly one 40001 OC000 and a clean, unforked chain. Retire that risk before building features on top of it.

## Verification

Run these to verify your own work before considering a task done:

```
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Priority tests:
- OCC retry wrapper: inject a mock that throws SQLSTATE 40001 on the first N attempts and succeeds after, assert exponential backoff with jitter and a max retry count, and assert read-only paths do not retry.
- Hash-chain verify: an intact chain passes, and a mutated, deleted, or reordered entry is pinpointed at the exact first broken index.
- Idempotency: the same request submitted twice produces one logical effect and a stable projection.
- One Playwright happy-path E2E covering grant consent, spend within and over the cap, and audit verification.

## Canonical packages (pin exact versions, verify with npm at install time)

Backend and data:
- pg
- @aws/aurora-dsql-node-postgres-connector (AuroraDSQLPool)
- @vercel/functions
- @vercel/oidc-aws-credentials-provider (this is the current package, NOT the legacy @vercel/functions/oidc)
- @aws-sdk/dsql-signer
- @sd-jwt/core
- @sd-jwt/sd-jwt-vc
- zod
- @upstash/ratelimit

Frontend:
- next (16.2.6 or later)
- react, react-dom (19.2)
- tailwindcss (v4)
- shadcn/ui (new-york style, then eject and re-tokenize)
- radix-ui
- motion (12.40, import from motion/react)
- deck.gl, react-map-gl, maplibre-gl (cross-region map)
- recharts (v3, via shadcn charts)

## Reference: OCC retry wrapper

This is the canonical pattern. Every write goes through it.

```typescript
const OCC_SQLSTATE = "40001";
const BASE_DELAY_MS = 50;

interface DatabaseError extends Error { code?: string; }
function isDatabaseError(err: unknown): err is DatabaseError {
  return err instanceof Error && "code" in err;
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const isOCC = isDatabaseError(err) && err.code === OCC_SQLSTATE;
      if (isOCC && attempt < maxRetries) {
        const backoff = BASE_DELAY_MS * 2 ** attempt;
        const jitter = Math.random() * backoff;
        await new Promise((r) => setTimeout(r, backoff + jitter));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}
```

## Reference: schema (Aurora DSQL DDL)

Append-only event logs with shared composite primary keys (serialize same-entity appends), plus per-entity derived projections (never a global hot row). Apply each statement in its own transaction. Build every index with CREATE INDEX ASYNC.

```sql
CREATE TABLE consent_event (
  user_id         uuid        NOT NULL,
  seq             bigint      NOT NULL,            -- monotonic per-user chain position
  event_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_type      varchar(32) NOT NULL,           -- GRANT | REVOKE
  payload         jsonb       NOT NULL,            -- opaque event body, not indexable on DSQL
  prev_hash       char(64)    NOT NULL,            -- hex SHA-256 of previous entry (genesis = 64 zeros)
  entry_hash      char(64)    NOT NULL,
  idempotency_key uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seq)                       -- co-locates and serializes a user's chain
);

CREATE TABLE spend_event (
  minor_id        uuid        NOT NULL,
  seq             bigint      NOT NULL,
  event_id        uuid        NOT NULL DEFAULT gen_random_uuid(),
  amount_minor    bigint      NOT NULL,            -- integer minor units, never float
  currency        char(3)     NOT NULL,
  payload         jsonb       NOT NULL,
  prev_hash       char(64)    NOT NULL,
  entry_hash      char(64)    NOT NULL,
  idempotency_key uuid        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (minor_id, seq)
);

CREATE TABLE consent_status_projection (
  user_id         uuid        NOT NULL PRIMARY KEY,
  current_status  varchar(32) NOT NULL,
  last_seq        bigint      NOT NULL,
  last_entry_hash char(64)    NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE spend_total_projection (
  minor_id     uuid        NOT NULL PRIMARY KEY,
  total_minor  bigint      NOT NULL,
  cap_minor    bigint      NOT NULL,
  last_seq     bigint      NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE parent_child_link (
  parent_id  uuid        NOT NULL,
  child_id   uuid        NOT NULL,
  status     varchar(16) NOT NULL,                 -- ACTIVE | REVOKED
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, child_id)                -- app-layer referential integrity, no FK
);

CREATE UNIQUE INDEX ASYNC consent_idem_idx ON consent_event (idempotency_key);
CREATE UNIQUE INDEX ASYNC spend_idem_idx   ON spend_event (idempotency_key);
CREATE INDEX ASYNC consent_user_time_idx   ON consent_event (user_id, created_at);
CREATE INDEX ASYNC spend_minor_time_idx    ON spend_event (minor_id, created_at);
CREATE INDEX ASYNC pcl_child_idx           ON parent_child_link (child_id);
```

## Frontend stack (locked)

Next.js 16.2.x (App Router), React 19.2. Server Components by default. Add "use client" only at the smallest leaf that needs interactivity (the SSE subscription, the map, the ledger, animated counters).

- Realtime is the make-or-break decision. Server-Sent Events over a Route Handler is the PRIMARY transport. Vercel cannot host WebSocket servers. Two SSE endpoints, one per region (for example app/api/stream/us-east/route.ts), each returns a ReadableStream with Content-Type text/event-stream, Cache-Control no-cache, and X-Accel-Buffering: no. Send an initial event immediately, then a periodic heartbeat. Lift the EventSource subscriber into a "use client" provider in the layout so it survives navigation. Ably is the parallel hot-standby (publish the same region-commit events to an Ably channel; flip a flag if SSE stalls on venue wifi). A 250 to 500ms poll of both regional snapshot endpoints is the floor fallback.
- Mark the SSE route and every live data path dynamic (export const dynamic = "force-dynamic"). A live consistency demo must never serve cached state. Use caching only for genuinely static content.
- Styling: Tailwind CSS v4 (CSS-first, OKLCH tokens, no tailwind.config.js). shadcn/ui new-york, then eject and re-tokenize so it never reads as a template. Radix primitives for accessible dialogs, menus, tabs.
- Animation: Motion 12.40 (import from motion/react). Use AnimatePresence, layout, spring transitions, whileInView, and useReducedMotion.
- Map (showpiece 1): deck.gl + react-map-gl + MapLibre GL (no Mapbox token). ArcLayer or GreatCircleLayer for the A-to-B arc. Pre-load tiles so a venue network failure cannot blank the map.
- Ledger (showpiece 2): hand-rolled flex/CSS rows of motion.div blocks + AnimatePresence. Hashes computed client-side with Web Crypto (crypto.subtle.digest "SHA-256") over canonical sorted-key JSON. A Verify button re-hashes the chain and turns every block red from the first broken index.
- Charts: Recharts v3 (via shadcn charts).
- Pin exact patches with Context7 or npm show at install. Confirm next, motion, recharts, deck.gl, and the DSQL connector versions.

## Design direction (Custody brand)

Dark-first control-room operational aesthetic with a restrained arcade flourish layered on top (the hybrid). Distinctive type: Geist + Geist Mono, or Satoshi plus a mono for hashes and IDs. NEVER default Inter plus violet. One disciplined accent color. Tasteful Motion micro-interactions. WCAG-AA contrast (never a pure-black #000 background or pure-white text in dark mode). Respect prefers-reduced-motion: degrade the arc and ledger animations to instant state changes (this scores accessibility points and protects the demo). Build the complete loop on the plainest UI first, then add the arcade polish with leftover time. Loop before beauty.

## Demo choreography (the wow)

On revoke or cap-hit in Region A: useOptimistic flips Region A's panel locally, the Server Action commits to DSQL, both region SSE streams emit the committed state, Region B's panel flips, the deck.gl arc animates A to B, and a live millisecond timer shows "commit in A, visible in B." Frame it as a real strong-consistency property, not a trick: show the two cross-region round trips and name them. The four showpieces are the definition of done for the demo: (1) two-region live map plus latency timer, (2) hash-chain tamper-and-fail verify, (3) contention visualization plus a deliberate hot-key OC000 retry, (4) SD-JWT age-bracket proof.

## Performance budget (Design score)

Push "use client" to the smallest leaf. Do above-the-fold data fetches on the server with Promise.all (no useEffect waterfalls). Code-split deck.gl and the map with next/dynamic. Self-host fonts with next/font (display swap, adjustFontFallback true). Reserve fixed dimensions on streaming panels to protect CLS. Ship a Lighthouse-CI budget with CLS as a hard error. Verify with Vercel Speed Insights field data, not just lab Lighthouse.

## Team workstreams and git workflow

Three people. Pair on the correctness core (OCC retry, hash chain, idempotency, the cross-region commit plus concurrent-append test) days 0 to 2, then split: one owns backend and DSQL plus migrations, one owns the frontend, one owns design plus the demo video plus bonus content plus CI. Use git worktrees for parallel frontend and backend work to avoid conflicts. Atomic Conventional Commits, push immediately. After every merge, watch the post-merge main CI run: match the watched run's headSha to the merged SHA, and read the per-SHA check-runs API (gh api repos/OWNER/REPO/commits/SHA/check-runs) rather than trusting a watch exit code. Branch-green is not main-green.

## AWS MCP servers and the Vercel connector

Wire on day 0. The awslabs Aurora DSQL MCP server (uvx awslabs.aurora-dsql-mcp-server) gives readonly_query, transact (writes need --allow-writes), get_schema, and dsql_lint (validates SQL for DSQL compatibility and auto-fixes before runtime). Add two instances, one per regional endpoint, to drive both sides of the cross-region demo; keep them read-only except a dedicated migration role. The Vercel AWS DSQL connector (Vercel Marketplace, dashboard) provisions DSQL and wires OIDC plus IAM, injecting the connection env vars. Exact add commands live in the private build notes.

## Build-time re-check list

A few facts move fast. Verify these at setup rather than trusting this file:
- The exact current Next.js patch (pin 16.2.6 or later) and the exact versions of motion, recharts, and the DSQL connector, via npm.
- That the chosen two regions are in a supported same-geography DSQL Region set.
- Whether any DSQL feature gap has closed since (check the live unsupported-features doc before relying on "no SERIAL" or "no GIN").
- That the hackathon rules do not mandate a specific license (they would override the Apache-2.0 choice).
