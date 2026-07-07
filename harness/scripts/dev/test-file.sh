#!/usr/bin/env bash
# Run a single test file, auto-detecting workspace from path.
# Usage: ./scripts/dev/test-file.sh <test-file-path> [extra-jest-args...]
#    or: bun run test:file <test-file-path>
# Example: bun run test:file packages/cli/src/utils/credential_provider.test.ts
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <test-file-path> [extra-jest-args...]"
  exit 1
fi

FILE="$1"
shift

# Escape dots in the filename for jest regex pattern
PATTERN=$(basename "$FILE" | sed 's/\./\\./g')

if [[ "$FILE" == packages/cli/* ]]; then
  bun run --filter @gitlab/duo-cli test -- --testPathPattern="$PATTERN" "$@"
elif [[ "$FILE" == packages/tui/* ]]; then
  bun run --filter @gitlab-org/tui test -- --testPathPattern="$PATTERN" "$@"
else
  # Fall back to root unit test config
  bun run test:unit -- --testPathPattern="$PATTERN" "$@"
fi
