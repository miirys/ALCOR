#!/usr/bin/env bash
# Filter false positives from knip results using project-specific knowledge.
# knip.config.ts handles: entry points for esbuild/Vite/CLI builds, vendor,
# scripts, test fixtures, .d.ts ambient declarations.
# This script handles what knip can't: Vue template usage, SCSS imports,
# Vite HTML entry detection, DI decorator patterns.
#
# Input:  .dead-code/knip-categorized.json (from run-knip.sh)
# Output: .dead-code/filtered.json          (findings with false positives removed)
#         .dead-code/false-positives.json    (identified false positives with reasons)
#         stdout: summary
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -f .dead-code/knip-categorized.json ]; then
    echo "ERROR: Run run-knip.sh first" >&2
    exit 1
fi

# ---------- helpers ----------

is_vite_entry() {
    local filepath="$1"
    local basename="${filepath##*/}"
    local name="${basename%.*}"
    local dir="$filepath"
    # Walk up to 3 parent dirs looking for index.html that references this file
    for _ in 1 2 3; do
        dir="$(dirname "$dir")"
        if [ -f "$dir/index.html" ] && grep -q "$name" "$dir/index.html" </dev/null 2>/dev/null; then
            return 0
        fi
    done
    return 1
}

is_imported_by_vue() {
    local filepath="$1"
    local name="${filepath##*/}"; name="${name%.*}"
    rg -l "$name" --glob '*.vue' --glob '!node_modules' . </dev/null 2>/dev/null | grep -qv "$filepath"
}

is_scss_imported() {
    local filepath="$1"
    local basename="${filepath##*/}"
    local dir="$(dirname "$filepath")"
    rg -l "$basename" "$dir" --glob '*.vue' --glob '*.ts' --glob '!node_modules' </dev/null 2>/dev/null | grep -qv "$filepath"
}

# Pre-compute the set of all DI-referenced symbols (run rg once per pattern, not per symbol)
di_symbols_file=$(mktemp)
trap 'rm -f "$di_symbols_file"' EXIT

