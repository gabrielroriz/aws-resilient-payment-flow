#!/usr/bin/env bash
# Stop on failures so incomplete packages never reach the deployment step.
set -euo pipefail

# Allow deployment from any working directory.
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

# Catch missing tools before spending time building the application.
for command in git node npm zip terraform; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command" >&2
    exit 1
  fi
done

# Name the code before building; arguments such as --allow-dirty go to the script.
CODE_VERSION="$(bash "$PROJECT_ROOT/scripts/deploy/code-version.sh" "$@")"

# Isolate dependencies and build output; clean up even if deployment fails.
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/lambda-deploy.XXXXXXXX")"
trap 'rm -rf -- "$BUILD_DIR"' EXIT

# Archives share the code version's deploy time.
# The temporary suffix also distinguishes deployments started in the same second.
VERSION="${CODE_VERSION%%-*}-${BUILD_DIR##*.}"
PLAN="$BUILD_DIR/deploy.tfplan"

printf 'Building all Lambdas with version %s, code version %s\n' "$VERSION" "$CODE_VERSION"
# Stage the source and shared registry used to select each Lambda's entry point.
# Must match the built files the code version checks for uncommitted changes.
cp "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/package-lock.json" \
  "$PROJECT_ROOT/tsconfig.json" "$PROJECT_ROOT/lambdas.json" "$BUILD_DIR/"
cp -R "$PROJECT_ROOT/src" "$BUILD_DIR/src"
cp -R "$PROJECT_ROOT/build" "$BUILD_DIR/build"

(
  cd "$BUILD_DIR"
  # Build tools are development dependencies, so install them even in production.
  npm ci --include=dev
  npm run build
  # Keep one archive per function outside the workspace for Terraform to upload.
  mkdir -p "$PROJECT_ROOT/dist"
  for bundle in dist/bundles/*; do
    name="${bundle##*/}"
    archive="$PROJECT_ROOT/dist/${name}_$VERSION.zip"
    # Match Terraform's index.handler entry point; dependencies are already bundled.
    # Only the AWS SDK is left out, since the Lambda runtime provides it.
    (cd "$bundle" && zip -q "$archive" index.js)
    printf 'Packaged %s: %s\n' "$name" "$archive"
  done
)

# Prepare the backend and providers, then point every function at the new archives.
terraform -chdir="$PROJECT_ROOT/terraform" init -input=false
terraform -chdir="$PROJECT_ROOT/terraform" plan -input=false \
  -var="lambdasVersion=$VERSION" -var="CODE_VERSION=$CODE_VERSION" -out="$PLAN"
# Apply the exact saved plan unprompted, including any other infrastructure changes.
terraform -chdir="$PROJECT_ROOT/terraform" apply -input=false "$PLAN"

printf 'Deployed all registered Lambdas with version %s\nArchives: %s/dist/\n' "$VERSION" "$PROJECT_ROOT"
