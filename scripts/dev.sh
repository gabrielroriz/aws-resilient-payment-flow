#!/usr/bin/env bash
# Runs the HTTP API locally: each Lambda in a SAM container, with DynamoDB served by DynamoDB Local.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# Must match the Compose network, which Lambda containers join to reach the local services.
DOCKER_NETWORK=aws-resilient-payment-flow

# Catch missing tools before spending time building.
for command in node npm zip terraform sam docker; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s. See docs/guides/development.md#requirements.\n' "$command" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not accessible. Start Docker before running npm run dev.\n' >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  printf 'Docker Compose not found. See docs/guides/development.md#requirements.\n' >&2
  exit 1
fi

cd "$PROJECT_ROOT"
npm run build

# Terraform plans need each function's archive to exist; the "local" version leaves deployment
# archives untouched.
for bundle in "$PROJECT_ROOT"/dist/bundles/*; do
  name="${bundle##*/}"
  archive="$PROJECT_ROOT/dist/${name}_local.zip"
  rm -f -- "$archive"
  (cd "$bundle" && zip -q "$archive" index.js)
done

# Start DynamoDB Local and its admin UI. They outlive this script, so data stays between runs.
docker compose -f "$PROJECT_ROOT/compose.dev.yaml" up --detach --wait

# The plan can contain secrets, so it and everything made from it are deleted on exit.
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lambda-dev.XXXXXXXX")"
trap 'rm -rf -- "$WORK_DIR"' EXIT

# Local secrets of the simulated gateways; the defaults must match the simulator's.
GATEWAY_GLOBAL_SIGNING_SECRET="${GATEWAY_GLOBAL_SIGNING_SECRET:-local-gateway-global-secret}"
GATEWAY_BRAZIL_ACCESS_TOKEN="${GATEWAY_BRAZIL_ACCESS_TOKEN:-local-gateway-brazil-token}"

# Plan, never apply: the plan only describes the tables, functions, and routes to run, so nothing
# has to be deployed first. -var values take precedence over a deployment secrets file, so the
# local API always gets local secrets. Terraform's progress output is hidden; its errors still show.
printf 'Planning Terraform for the local setup; the plan is never applied.\n'
terraform -chdir="$PROJECT_ROOT/terraform" init -input=false >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" plan -input=false -out="$WORK_DIR/local.tfplan" \
  -var="lambdasVersion=local" \
  -var="GATEWAY_GLOBAL_SIGNING_SECRET=$GATEWAY_GLOBAL_SIGNING_SECRET" \
  -var="GATEWAY_BRAZIL_ACCESS_TOKEN=$GATEWAY_BRAZIL_ACCESS_TOKEN" >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" show -json "$WORK_DIR/local.tfplan" >"$WORK_DIR/local.json"

# Create the planned tables in DynamoDB Local and generate the SAM template for the planned Lambdas.
node "$PROJECT_ROOT/scripts/dev/prepare.mts" "$WORK_DIR/local.json" "$WORK_DIR/template.json"

# Serve the API until Ctrl+C. Extra arguments, such as --port, pass through to SAM.
sam local start-api --template "$WORK_DIR/template.json" --docker-network "$DOCKER_NETWORK" \
  --region us-east-1 "$@"
