#!/usr/bin/env bash
# Wire the two read-only Aurora DSQL MCP servers (one per region) AFTER the cluster is
# provisioned. Run from the repo root once the endpoints exist.
#
#   export AWS_PROFILE=custody
#   export DSQL_ENDPOINT_EAST=<east-id>.dsql.us-east-1.on.aws
#   export DSQL_ENDPOINT_WEST=<west-id>.dsql.us-east-2.on.aws
#   ./scripts/provision/wire-mcp.sh
#
# Flags verified against `uvx awslabs.aurora-dsql-mcp-server@latest --help`.
# Read-only by default (no --allow-writes). Migrations go through `pnpm migrate`, not the MCP.
set -euo pipefail

: "${DSQL_ENDPOINT_EAST:?set DSQL_ENDPOINT_EAST to the us-east-1 cluster endpoint}"
: "${DSQL_ENDPOINT_WEST:?set DSQL_ENDPOINT_WEST to the us-east-2 cluster endpoint}"
PROFILE="${AWS_PROFILE:-default}"
DB_USER="${DSQL_USER:-admin}"

claude mcp add custody-dsql-east --scope project \
  --env FASTMCP_LOG_LEVEL=ERROR \
  -- uvx awslabs.aurora-dsql-mcp-server@latest \
  --cluster_endpoint "$DSQL_ENDPOINT_EAST" \
  --region us-east-1 \
  --database_user "$DB_USER" \
  --profile "$PROFILE"

claude mcp add custody-dsql-west --scope project \
  --env FASTMCP_LOG_LEVEL=ERROR \
  -- uvx awslabs.aurora-dsql-mcp-server@latest \
  --cluster_endpoint "$DSQL_ENDPOINT_WEST" \
  --region us-east-2 \
  --database_user "$DB_USER" \
  --profile "$PROFILE"

echo "Wired custody-dsql-east + custody-dsql-west (read-only). Verify with: claude mcp list"
