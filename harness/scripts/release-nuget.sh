#!/usr/bin/env bash

# Ensure to fail if any of the commands fails
set -euo pipefail

SKIP_PUBLISH=false

for arg in "$@"; do
  case $arg in
    --skip-publish)
      SKIP_PUBLISH=true
      shift
      ;;
    --package-name=*)
      PACKAGE_NAME="${arg#*=}"
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

log_step "Running release-nuget script with args:"
log_step "SKIP_PUBLISH: $SKIP_PUBLISH"

if [[ -z "${PACKAGE_VERSION:-}" ]]; then
  log_step "PACKAGE_VERSION must be provided. Use --package-version=<version> to specify it."
  exit 1
else
  LATEST="$PACKAGE_VERSION"
fi

if [[ -z "${PACKAGE_NAME:-}" ]]; then
  NUGET_PACKAGE_NAME="GitLab.LanguageServer"
else
  NUGET_PACKAGE_NAME="$PACKAGE_NAME"
fi
NUGET_SPEC_FILE="nuget-spec.nuspec"
NODE_SEA_NUGET_SPEC_FILE="nuget-spec-node-sea.nuspec"


build() {
    nuspec_file=$NODE_SEA_NUGET_SPEC_FILE

    log_step "Building nuget package ${NUGET_PACKAGE_NAME}.${LATEST}.nupkg from $nuspec_file"
    ## Replace placeholders %PACKAGE_NAME% and %VERSION% with the actual values
    sed -i "s/%PACKAGE_NAME%/${NUGET_PACKAGE_NAME}/g" $nuspec_file
    sed -i "s/%VERSION%/${LATEST}/g" $nuspec_file

    ## Create the .nupkg file
    mono /usr/local/bin/nuget.exe pack $nuspec_file
}

publish() {
    ## Publish the nuget package
    SOURCE_NAME="gitlab-nuget-package-registry"

    log_step "Publishing nuget package to $SOURCE_NAME"

    mono /usr/local/bin/nuget.exe source add \
      -Name $SOURCE_NAME \
      -Source "https://gitlab.com/api/v4/projects/46519181/packages/nuget/index.json" \
      -UserName "gitlab-ci-token" \
      -Password $CI_JOB_TOKEN

    mono /usr/local/bin/nuget.exe push "${NUGET_PACKAGE_NAME}.${LATEST}.nupkg" -Source $SOURCE_NAME
}

main() {
  build

  if [[ "${SKIP_PUBLISH:-}" == "false" ]]; then
    publish
  else
    log_step "Skipping NuGet publish"
  fi
  exit 0
}

main