rg -o '@Implements\((\w+)\)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o '@Injectable\((\w+)\b' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'dependencies:.*' --type ts -g '!node_modules' . 2>/dev/null | grep -oE '[A-Z][A-Za-z0-9_]+' >> "$di_symbols_file" || true
rg -o 'collection\((\w+)\)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'getRequiredService\((\w+)\)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'getOptionalService\((\w+)\)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'addClass\((\w+)\)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'aliases:\s*\[(\w+)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'aliases:.*,\s*(\w+)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true
rg -o 'implements (\w+)' --type ts -g '!node_modules' -r '$1' . 2>/dev/null >> "$di_symbols_file" || true

sort -u "$di_symbols_file" -o "$di_symbols_file"

# Check if a symbol is used via DI decorators/registration (O(1) lookup)
is_di_symbol() {
    grep -qx "$1" "$di_symbols_file"
}

# ---------- process files ----------

fp_file=$(mktemp)
kept_file=$(mktemp)
trap 'rm -f "$di_symbols_file" "$fp_file" "$kept_file"' EXIT

while IFS= read -r filepath; do
    reason=""
    if [[ "$filepath" == *.scss ]]; then
        is_scss_imported "$filepath" && reason="SCSS imported by Vue/TS in same directory"
    elif [[ "$filepath" == *.vue ]]; then
        is_imported_by_vue "$filepath" && reason="Vue component used in another template"
    elif is_vite_entry "$filepath"; then
        reason="Vite entry point (referenced from index.html)"
    fi

    if [ -n "$reason" ]; then
        jq -n --arg f "$filepath" --arg r "$reason" '{file:$f, reason:$r, category:"file"}' >> "$fp_file"
    else
        echo "$filepath" >> "$kept_file"
    fi
done < <(jq -r '.unused_files[]' .dead-code/knip-categorized.json)

# ---------- process exports ----------

fp_export=$(mktemp)
kept_export=$(mktemp)
trap 'rm -f "$di_symbols_file" "$fp_file" "$kept_file" "$fp_export" "$kept_export"' EXIT

while IFS= read -r item; do
    name=$(echo "$item" | jq -r '.name')
    filepath=$(echo "$item" | jq -r '.file')

    if is_di_symbol "$name"; then
        jq -n --arg f "$filepath" --arg n "$name" --arg r "DI token/service used via decorators" \
            '{file:$f, name:$n, reason:$r, category:"export"}' >> "$fp_export"
    else
        echo "$item" >> "$kept_export"
    fi
done < <(jq -c '.unused_exports[]' .dead-code/knip-categorized.json)

# ---------- process types ----------

fp_type=$(mktemp)
kept_type=$(mktemp)
trap 'rm -f "$di_symbols_file" "$fp_file" "$kept_file" "$fp_export" "$kept_export" "$fp_type" "$kept_type"' EXIT

while IFS= read -r item; do
    name=$(echo "$item" | jq -r '.name')
    filepath=$(echo "$item" | jq -r '.file')

    if is_di_symbol "$name"; then
        jq -n --arg f "$filepath" --arg n "$name" --arg r "DI interface token type" \
            '{file:$f, name:$n, reason:$r, category:"type"}' >> "$fp_type"
    else
        echo "$item" >> "$kept_type"
    fi
done < <(jq -c '.unused_types[]' .dead-code/knip-categorized.json)

# ---------- assemble output ----------

# Build kept files array
if [ -s "$kept_file" ]; then
    kept_files_json=$(jq -R -s 'split("\n") | map(select(. != ""))' "$kept_file")
else
    kept_files_json="[]"
fi

# Build kept exports/types arrays
for f in "$kept_export" "$kept_type"; do
    [ -f "$f" ] || echo -n > "$f"
done

kept_exports_json=$(if [ -s "$kept_export" ]; then jq -s '.' "$kept_export"; else echo "[]"; fi)
kept_types_json=$(if [ -s "$kept_type" ]; then jq -s '.' "$kept_type"; else echo "[]"; fi)

# Deps pass through unchanged
deps_json=$(jq '.unused_deps' .dead-code/knip-categorized.json)
devdeps_json=$(jq '.unused_dev_deps' .dead-code/knip-categorized.json)

jq -n \
    --argjson files "$kept_files_json" \
    --argjson exports "$kept_exports_json" \
    --argjson types "$kept_types_json" \
    --argjson deps "$deps_json" \
    --argjson devdeps "$devdeps_json" \
    '{unused_files:$files, unused_exports:$exports, unused_types:$types, unused_deps:$deps, unused_dev_deps:$devdeps}' \
    > .dead-code/filtered.json

# Build false positives array
fps_json="[]"
for f in "$fp_file" "$fp_export" "$fp_type"; do
    if [ -s "$f" ]; then
        fps_json=$(echo "$fps_json"; jq -s '.' "$f") 
    fi
done
# Merge all FP arrays
echo "$fps_json" | jq -s 'add // []' > .dead-code/false-positives.json

# ---------- summary ----------

orig_files=$(jq '.unused_files | length' .dead-code/knip-categorized.json)
orig_exports=$(jq '.unused_exports | length' .dead-code/knip-categorized.json)
orig_types=$(jq '.unused_types | length' .dead-code/knip-categorized.json)
new_files=$(jq '.unused_files | length' .dead-code/filtered.json)
new_exports=$(jq '.unused_exports | length' .dead-code/filtered.json)
new_types=$(jq '.unused_types | length' .dead-code/filtered.json)
total_fps=$(jq 'length' .dead-code/false-positives.json)

echo "After filtering:"
echo "  Unused files:      $new_files  (removed $((orig_files - new_files)) false positives)"
echo "  Unused exports:    $new_exports  (removed $((orig_exports - new_exports)) false positives)"
echo "  Unused types:      $new_types  (removed $((orig_types - new_types)) false positives)"
echo "  Unused deps:       $(jq '.unused_deps | length' .dead-code/filtered.json)  (passed through)"
echo "  Unused dev deps:   $(jq '.unused_dev_deps | length' .dead-code/filtered.json)  (passed through)"
echo "  Total FPs removed: $total_fps"
echo ""
echo "Output: .dead-code/filtered.json, .dead-code/false-positives.json"
