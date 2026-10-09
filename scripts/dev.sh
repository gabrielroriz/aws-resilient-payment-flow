#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

for command in node npm zip terraform sam docker; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s. See docs/development.md#run-locally.\n' "$command" >&2
    exit 1
  fi
done

if ! docker info >/dev/null 2>&1; then
  printf 'Docker is not accessible. Start Docker before running npm run dev.\n' >&2
  exit 1
fi

cd "$PROJECT_ROOT"
npm run build

# SAM reads Terraform's filename attribute, so package fresh code with a local-only suffix.
for bundle in "$PROJECT_ROOT"/dist/bundles/*; do
  name="${bundle##*/}"
  archive="$PROJECT_ROOT/dist/${name}_local.zip"
  rm -f -- "$archive"
  (cd "$bundle" && zip -q "$archive" index.js)
done

cd "$PROJECT_ROOT/terraform"
# The hook runs init/plan against the configured backend, but never applies that plan.
export TF_VAR_lambdasVersion=local
export TF_INPUT=0
exec sam local start-api --hook-name terraform --region us-east-1 "$@"
