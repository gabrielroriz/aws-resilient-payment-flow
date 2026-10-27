#!/usr/bin/env bash
# Runs HTTP and queue Lambdas in SAM containers with DynamoDB Local and ElasticMQ.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
# Must match the Compose network that Lambda containers join to reach local services.
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

# Debug runs build readable bundles whose source maps name the local sources.
# Each invocation then waits for a debugger on its SAM server's debug port.
# Must match the ports of the VS Code attach configurations.
DEBUG_PORT_HTTP=9229
DEBUG_PORT_QUEUE=9230

cd "$PROJECT_ROOT"
npm run build -- ${DEV_DEBUG:+--debug}

# Terraform plans need each function's archive to exist.
# The "local" version leaves deployment archives untouched.
for bundle in "$PROJECT_ROOT"/dist/bundles/*; do
  name="${bundle##*/}"
  archive="$PROJECT_ROOT/dist/${name}_local.zip"
  rm -f -- "$archive"
  (cd "$bundle" && zip -q "$archive" index.js) # -q stands for "quiet", to avoid printing the list of files in the archive.
done

# Start DynamoDB Local, ElasticMQ, and their UIs. 
# They outlive this script, so data stays between runs.
docker compose -f "$PROJECT_ROOT/compose.dev.yaml" up --detach --wait

# The plan can hold secrets, so it and everything made from it are deleted on exit.
WORK_DIR="$(mktemp --directory "${TMPDIR:-/tmp}/lambda-dev.XXXXXXXX")"
DEV_PIDS=()
cleanup() {
  trap - EXIT INT TERM HUP
  if ((${#DEV_PIDS[@]})); then
    # Once SAM debugs an invocation, SIGTERM no longer stops it, but SIGHUP does.
    kill ${DEV_DEBUG:+-HUP} "${DEV_PIDS[@]}" 2>/dev/null || true
    wait "${DEV_PIDS[@]}" 2>/dev/null || true
  fi
  rm -rf -- "$WORK_DIR"
  if [[ -n "${DEV_DEBUG:-}" ]]; then
    # A function waiting for a debugger outlives SAM and would hold its debug port.
    stale="$(docker ps --quiet --filter label=sam.cli.container.type=lambda \
      --filter "publish=$DEBUG_PORT_HTTP" --filter "publish=$DEBUG_PORT_QUEUE")"
    [[ -z "$stale" ]] || docker rm --force $stale >/dev/null || true
  fi
}
trap cleanup EXIT # Cleanup on exit, including Ctrl+C and kill.
# Exit codes follow https://tldp.org/LDP/abs/html/exitcodes.html.
# Turn Ctrl+C, kill, and closing the terminal into exit codes 130, 143, and 129.
# The cleanup trap then runs, also when VS Code stops the task.
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

# Plan, never apply: the plan describes what to run, so no prior deploy is needed.
# -var-file overrides the auto-loaded deployment secrets with the local ones.
printf 'Planning Terraform for the local setup; the plan is never applied.\n'
terraform -chdir="$PROJECT_ROOT/terraform" init -input=false >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" plan -input=false -out="$WORK_DIR/local.tfplan" \
  -var="lambdasVersion=local" -var-file=secrets.local.tfvars >/dev/null
terraform -chdir="$PROJECT_ROOT/terraform" show -json "$WORK_DIR/local.tfplan" >"$WORK_DIR/local.json"

# Functions start durable workflows through SAM's Lambda invocation server.
# It listens on the Compose network's gateway, which containers and the host reach.
DEV_LAMBDA_HOST="$(docker network inspect "$DOCKER_NETWORK" \
  --format '{{(index .IPAM.Config 0).Gateway}}')"
DEV_LAMBDA_PORT="${DEV_LAMBDA_PORT:-3002}"
DEV_LAMBDA_ENDPOINT="http://$DEV_LAMBDA_HOST:$DEV_LAMBDA_PORT"

# Create the planned tables and queues locally and build the Lambdas' SAM template.
node "$PROJECT_ROOT/scripts/dev/prepare.mts" "$WORK_DIR/local.json" "$WORK_DIR/template.json" \
  "$DEV_LAMBDA_ENDPOINT"

if [[ -n "${DEV_DEBUG:-}" ]]; then
  # The VS Code debug task waits for this line before attaching.
  printf 'Each invocation waits for a debugger on port %s (HTTP) or %s (queues).\n' \
    "$DEBUG_PORT_HTTP" "$DEBUG_PORT_QUEUE"
fi

# SAM only exposes invocation; a local consumer feeds it SQS batches from ElasticMQ.
# Durable functions also run their workflows in SAM's durable execution emulator.
sam local start-lambda --template "$WORK_DIR/template.json" --docker-network "$DOCKER_NETWORK" \
  --region us-east-1 --host "$DEV_LAMBDA_HOST" --port "$DEV_LAMBDA_PORT" \
  ${DEV_DEBUG:+--debug-port "$DEBUG_PORT_QUEUE"} &
DEV_PIDS+=("$!")
node "$PROJECT_ROOT/scripts/dev/poll-sqs.mts" "$WORK_DIR/local.json" "$DEV_LAMBDA_ENDPOINT" &
DEV_PIDS+=("$!")

# Extra arguments, such as --port, pass through to the HTTP server only.
sam local start-api --template "$WORK_DIR/template.json" --docker-network "$DOCKER_NETWORK" \
  --region us-east-1 ${DEV_DEBUG:+--debug-port "$DEBUG_PORT_HTTP"} "$@" &
DEV_PIDS+=("$!")
# If any component exits, stop the others before removing the template and plan.
wait -n "${DEV_PIDS[@]}"
