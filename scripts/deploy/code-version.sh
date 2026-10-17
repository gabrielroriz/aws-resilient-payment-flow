#!/usr/bin/env bash
# Prints the deployed code's version, such as 20261017112353-339fc51a2130.
# The UTC deploy time comes first, so versions sort in deploy order.
# The commit SHA follows, so `git checkout` shows exactly what ran.
# Uncommitted changes to the built files stop it, unless --allow-dirty is passed.
# A dirty version ends in -dirty, since the commit alone does not name the code.
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
# Must match the files the deployment copies into its build workspace.
BUILT_PATHS=(src build package.json package-lock.json tsconfig.json lambdas.json)

ALLOW_DIRTY=false
for argument in "$@"; do
  case "$argument" in
    --allow-dirty) ALLOW_DIRTY=true ;;
    *)
      printf 'Unknown argument: %s\n' "$argument" >&2
      exit 1
      ;;
  esac
done

VERSION="$(date -u +%Y%m%d%H%M%S)-$(git -C "$PROJECT_ROOT" rev-parse --short=12 HEAD)"
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain -- "${BUILT_PATHS[@]}")" ]]; then
  if [[ "$ALLOW_DIRTY" == false ]]; then
    printf 'Commit these changes before deploying, or pass --allow-dirty:\n' >&2
    git -C "$PROJECT_ROOT" status --short -- "${BUILT_PATHS[@]}" >&2
    exit 1
  fi
  VERSION="$VERSION-dirty"
fi
printf '%s\n' "$VERSION"
