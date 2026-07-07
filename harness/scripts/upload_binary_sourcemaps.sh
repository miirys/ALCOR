#!/usr/bin/env bash
# Uploads a directory of pre-built source maps to Sentry.
# The caller is responsible for building the source maps (e.g. via
# `bun build --sourcemap=external`) and passing the output directory.
#
# Usage:
#   ./scripts/upload_binary_sourcemaps.sh --sourcemaps-dir <path>
#
# Environment variables:
#   SENTRY_TRACKING_ENABLED  Must be "true" for the upload to run (default: skip).
#   SENTRY_AUTH_TOKEN        Sentry API authentication token.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy_log.sh
source "$SCRIPT_DIR/lib/deploy_log.sh"

cd "$SCRIPT_DIR/.."

# ── Argument parsing ──────────────────────────────────────────────────────────
SOURCEMAPS_DIR=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sourcemaps-dir) SOURCEMAPS_DIR="$2"; shift 2 ;;
    *) log::error "Unknown argument '$1'"; exit 1 ;;
  esac
done

[[ -z "$SOURCEMAPS_DIR" ]] && { log::error "--sourcemaps-dir is required"; exit 1; }

summary::start "sentry sourcemap upload"

# ── Guard ─────────────────────────────────────────────────────────────────────
if [[ "${SENTRY_TRACKING_ENABLED:-}" != "true" ]]; then
  summary::add "upload" "skip" "SENTRY_TRACKING_ENABLED != true"
  summary::print
  exit 0
fi

SENTRY_CLI="./node_modules/.bin/sentry-cli"
if [[ ! -x "$SENTRY_CLI" ]]; then
  log::error "sentry-cli not found at $SENTRY_CLI — run bun install first"
  summary::add "upload" "fail" "sentry-cli missing"
  summary::print
fi

# ── Upload ────────────────────────────────────────────────────────────────────
log::section "Upload source maps to Sentry"
log::info "Source maps dir: $SOURCEMAPS_DIR"

if log::run "$SENTRY_CLI" sourcemaps inject "$SOURCEMAPS_DIR" && \
   log::run "$SENTRY_CLI" sourcemaps upload \
     --org gitlab \
     --project gitlab-language-server \
     "$SOURCEMAPS_DIR"; then
  summary::add "upload" "ok" "org=gitlab project=gitlab-language-server"
else
  summary::add "upload" "fail" "sentry-cli exited non-zero"
fi

summary::print
