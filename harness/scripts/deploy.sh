#!/usr/bin/env bash

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/deploy_log.sh
source "$SCRIPT_DIR/lib/deploy_log.sh"

DRY_RUN="false"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN="true" ;;
    *)
      log::warn "Unknown argument: $arg"
      ;;
  esac
done

PROJECT_ID="46519181"
PROJECT_API="https://gitlab.com/api/v4/projects/${PROJECT_ID}"

LATEST=$(node -p "require('./package.json').version")
NPM_PACKAGE_NAME=$(node -p "require('./package.json').name")
TARBALL_NAME="gitlab-lsp-${LATEST}.tar.gz"
GENERIC_PKG_URL="${PROJECT_API}/packages/generic/gitlab-language-server/${LATEST}/${TARBALL_NAME}"
RELEASE_ASSETS_URL="${PROJECT_API}/gitlab-language-server/${LATEST}/assets/links"

summary::start "gitlab-lsp deploy ${LATEST}" "$DRY_RUN"

log::section "Deploy plan"
log::info "Package name:        ${NPM_PACKAGE_NAME}"
log::info "Package version:     ${LATEST}"
log::info "Generic tarball URL: ${GENERIC_PKG_URL}"
log::info "Release assets URL:  ${RELEASE_ASSETS_URL}"
log::info "Dry-run:             ${DRY_RUN}"

# ---------------------------------------------------------------------------
# Step 1: build the tarball with the platform binaries
# ---------------------------------------------------------------------------
log::section "Step 1/3: package binaries -> ${TARBALL_NAME}"
if [[ ! -d ./bin ]]; then
  log::error "./bin does not exist; cannot create ${TARBALL_NAME}"
  summary::add "Tarball ${TARBALL_NAME}" "fail" "./bin missing"
  summary::print || true
  exit 1
fi

if log::run tar -czvf "$TARBALL_NAME" ./bin > /tmp/tar.log 2>&1; then
  TARBALL_SIZE=$(du -h "$TARBALL_NAME" | awk '{print $1}')
  TARBALL_FILES=$(grep -c '' /tmp/tar.log || echo 0)
  log::ok "Created ${TARBALL_NAME} (${TARBALL_SIZE}, ${TARBALL_FILES} entries)"
  summary::add "Tarball ${TARBALL_NAME}" "ok" "${TARBALL_SIZE}, ${TARBALL_FILES} entries"
else
  log::error "tar failed; output:"
  sed 's/^/    /' /tmp/tar.log >&2
  summary::add "Tarball ${TARBALL_NAME}" "fail" "tar failed"
  summary::print || true
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: upload the tarball to the generic package registry + attach to release
# ---------------------------------------------------------------------------
log::section "Step 2/3: generic package registry upload"

if [[ "$DRY_RUN" == "true" ]]; then
  log::warn "Dry-run: skipping HEAD/upload/asset-link calls against ${GENERIC_PKG_URL}"
  summary::add "Generic package upload" "skip" "dry-run"
  summary::add "Release asset link"    "skip" "dry-run"
