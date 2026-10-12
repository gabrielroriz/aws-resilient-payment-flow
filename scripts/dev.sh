#!/usr/bin/env bash
# Runs HTTP and queue-triggered Lambdas in SAM containers with DynamoDB Local and ElasticMQ.
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

# Terraform plans need each function's archive to exist; 
# the "local" version leaves deployment archives untouched.
for bundle in "$PROJECT_ROOT"/dist/bundles/*; do
  name="${bundle##*/}"
  archive="$PROJECT_ROOT/dist/${name}_local.zip"
  rm -f -- "$archive"
  (cd "$bundle" && zip -q "$archive" index.js) # -q stands for "quiet", to avoid printing the list of files in the archive.
done

# Start DynamoDB Local, ElasticMQ, and their UIs. 
# They outlive this script, so data stays between runs.
docker compose -f "$PROJECT_ROOT/compose.dev.yaml" up --detach --wait

# The plan can contain secrets, so it and everything made from it are deleted on exit.
WORK_DIR="$(mktemp --directory "${TMPDIR:-/tmp}/lambda-dev.XXXXXXXX")"
DEV_PIDS=()
cleanup() {
  trap - EXIT INT TERM
  if ((${#DEV_PIDS[@]})); then
    kill "${DEV_PIDS[@]}" 2>/dev/null || true
    wait "${DEV_PIDS[@]}" 2>/dev/null || true
  fi
  rm -rf -- "$WORK_DIR"
}
trap cleanup EXIT # Cleanup on exit, including Ctrl+C and kill.
# https://tldp.org/LDP/abs/html/exitcodes.html
# Turn Ctrl+C and kill into exit codes 130 and 143, so the cleanup trap runs.
trap 'exit 130' INT 
trap 'exit 143' TERM

# Plan, never apply: the plan only describes what to run, so nothing has to be deployed first.
# -var-file overrides the auto-loaded deployment secrets, so the local API gets local secrets.
printf 'Planning Terraform for the local setup; the plan is never applied.\n'
terraform -chdir="$PROJECT_ROOT/terraform" init -input=false >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" plan -input=false -out="$WORK_DIR/local.tfplan" \
  -var="lambdasVersion=local" -var-file=secrets.local.tfvars >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" show -json "$WORK_DIR/local.tfplan" >"$WORK_DIR/local.json"

# Create the planned tables and queues locally and generate the SAM template for the planned Lambdas.
node "$PROJECT_ROOT/scripts/dev/prepare.mts" "$WORK_DIR/local.json" "$WORK_DIR/template.json"

# SAM exposes invocation but does not poll ElasticMQ; the local consumer supplies SQS batches.
DEV_LAMBDA_PORT="${DEV_LAMBDA_PORT:-3002}"
sam local start-lambda --template "$WORK_DIR/template.json" --docker-network "$DOCKER_NETWORK" \
  --region us-east-1 --port "$DEV_LAMBDA_PORT" &
DEV_PIDS+=("$!")
node "$PROJECT_ROOT/scripts/dev/poll-sqs.mts" "$WORK_DIR/local.json" "http://127.0.0.1:$DEV_LAMBDA_PORT" &
DEV_PIDS+=("$!")

# Extra arguments, such as --port, pass through to the HTTP server only.
sam local start-api --template "$WORK_DIR/template.json" --docker-network "$DOCKER_NETWORK" \
  --region us-east-1 "$@" &
DEV_PIDS+=("$!")
# If any component exits, stop the others before removing the template and plan.
wait -n "${DEV_PIDS[@]}"
