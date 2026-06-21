#!/usr/bin/env bash
# Tear down the two-region DSQL cluster created by provision-dsql.sh. Disables deletion
# protection on each cluster, then deletes each separately (multi-region clusters cannot be
# deleted in one call). Reads endpoints from .env.dsql (or the file passed as $1).
#
#   ./scripts/provision/teardown-dsql.sh
#
# DESTRUCTIVE. This permanently deletes both regional clusters and all their data.
set -euo pipefail
export PATH="/opt/homebrew/bin:$PATH"

ENV_IN="${1:-.env.dsql}"
REGION_A="${REGION_A:-us-east-1}"
REGION_B="${REGION_B:-us-east-2}"

[ -f "$ENV_IN" ] || { echo "ERROR: $ENV_IN not found. Pass the env file with the endpoints."; exit 1; }
# shellcheck disable=SC1090
set -a && source "$ENV_IN" && set +a

A_ID="${DSQL_ENDPOINT_EAST%%.*}"
B_ID="${DSQL_ENDPOINT_WEST%%.*}"
[ -n "$A_ID" ] && [ -n "$B_ID" ] || { echo "ERROR: could not read cluster ids from $ENV_IN"; exit 1; }

echo "About to DELETE both clusters:"
echo "  $REGION_A id=$A_ID"
echo "  $REGION_B id=$B_ID"
printf "Type DELETE to confirm: "
read -r confirm
[ "$confirm" = "DELETE" ] || { echo "Aborted."; exit 1; }

for pair in "$REGION_A:$A_ID" "$REGION_B:$B_ID"; do
  region="${pair%%:*}"; id="${pair##*:}"
  echo "disabling deletion protection: $region $id"
  aws dsql update-cluster --region "$region" --identifier "$id" --no-deletion-protection-enabled >/dev/null
  echo "deleting: $region $id"
  aws dsql delete-cluster --region "$region" --identifier "$id" >/dev/null
done

echo "Delete requested for both clusters. They move to PENDING_DELETE then DELETE after validation."
echo "Remove $ENV_IN when done."
