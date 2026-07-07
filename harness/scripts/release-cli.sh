#!/usr/bin/env bash

# Ensure to fail if any of the commands fails
set -euo pipefail

SKIP_PUBLISH=false
DRY_RUN=false
PACKAGE_NAME="gitlab-duo-cli"

for arg in "$@"; do
  case $arg in
  --skip-publish)
    SKIP_PUBLISH=true
    shift
    ;;
  --dry-run)
    DRY_RUN=true
    shift
    ;;
  --package-version=*)
    PACKAGE_VERSION="${arg#*=}"
    shift
    ;;
  *)
    shift
    ;;
  esac
done

log_step() {
  echo "===> $1"
}

log_step "Running release-cli script with args:"
log_step "SKIP_PUBLISH: $SKIP_PUBLISH"
log_step "DRY_RUN: $DRY_RUN"

log_step "Checking bun version"
bun --version

build() {
  log_step "Comparing to package.json version:"
  cat ./packages/cli/package.json | grep version

  if [[ -n "${PACKAGE_VERSION:-}" ]]; then
    log_step "Setting package version to $PACKAGE_VERSION"
    npm version $PACKAGE_VERSION --no-git-tag-version
  fi

  if [[ -z "${PACKAGE_VERSION:-}" ]]; then
    log_step "PACKAGE_VERSION not provided, extracting from packages/cli/package.json"
    PACKAGE_VERSION=$(cat ./packages/cli/package.json | grep '"version"' | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')
    log_step "Extracted PACKAGE_VERSION: $PACKAGE_VERSION"
  fi

  log_step "Building CLI package version $PACKAGE_VERSION"
  bun run cli:package

  log_step "CLI package built successfully: ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz"
}

publish() {
  log_step "Publishing with npm (trusted publishing not supported by bun)"
  log_step "Checking npm version"
  npm --version

  if [[ "${DRY_RUN:-}" == "true" ]]; then
    log_step "Dry-run: npm publish ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz --access public --dry-run"
    # we have to publish with npm here, as trusted publishing is not yet supported by bun
    npm publish "${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz" --access public --dry-run
    log_step "CLI package dry-run publish completed successfully"
  else
    log_step "Publishing ${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz"
    # we have to publish with npm here, as trusted publishing is not yet supported by bun
    npm publish "${PACKAGE_NAME}-${PACKAGE_VERSION}.tgz" --access public
    log_step "CLI package published successfully"
  fi
}

main() {
  build

  if [[ "${SKIP_PUBLISH:-}" == "true" ]]; then
    log_step "Skipping publish"
  else
    publish
  fi
  exit 0
}

main
