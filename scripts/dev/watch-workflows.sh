#!/usr/bin/env bash
# Follows the durable execution emulator's logs: starts, checkpoints, and results.
# Workflow log entries, such as subscription_access_granted, stay in npm run dev.
set -euo pipefail

# Must match the container SAM starts on the first workflow of npm run dev.
CONTAINER=sam-durable-execution-emulator

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not accessible. Start Docker before running npm run dev:workflows.\n' >&2
  exit 1
fi

# Drops debug entries, read-only API calls, and health checks.
# Tracebacks have no level, so errors keep their details.
filter() {
  grep --line-buffered -v -E ' - DEBUG - |"GET /' |
    sed -u 's/aws_durable_execution_sdk_python_testing\.//'
}

since=""
while true; do
  if [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != true ]]; then
    printf 'Waiting for %s; it starts with the first workflow of npm run dev.\n' "$CONTAINER"
    until [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" == true ]]; do
      sleep 2
    done
  fi
  # After a restart, only new entries show, so none repeat.
  docker logs --follow ${since:+--since "$since"} "$CONTAINER" 2>&1 | filter || true
  since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
done
