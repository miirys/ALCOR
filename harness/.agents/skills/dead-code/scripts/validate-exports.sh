#!/usr/bin/env bash
# Validate each unused export/type by checking actual usage across the codebase.
# Classifies each as: DEAD, SELF_ONLY, TEST_ONLY, RE_EXPORTED_DEAD, or USED.
#
# Input:  .dead-code/filtered.json (from filter-false-positives.sh)
# Output: .dead-code/validated-exports.json
#         .dead-code/validated-types.json
#         stdout: summary
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -f .dead-code/filtered.json ]; then
    echo "ERROR: Run filter-false-positives.sh first" >&2
    exit 1
fi

# Classify one symbol: outputs a JSON object with status + evidence
classify_symbol() {
    local filepath="$1" symbol="$2"

    # All TS references outside defining file, excluding tests
    local prod_files
    prod_files=$(rg -l "\\b${symbol}\\b" --type ts -g '!node_modules' -g '!*.test.*' -g '!*.spec.*' -g '!*test_utils*' . 2>/dev/null \
        | grep -v "$filepath" || true)

    # Vue references
    local vue_files
    vue_files=$(rg -l "\\b${symbol}\\b" -g '*.vue' -g '!node_modules' . 2>/dev/null || true)

    # JS references (for .js/.vue projects)
    local js_files
    js_files=$(rg -l "\\b${symbol}\\b" -g '*.js' -g '!node_modules' -g '!*.test.*' . 2>/dev/null \
        | grep -v "$filepath" || true)

    # Test-only references
    local test_files
    test_files=$(rg -l "\\b${symbol}\\b" --type ts -g '!node_modules' . 2>/dev/null \
        | grep -v "$filepath" | grep -E '\.(test|spec)\.' || true)

    local prod_count vue_count js_count test_count
    prod_count=0; [ -n "$prod_files" ] && prod_count=$(echo "$prod_files" | wc -l | tr -d ' ')
    vue_count=0; [ -n "$vue_files" ] && vue_count=$(echo "$vue_files" | wc -l | tr -d ' ')
    js_count=0; [ -n "$js_files" ] && js_count=$(echo "$js_files" | wc -l | tr -d ' ')
    test_count=0; [ -n "$test_files" ] && test_count=$(echo "$test_files" | wc -l | tr -d ' ')

    local total=$((prod_count + vue_count + js_count))

    if [ "$total" -eq 0 ] && [ "$test_count" -eq 0 ]; then
        echo "DEAD|No references outside defining file"
        return
    fi

    if [ "$total" -eq 0 ] && [ "$test_count" -gt 0 ]; then
        echo "TEST_ONLY|Only used in $test_count test file(s)"
        return
    fi

    # Check if only in barrel re-exports (index.ts files)
    local barrel_only=true
    while IFS= read -r f; do
        [ -z "$f" ] && continue
        if [[ "$f" != */index.ts ]]; then
            barrel_only=false
            break
        fi
    done <<< "$prod_files"

    if $barrel_only && [ "$vue_count" -eq 0 ] && [ "$js_count" -eq 0 ] && [ "$prod_count" -gt 0 ]; then
        local barrels
        barrels=$(echo "$prod_files" | head -3 | tr '\n' ', ' | sed 's/,$//')
        echo "RE_EXPORTED_DEAD|Only re-exported by barrel(s): $barrels"
        return
    fi

    local locations
    locations=$(printf '%s\n%s\n%s' "$prod_files" "$vue_files" "$js_files" | grep . | head -3 | tr '\n' ', ' | sed 's/,$//')
    echo "USED|Used in: $locations"
}

# Process a category (exports or types)
process_category() {
    local jq_path="$1" output_file="$2" label="$3"
    local tmpfile
    tmpfile=$(mktemp)

    local count
    count=$(jq "$jq_path | length" .dead-code/filtered.json)
    echo "Validating $count $label..." >&2

    echo "[" > "$tmpfile"
    local first=true

    while IFS= read -r item; do
        local name filepath result status evidence
        name=$(echo "$item" | jq -r '.name')
        filepath=$(echo "$item" | jq -r '.file')

        result=$(classify_symbol "$filepath" "$name")
        status="${result%%|*}"
        evidence="${result#*|}"

        if $first; then first=false; else echo "," >> "$tmpfile"; fi
        jq -n --arg f "$filepath" --arg n "$name" --arg s "$status" --arg e "$evidence" \
            '{file:$f, name:$n, status:$s, evidence:$e}' </dev/null >> "$tmpfile"
    done < <(jq -c "${jq_path}[]" .dead-code/filtered.json)

    echo "]" >> "$tmpfile"
    jq '.' "$tmpfile" > "$output_file"
    rm -f "$tmpfile"

    # Print summary
    echo "" >&2
    echo "$label:" >&2
    for s in DEAD TEST_ONLY RE_EXPORTED_DEAD USED; do
        local c
        c=$(jq "[.[] | select(.status == \"$s\")] | length" "$output_file")
        [ "$c" -gt 0 ] && echo "  $s: $c" >&2
    done

    # List dead items
    jq -r '.[] | select(.status == "DEAD" or .status == "RE_EXPORTED_DEAD") | "    \(.file): \(.name) (\(.status))"' "$output_file" >&2
}

process_category '.unused_exports' '.dead-code/validated-exports.json' 'Exports'
process_category '.unused_types' '.dead-code/validated-types.json' 'Types'

echo "" >&2
echo "Output: .dead-code/validated-exports.json, .dead-code/validated-types.json"
