#!/usr/bin/env bash
# Stop on failures so incomplete packages never reach the deployment step.
set -euo pipefail

# Allow deployment from any working directory.
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

# Catch missing tools before spending time building the application.
for command in node npm zip terraform; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

# Isolate dependencies and build output; clean up the workspace even if deployment fails.
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lambda-deploy.XXXXXXXX")"
trap 'rm -rf -- "$BUILD_DIR"' EXIT

# The temporary suffix also distinguishes deployments started in the same second.
VERSION="$(date -u +%Y%m%d%H%M%S)-${BUILD_DIR##*.}"
PLAN="$BUILD_DIR/deploy.tfplan"

printf 'Building all Lambdas with version %s\n' "$VERSION"
# Stage the source and shared registry used to select each Lambda's entry point.
cp "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/package-lock.json" \
  "$PROJECT_ROOT/tsconfig.json" "$PROJECT_ROOT/lambdas.json" "$BUILD_DIR/"
cp -R "$PROJECT_ROOT/src" "$BUILD_DIR/src"
cp -R "$PROJECT_ROOT/build" "$BUILD_DIR/build"

(
  cd "$BUILD_DIR"
  # Build tools are development dependencies and must be installed even in production environments.
  npm ci --include=dev
  npm run build
  # Retain one archive per function outside the temporary workspace for Terraform to upload.
  mkdir -p "$PROJECT_ROOT/dist"
  for bundle in dist/bundles/*; do
    name="${bundle##*/}"
    archive="$PROJECT_ROOT/dist/${name}_$VERSION.zip"
    # Match Terraform's index.handler entry point; imported dependencies are already bundled.
    (cd "$bundle" && zip -q "$archive" index.js)
    printf 'Packaged %s: %s\n' "$name" "$archive"
  done
)

# Prepare the backend and providers, then point every function at this release's archive.
terraform -chdir="$PROJECT_ROOT/terraform" init -input=false
terraform -chdir="$PROJECT_ROOT/terraform" plan -input=false \
  -var="lambdasVersion=$VERSION" -out="$PLAN"
# Apply the exact saved plan automatically, including any other infrastructure changes it contains.
terraform -chdir="$PROJECT_ROOT/terraform" apply -input=false "$PLAN"

printf 'Deployed all registered Lambdas with version %s\nArchives: %s/dist/\n' "$VERSION" "$PROJECT_ROOT"