else
  log::info "Checking whether ${GENERIC_PKG_URL} already exists..."
  IS_ALREADY_PRESENT="false"
  HEAD_HTTP_CODE=$(curl --silent --output /dev/null --write-out '%{http_code}' \
    --header "JOB-TOKEN: $CI_JOB_TOKEN" "$GENERIC_PKG_URL" || true)
  log::info "HEAD ${GENERIC_PKG_URL} -> HTTP ${HEAD_HTTP_CODE}"
  if [[ "$HEAD_HTTP_CODE" == "200" ]]; then
    IS_ALREADY_PRESENT="true"
    log::warn "Generic package already present at ${GENERIC_PKG_URL}; skipping upload"
    summary::add "Generic package upload" "skip" "already present (HTTP 200)"
    summary::add "Release asset link"    "skip" "already linked"
  fi

  if [[ "$IS_ALREADY_PRESENT" == "false" ]]; then
    log::info "Uploading '${TARBALL_NAME}' to '${GENERIC_PKG_URL}'"
    UPLOAD_HTTP_CODE=$(curl --silent --output /tmp/upload.log --write-out '%{http_code}' \
      --header "JOB-TOKEN: $CI_JOB_TOKEN" \
      --upload-file "$TARBALL_NAME" "$GENERIC_PKG_URL" || true)
    log::info "PUT ${GENERIC_PKG_URL} -> HTTP ${UPLOAD_HTTP_CODE}"
    if [[ "$UPLOAD_HTTP_CODE" =~ ^2 ]]; then
      log::ok "Uploaded ${TARBALL_NAME}"
      summary::add "Generic package upload" "ok" "HTTP ${UPLOAD_HTTP_CODE} -> ${GENERIC_PKG_URL}"
    else
      log::error "Upload failed (HTTP ${UPLOAD_HTTP_CODE}); response body:"
      sed 's/^/    /' /tmp/upload.log >&2 || true
      summary::add "Generic package upload" "fail" "HTTP ${UPLOAD_HTTP_CODE}"
      summary::print || true
      exit 1
    fi

    log::info "Attaching tarball as release asset link"
    LINK_HTTP_CODE=$(curl --silent --output /tmp/link.log --write-out '%{http_code}' \
      --request POST \
      --header "JOB-TOKEN: $CI_JOB_TOKEN" \
      --data "name=${TARBALL_NAME}" \
      --data "url=${GENERIC_PKG_URL}" \
      "$RELEASE_ASSETS_URL" || true)
    log::info "POST ${RELEASE_ASSETS_URL} -> HTTP ${LINK_HTTP_CODE}"
    if [[ "$LINK_HTTP_CODE" =~ ^2 ]]; then
      log::ok "Release asset link created"
      summary::add "Release asset link" "ok" "HTTP ${LINK_HTTP_CODE}"
    else
      log::warn "Could not create release asset link (HTTP ${LINK_HTTP_CODE}); response body:"
      sed 's/^/    /' /tmp/link.log >&2 || true
      summary::add "Release asset link" "info" "HTTP ${LINK_HTTP_CODE}"
      # Non-fatal: we don't exit here to preserve previous behavior.
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Step 3: publish the npm package via bun publish
# ---------------------------------------------------------------------------
log::section "Step 3/3: bun publish ${NPM_PACKAGE_NAME}@${LATEST}"
log::info "Target registry: https://gitlab.com/${CI_PROJECT_PATH:-gitlab-org/editor-extensions/gitlab-lsp}/-/packages"
log::info "Effective bunfig.toml (auth token redacted):"
sed -E 's/(token = ")[^"]+(")/\1<redacted>\2/' ./bunfig.toml | sed 's/^/    /'

PUBLISH_CMD=(bun publish)
if [[ "$DRY_RUN" == "true" ]]; then
  PUBLISH_CMD+=(--dry-run)
fi
log::info "Running: ${PUBLISH_CMD[*]}"

set +e
"${PUBLISH_CMD[@]}" 2>&1 | tee /tmp/bun-publish.log
PUBLISH_RC=${PIPESTATUS[0]}
set -e

if [[ $PUBLISH_RC -eq 0 ]]; then
  log::ok "bun publish completed successfully"
  if [[ "$DRY_RUN" == "true" ]]; then
    summary::add "NPM publish (${NPM_PACKAGE_NAME}@${LATEST})" "ok" "dry-run succeeded"
  else
    summary::add "NPM publish (${NPM_PACKAGE_NAME}@${LATEST})" "ok" "published"
  fi
else
  log::error "bun publish failed with exit code ${PUBLISH_RC}"
  summary::add "NPM publish (${NPM_PACKAGE_NAME}@${LATEST})" "fail" "exit ${PUBLISH_RC} (see /tmp/bun-publish.log)"
fi

# ---------------------------------------------------------------------------
# Summary + exit code
# ---------------------------------------------------------------------------
if summary::print; then
  exit 0
else
  exit 1
fi
