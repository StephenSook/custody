#!/usr/bin/env bash
# Phase 2: wire Vercel OIDC -> AWS IAM role -> Aurora DSQL, set the production env vars, and
# redeploy. Run from the repo root AFTER: (a) AWS auth is live in this shell (aws login or
# aws sso login), (b) the Vercel CLI is logged in (vercel whoami), and (c) .env.dsql exists.
#
#   ./scripts/provision/wire-vercel-oidc.sh
#
# Idempotent: safe to re-run. Creates nothing secret. Account id and cluster ids are derived
# at runtime (from your AWS session and the gitignored .env.dsql), not hardcoded. The Vercel
# team slug and project are overridable env vars defaulting to this project's values.
#
# OIDC claims were read from the live VERCEL_OIDC_TOKEN: Team issuer mode,
# issuer oidc.vercel.com/<team>, aud https://vercel.com/<team>,
# sub owner:<team>:project:<project>:environment:<env>.
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

[ -f .env.dsql ] || { echo "ERROR: .env.dsql missing. Run scripts/provision/provision-dsql.sh first."; exit 1; }
set -a && source .env.dsql && set +a
command -v aws >/dev/null || { echo "ERROR: aws CLI not found"; exit 1; }
command -v vercel >/dev/null || { echo "ERROR: vercel CLI not found (npm i -g vercel)"; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { echo "ERROR: AWS not authenticated. Run: aws login"; exit 1; }

ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
EAST_ID="${DSQL_ENDPOINT_EAST%%.*}"
WEST_ID="${DSQL_ENDPOINT_WEST%%.*}"
TEAM_SLUG="${VERCEL_TEAM_SLUG:-ssookra-7703s-projects}"
PROJECT="${VERCEL_PROJECT:-custody}"
ROLE="${ROLE_NAME:-custody-vercel-oidc}"
REGION_A=us-east-1
REGION_B=us-east-2
ISSUER_HOST="oidc.vercel.com/${TEAM_SLUG}"
AUD="https://vercel.com/${TEAM_SLUG}"
PROVIDER_ARN="arn:aws:iam::${ACCOUNT}:oidc-provider/${ISSUER_HOST}"

echo "account=$ACCOUNT  east=$EAST_ID  west=$WEST_ID  team=$TEAM_SLUG  project=$PROJECT"

echo "=== 1/5 IAM OIDC provider ==="
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "  provider exists"
else
  # Current IAM retrieves the thumbprint for OIDC providers when omitted. If your account
  # still requires one, add: --thumbprint-list $(echo | openssl s_client -servername oidc.vercel.com -connect oidc.vercel.com:443 2>/dev/null | openssl x509 -fingerprint -noout -sha1 | cut -d= -f2 | tr -d :)
  aws iam create-open-id-connect-provider --url "https://${ISSUER_HOST}" --client-id-list "$AUD" >/dev/null
  echo "  provider created"
fi

echo "=== 2/5 trust + permission policy documents ==="
cat > /tmp/custody-trust.json <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Effect": "Allow",
  "Principal": { "Federated": "${PROVIDER_ARN}" },
  "Action": "sts:AssumeRoleWithWebIdentity",
  "Condition": {
    "StringEquals": {
      "${ISSUER_HOST}:aud": "${AUD}",
      "${ISSUER_HOST}:sub": "owner:${TEAM_SLUG}:project:${PROJECT}:environment:production"
    }
  }
}]}
JSON
cat > /tmp/custody-perm.json <<JSON
{ "Version": "2012-10-17", "Statement": [{
  "Sid": "DsqlConnectBothRegions",
  "Effect": "Allow",
  "Action": "dsql:DbConnectAdmin",
  "Resource": [
    "arn:aws:dsql:${REGION_A}:${ACCOUNT}:cluster/${EAST_ID}",
    "arn:aws:dsql:${REGION_B}:${ACCOUNT}:cluster/${WEST_ID}"
  ]
}]}
JSON

echo "=== 3/5 IAM role ==="
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE" --policy-document file:///tmp/custody-trust.json
  echo "  role exists, trust refreshed"
else
  aws iam create-role --role-name "$ROLE" --assume-role-policy-document file:///tmp/custody-trust.json \
    --description "Vercel OIDC to Aurora DSQL for Custody" >/dev/null
  echo "  role created"
fi
aws iam put-role-policy --role-name "$ROLE" --policy-name dsql-connect --policy-document file:///tmp/custody-perm.json
ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)"
echo "  role ARN: $ROLE_ARN"

echo "=== 4/5 Vercel production env vars ==="
set_env() {
  vercel env rm "$1" production -y >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null 2>&1
  echo "  set $1"
}
set_env DSQL_ENDPOINT_EAST "$DSQL_ENDPOINT_EAST"
set_env DSQL_ENDPOINT_WEST "$DSQL_ENDPOINT_WEST"
set_env DSQL_USER "admin"
set_env DSQL_DATABASE "postgres"
set_env AWS_REGION "$REGION_A"
set_env AWS_ROLE_ARN "$ROLE_ARN"

echo "=== 5/5 redeploy to production ==="
vercel deploy --prod --yes

echo
echo "Done. Vercel OIDC -> $ROLE_ARN -> DSQL wired, env set, redeployed."
echo "The production app now connects to the live two-region cluster."
