#!/bin/bash

set -euo pipefail

for arg in "$@"; do
  case $arg in
    --previous-version=*)
      PREVIOUS_VERSION="${arg#*=}"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

PACKAGE_VERSION=$(node -p "require('./package.json').version")

# Check if the version has been bumped
if [[ "$PACKAGE_VERSION" == "$PREVIOUS_VERSION" ]]; then
  echo "Error: Version was not bumped. Current version $PACKAGE_VERSION is the same as previous version $PREVIOUS_VERSION."
  echo "This usually happens when the main branch has moved on since this pipeline started or no version bump commits were made since the last release."
  echo "Please check the latest pipeline on the main branch: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/pipelines?ref=main"
  echo "You may need to run a publish job from the latest pipeline."
  exit 1
fi

echo "Version was successfully bumped from $PREVIOUS_VERSION to $PACKAGE_VERSION."
exit 0
