#!/usr/bin/env bash
# Run knip and produce a categorized JSON report.
# Output: .dead-code/knip-raw.json (full knip output)
#         .dead-code/knip-categorized.json (categorized findings)
#         stdout: summary counts
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

mkdir -p .dead-code

echo "Running knip..." >&2
bunx knip --reporter json > .dead-code/knip-raw.json 2>.dead-code/knip-stderr.log || true

if [ ! -s .dead-code/knip-raw.json ]; then
    echo "ERROR: knip produced no output. Check .dead-code/knip-stderr.log" >&2
    exit 1
fi

# knip.config.ts declares entry points for esbuild/Vite/CLI builds.
# Filter out test/spec files here (they're not dead code candidates).
jq '
  .issues
  | map(select(.file | test("\\.(test|spec)\\.") | not))
  | {
      unused_files:    [.[] | select(.files | length > 0) | .file],
      unused_exports:  [.[] | .exports[] as $e | {file: .file, name: $e.name}],
      unused_types:    [.[] | .types[] as $t | {file: .file, name: $t.name}],
      unused_deps:     [.[] | .dependencies[] as $d | {file: .file, name: $d.name}],
      unused_dev_deps: [.[] | .devDependencies[] as $d | {file: .file, name: $d.name}]
    }
' .dead-code/knip-raw.json > .dead-code/knip-categorized.json

jq -r '
  "Unused files:        \(.unused_files | length)",
  "Unused exports:      \(.unused_exports | length)",
  "Unused types:        \(.unused_types | length)",
  "Unused deps:         \(.unused_deps | length)",
  "Unused dev deps:     \(.unused_dev_deps | length)"
' .dead-code/knip-categorized.json

echo ""
echo "Output: .dead-code/knip-raw.json, .dead-code/knip-categorized.json"
