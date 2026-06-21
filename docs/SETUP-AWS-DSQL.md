# Setup: Aurora DSQL + Vercel OIDC

This brings Custody up against a live two-region Amazon Aurora DSQL cluster. There are two
phases. Phase 1 needs only AWS and gets the database running locally (migrate, seed, and the
day-zero cross-region + concurrency harness). Phase 2 wires Vercel OIDC for the deployed app.

All commands were verified against current AWS and Vercel docs. Cluster topology: a single
logical multi-region cluster with writable endpoints in us-east-1 and us-east-2 and a witness
in us-west-2 (the witness has no endpoint). These three regions are one same-geography set, so
the configuration is valid. Cross-continent multi-region is not supported.

## Prerequisites (already installed in this environment)

- AWS CLI v2 (2.27.14 or newer for the multi-region flow). Verify: `aws --version`.
- An AWS account with permission to create DSQL clusters: `dsql:CreateCluster`,
  `dsql:PutMultiRegionProperties`, `dsql:AddPeerCluster`, `dsql:PutWitnessRegion`.
- pnpm and Node 22 (already set up). `uv`/`uvx` for the optional DSQL MCP server.

## Phase 1: provision + run locally (AWS only, no Vercel)

1. Authenticate to AWS in your shell. Use whichever your org uses:

   ```
   aws sso login            # SSO
   # or
   aws configure            # static access keys for a profile
   ```

   Confirm it worked: `aws sts get-caller-identity`.

2. Provision the two-region cluster. From the repo root:

   ```
   ./scripts/provision/provision-dsql.sh
   ```

   This creates both regional clusters, peers them, waits for ACTIVE (a few minutes), and
   writes the endpoints to `.env.dsql` (gitignored). It refuses to run if `.env.dsql` already
   exists, so it cannot create orphan clusters by accident.

3. Load the endpoints and your AWS profile, then migrate and seed. Locally the connector uses
   your default AWS credential chain, so do not set `AWS_ROLE_ARN`.

   ```
   set -a && source .env.dsql && set +a
   export AWS_PROFILE=<your-profile>     # if you use a named profile
   pnpm migrate        # one DDL per transaction, CREATE INDEX ASYNC, waits on sys.jobs
   pnpm seed           # synthetic operational data only, no real minors
   ```

4. Run the day-zero risk-retirement harness (the cross-region commit + concurrent same-user
   append test). It is skipped automatically unless `DSQL_ENDPOINT_EAST` is set, which it now
   is.

   ```
   pnpm test:integration
   ```

   Expect: a write committed in one region is visible from the other on commit, and a burst of
   concurrent same-user appends produces exactly one SQLSTATE 40001 (OC000) retry with a clean,
   unforked hash chain.

5. Run the app locally against the live cluster:

   ```
   cat .env.dsql >> .env.local        # merge endpoints into Next.js local env (once)
   export AWS_PROFILE=<your-profile>
   pnpm dev
   ```

## Phase 1b (optional): wire the DSQL MCP servers

Lets the agent query and lint SQL against each region directly. Read-only by default.

```
set -a && source .env.dsql && set +a
export AWS_PROFILE=<your-profile>
./scripts/provision/wire-mcp.sh
claude mcp list            # confirm custody-dsql-east + custody-dsql-west
```

## Phase 2: Vercel OIDC for the deployed app

The Vercel AWS Marketplace connector provisions per-region single clusters and is not
documented to create a linked multi-region cluster in one click, so we keep the CLI-provisioned
cluster from Phase 1 and use Vercel only for credential-free OIDC access.

1. In AWS IAM, add an OpenID Connect identity provider:
   - Provider URL: `https://oidc.vercel.com` (Global issuer) or
     `https://oidc.vercel.com/<TEAM_SLUG>` (Team issuer; check Vercel project settings).
   - Audience: `https://vercel.com/<TEAM_SLUG>`.

2. Create two IAM roles using the policy templates in `infra/iam/` (replace every
   `<PLACEHOLDER>`; the cluster ids are the first label of each endpoint hostname):
   - Runtime role: trust policy `vercel-oidc-trust-policy.json` + permissions
     `dsql-runtime-policy.json` (`dsql:DbConnect`). For the Global issuer you must keep the
     `oidc.vercel.com:aud` condition or AWS rejects the role.
   - Migration role (separate, used by CI only): permissions `dsql-migrations-policy.json`
     (`dsql:DbConnectAdmin`).

   The runtime role connects as a least-privilege custom DB role. Associate it once, connected
   as admin: `AWS IAM GRANT <custom_db_role> TO 'arn:aws:iam::<AWS_ACCOUNT_ID>:role/<runtime_role>';`
   For the hackathon you may instead connect runtime as `admin` and use the migration policy on
   the runtime role; least privilege is the documented best practice.

3. In the Vercel project, set environment variables (mark credential-bearing ones sensitive,
   no stored AWS keys):
   - `DSQL_ENDPOINT_EAST`, `DSQL_ENDPOINT_WEST` (from `.env.dsql`)
   - `DSQL_USER=admin`, `DSQL_DATABASE=postgres`
   - `AWS_ROLE_ARN` = the runtime role ARN
   - `AWS_REGION` = `us-east-1`. Pin this explicitly; Vercel otherwise sets it to the function
     execution region, which can drift and break a region-scoped DSQL token.

4. Deploy. Pull the same vars locally if needed with `vercel env pull`.

## Teardown

```
./scripts/provision/teardown-dsql.sh      # disables deletion protection, deletes both, prompts first
```

## Notes

- A DSQL connection is authorized for up to one hour; the pool max lifetime is already set under
  that and under the 60-minute hard cap.
- A region-scoped token authenticates only against that region's endpoint, so there is one pool
  per region.
- Endpoint hostname format: `<cluster-id>.dsql.<region>.on.aws`.
