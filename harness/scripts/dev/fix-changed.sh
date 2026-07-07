#!/usr/bin/env bash
# Fix all changed files (prettier, eslint, markdownlint)
# Usage: ./fix-changed.sh
# Exits with non-zero status if there are unfixable issues

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$PROJECT_ROOT"

HAS_ISSUES=0

# Get changed files
BASE=$(git merge-base origin/main HEAD 2>/dev/null || echo "origin/main")
FILES=$(
  {
    git diff --name-only --diff-filter=d "$BASE" 2>/dev/null || true
    git diff --name-only --diff-filter=d HEAD 2>/dev/null || true
    git diff --name-only --diff-filter=d --cached 2>/dev/null || true
    git ls-files --others --exclude-standard 2>/dev/null || true
  } | sort -u | grep -v '^$' || true
)

if [ -z "$FILES" ]; then
  echo "No changed files."
  exit 0
fi

# Filter existing files by type
filter_existing() {
  local pattern="$1"
  echo "$FILES" | grep -E "$pattern" | while read -r f; do
    [ -f "$f" ] && echo "$f"
  done
}

TS_FILES=$(filter_existing '\.(ts|tsx|js|jsx)$')
PRETTIER_FILES=$(filter_existing '\.(ts|tsx|js|jsx|json|vue|scss|css|md)$')
MD_FILES=$(filter_existing '\.md$')

# Prettier - it shows what it formats
echo "prettier:"
if [ -n "$PRETTIER_FILES" ]; then
  OUTPUT=$(echo "$PRETTIER_FILES" | xargs bunx prettier --write 2>&1 || true)
  FORMATTED=$(echo "$OUTPUT" | grep -v "^$" | grep -v "(unchanged)$" || true)
  if [ -n "$FORMATTED" ]; then
    echo "$FORMATTED" | sed 's/^/  /'
  else
    echo "  all ok"
  fi
else
  echo "  no files"
fi

# ESLint - auto-fixes what it can
echo "eslint:"
if [ -n "$TS_FILES" ]; then
  OUTPUT=$(echo "$TS_FILES" | xargs bunx eslint --fix 2>&1 || true)
  ISSUES=$(echo "$OUTPUT" | grep -vE "^$" || true)
  if [ -n "$ISSUES" ]; then
    echo "$ISSUES" | sed 's/^/  /'
    # Check if there are actual errors/warnings (not just file paths)
    if echo "$ISSUES" | grep -qE "error|warning"; then
      HAS_ISSUES=1
    fi
  else
    echo "  all ok"
  fi
else
  echo "  no files"
fi

# Markdownlint - auto-fixes what it can
echo "markdownlint:"
if [ -n "$MD_FILES" ]; then
  OUTPUT=$(echo "$MD_FILES" | xargs bunx markdownlint-cli2 --fix 2>&1 || true)
  # Show only actual issues (file:line format), not status lines
  ISSUES=$(echo "$OUTPUT" | grep -E "^[^ ].*:[0-9]+" || true)
  if [ -n "$ISSUES" ]; then
    echo "$ISSUES" | sed 's/^/  /'
    HAS_ISSUES=1
  else
    echo "  all ok"
  fi
else
  echo "  no files"
fi

exit $HAS_ISSUES
