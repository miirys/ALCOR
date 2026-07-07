#!/usr/bin/env bash

# we have to set -e here to make sure that the script fails if any of the commands fail
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy_log.sh
source "$SCRIPT_DIR/lib/deploy_log.sh"

DRY_RUN="false"
DRY_RUN_FLAG=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN="true"
      DRY_RUN_FLAG="--dry-run"
      ;;
  esac
done

log::section "semantic-release-prepare ($([[ "$DRY_RUN" == "true" ]] && echo "dry-run" || echo "real-run"))"
log::info "node:       $(node -v)"
log::info "bun:        $(bun --version)"
log::info "CI:         ${CI:-<unset>}"
log::info "PROJECT:    ${CI_PROJECT_PATH:-<local>}"
log::info "JOB_URL:    ${CI_JOB_URL:-<local>}"
log::info "PWD:        $(pwd)"

# Check if we're in CI and need pre-built binaries
if [ -n "$CI" ] && [ ! -d "bin" ]; then
  log::error "bin/ does not exist in CI; ensure build-integration-binaries job artifacts are available"
  exit 1
fi

if [ -d "bin" ]; then
  log::info "bin/ contents:"
  ls -lah bin | sed 's/^/    /'
else
  log::warn "bin/ does not exist (running locally without artifacts)"
fi

log::section "Configuring publish auth"
log::info "Writing bunfig.toml with @gitlab-org scope -> project NPM registry"
cat > ./bunfig.toml <<EOF
[install.scopes]
"@gitlab-org" = { url = "https://gitlab.com/api/v4/projects/46519181/packages/npm/", token = "$CI_JOB_TOKEN" }
EOF
log::info "bunfig.toml written ($(wc -c < ./bunfig.toml | tr -d ' ') bytes; token redacted from log)"

if [ -z "$CI" ]; then
  log::section "Local build (CI=unset)"
  log::run bun run build
  log::run ./scripts/package.sh
fi

log::section "Handing off to scripts/deploy.sh"
./scripts/deploy.sh $DRY_RUN_FLAG
