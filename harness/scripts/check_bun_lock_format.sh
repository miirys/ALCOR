#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# Enforces that bun.lock is committed exactly as the pinned Bun version emits it.
#
# `bun install --lockfile-only` re-serializes the lockfile from the existing
# resolutions without installing or re-resolving (a pure reformat). If the
# committed lockfile differs from that canonical output, it has drifted — most
# commonly because a tool pretty-printed it into the multi-line format, which
# bloats it ~4x and makes every later dependency change produce a huge reformat
# diff. We regenerate and diff against the committed file.

LOCKFILE="${1:-bun.lock}"

if [ ! -f "$LOCKFILE" ]; then
  echo "Error: lockfile not found at '$LOCKFILE'" >&2
  exit 1
fi

# mise/config.toml is the source of truth; mismatched Bun versions re-serialize
# bun.lock differently, causing "unrelated" lockfile diffs.
mise_bun="$(sed -nE 's/^bun = "([^"]+)".*/\1/p' mise/config.toml)"
if [ -z "$mise_bun" ]; then
  echo "Error: could not read pinned Bun version from mise/config.toml" >&2
  exit 1
fi

# Check A: package.json must match the pinned version to prevent local tooling drift
pkg_bun="$(sed -nE 's/.*"packageManager": *"bun@([^"]+)".*/\1/p' package.json)"
if [ "$pkg_bun" != "$mise_bun" ]; then
  echo "✗ Bun version mismatch between mise/config.toml and package.json."
  echo
  echo "    mise/config.toml:              $mise_bun"
  echo "    package.json packageManager:   ${pkg_bun:-<missing>}"
  echo
  echo "These must match so every contributor and CI generate bun.lock identically."
  echo "Fix: set package.json packageManager to \"bun@$mise_bun\"."
  exit 1
fi

# Check B: the running Bun must be the pinned version for its output to be trusted.
# This will catch any future drift if CI installed bun version ever does not match repo state.
running_bun="$(bun --version)"
if [ "$running_bun" != "$mise_bun" ]; then
  echo "✗ Wrong Bun on CI PATH: running $running_bun, expected $mise_bun (from mise/config.toml)."
  echo
  echo "The lockfile-format check is only valid when run with the pinned Bun version."
  echo "Ensure the CI image provides the mise-managed Bun, or run via 'mise exec -- bun'."
  exit 1
fi

backup="$(mktemp)"
cp "$LOCKFILE" "$backup"
restore() { cp "$backup" "$LOCKFILE"; rm -f "$backup"; }
trap restore EXIT

bun install --lockfile-only >/dev/null 2>&1

if ! diff -q "$backup" "$LOCKFILE" >/dev/null 2>&1; then
  echo "✗ $LOCKFILE is not in Bun's canonical format."
  echo
  echo "It differs from what 'bun install --lockfile-only' produces. This usually"
  echo "means the lockfile was pretty-printed into the multi-line format, which"
  echo "bloats it ~4x and makes every dependency change produce a massive diff."
  echo
  echo "Fix: regenerate it with the pinned Bun version and commit the result:"
  echo "    bun install --lockfile-only"
  echo
  echo "Difference (committed → canonical):"
  diff "$backup" "$LOCKFILE" 2>/dev/null | head -40 || true
  exit 1
fi

echo "✓ $LOCKFILE is in Bun's canonical format"
