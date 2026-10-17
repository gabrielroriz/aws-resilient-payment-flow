#!/usr/bin/env bash
# Erases DynamoDB Local: removes its container and data volume, then starts it empty.
# The next npm run dev creates the tables Terraform defines.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/compose.dev.yaml"

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not accessible. Start Docker before running npm run dev:reset-db.\n' >&2
  exit 1
fi

# Only the named service and its volume go; ElasticMQ and the UIs keep running.
docker compose -f "$COMPOSE_FILE" down --volumes dynamodb
docker compose -f "$COMPOSE_FILE" up --detach --wait dynamodb

printf 'DynamoDB Local is empty. Rerun npm run dev to create the tables.\n'
