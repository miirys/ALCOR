#!/usr/bin/env bash
# Verify changes: compile, test, lint (stops on first failure)
# Usage: ./scripts/dev/verify.sh [--no-lint] [--no-test] [--cli-only]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

RUN_TESTS=1
RUN_LINT=1
CLI_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --no-test*) RUN_TESTS=0 ;;
    --no-lint) RUN_LINT=0 ;;
    --cli-only) CLI_ONLY=1 ;;
    *) echo "Unknown flag: $arg"; exit 1 ;;
  esac
done

run_phase() {
  local name="$1"
  shift
  printf "%-30s" "$name"
  local tmpfile
  tmpfile=$(mktemp)
  if "$@" > "$tmpfile" 2>&1; then
    echo "✓"
    rm -f "$tmpfile"
    return 0
  else
    echo "✗"
    echo ""
    # Show last 80 lines of output on failure
    tail -80 "$tmpfile"
    rm -f "$tmpfile"
    return 1
  fi
}

# 1. Compile
run_phase "compile" bun run compile

# 2. Tests
if [ "$RUN_TESTS" -eq 1 ]; then
  if [ "$CLI_ONLY" -eq 1 ]; then
    run_phase "test: cli" bun run --filter @gitlab/duo-cli test
    run_phase "test: tui" bun run --filter @gitlab-org/tui test
  else
    run_phase "test: unit" bun run test:unit
    run_phase "test: cli" bun run --filter @gitlab/duo-cli test
    run_phase "test: tui" bun run --filter @gitlab-org/tui test
    run_phase "test: integration" bun run test:integration
  fi
fi

# 3. Lint changed files
if [ "$RUN_LINT" -eq 1 ]; then
  run_phase "lint: fix changed" ./scripts/dev/fix-changed.sh
fi

echo ""
echo "All checks passed."
