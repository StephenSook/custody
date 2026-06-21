#!/usr/bin/env bash
# Switch the public deployment to the least-privilege custody_app database role.
#
# Prereq: run scripts/provision/create-app-role.ts once first (creates custody_app, grants
# SELECT/INSERT/UPDATE only, AWS IAM GRANTs it to the runtime IAM role). Needs AWS auth live
# and Vercel logged in. Idempotent and REVERSIBLE.
#
#   ./scripts/provision/harden-runtime.sh
#
# Effect: the deployed app connects as custody_app (read + append + projection-upsert) instead
# of admin, so the public surface cannot DELETE, TRUNCATE, DROP, or run DDL even with its own
# credentials. Migrations still run locally as admin and are unaffected.
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

[ -f .env.dsql ] || { echo "ERROR: .env.dsql missing (run provision-dsql.sh first)"; exit 1; }
set -a && source .env.dsql && set +a
aws sts get-caller-identity >/dev/null 2>&1 || { echo "ERROR: AWS not authenticated (aws login)"; exit 1; }

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
EAST_ID="${DSQL_ENDPOINT_EAST%%.*}"
WEST_ID="${DSQL_ENDPOINT_WEST%%.*}"
ROLE="${ROLE_NAME:-custody-vercel-oidc}"

echo "=== 1/3 narrow the runtime IAM role to dsql:DbConnect (was dsql:DbConnectAdmin) ==="
cat > /tmp/custody-perm-connect.json <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Sid": "DsqlConnectBothRegions",
  "Effect": "Allow",
  "Action": "dsql:DbConnect",
  "Resource": [
    "arn:aws:dsql:us-east-1:${ACCOUNT}:cluster/${EAST_ID}",
    "arn:aws:dsql:us-east-2:${ACCOUNT}:cluster/${WEST_ID}"
  ]
}]}
JSON
aws iam put-role-policy --role-name "$ROLE" --policy-name dsql-connect --policy-document file:///tmp/custody-perm-connect.json
echo "  runtime role scoped to dsql:DbConnect"

echo "=== 2/3 point the deployment at the custody_app role ==="
vercel env rm DSQL_USER production -y >/dev/null 2>&1 || true
printf 'custody_app' | vercel env add DSQL_USER production >/dev/null 2>&1
echo "  DSQL_USER=custody_app (production)"

echo "=== 3/3 redeploy ==="
vercel deploy --prod --yes

echo
echo "Done. The public app now connects as custody_app (read + append + upsert, no delete/ddl)."
echo "Reversible: set DSQL_USER back to admin and restore dsql:DbConnectAdmin on $ROLE to revert."
