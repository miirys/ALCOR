#!/usr/bin/env bash
# Validate each unused file by checking if anything imports it.
# Checks TS imports, Vue template usage, and barrel re-exports.
#
# Input:  .dead-code/filtered.json (from filter-false-positives.sh)
# Output: .dead-code/validated-files.json
#         stdout: confirmed dead files
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

if [ ! -f .dead-code/filtered.json ]; then
    echo "ERROR: Run filter-false-positives.sh first" >&2
    exit 1
fi

classify_file() {
    local filepath="$1"
    local basename="${filepath##*/}"
    local name="${basename%.*}"
    local dir="$(dirname "$filepath")"

    # Build search patterns using path segments (not just basename) to avoid false matches.
    # For index.ts, use the parent directory name as the import target.
    # Use last 2 path segments for specificity (e.g. "context_providers/imports" not just "imports").
    local search_patterns=()
    local path_no_ext="${filepath%.*}"

    if [ "$name" = "index" ]; then
        # index.ts barrels are imported by directory name
        local dir_name
        dir_name="$(basename "$dir")"
        local parent_and_dir
        parent_and_dir=$(echo "$dir" | rev | cut -d/ -f1-2 | rev)
        search_patterns+=("from.*['\"].*${parent_and_dir}['\"]")
        search_patterns+=("from.*['\"].*/${dir_name}['\"]")
        search_patterns+=("from.*['\"].*/${dir_name}/index['\"]")
    else
        # Non-index files: use last 2 path segments for specificity
        local segments
        segments=$(echo "$path_no_ext" | rev | cut -d/ -f1-2 | rev)
        search_patterns+=("from.*['\"].*${segments}['\"]")
        # Also match just the filename if it's unique enough (3+ segments in name)
        if [[ "$name" == *_* ]] || [[ "$name" == *-* ]] || [ ${#name} -gt 12 ]; then
            search_patterns+=("from.*['\"].*/${name}['\"]")
        fi
    fi

    local prod_importers=""
    local vue_importers=""
    local test_importers=""

    for pattern in "${search_patterns[@]}"; do
        # Find TS files that import this module
        local ts_matches
        ts_matches=$(rg -l "$pattern" --type ts -g '!node_modules' -g '!*.test.*' -g '!*.spec.*' -g '!*test_utils*' . 2>/dev/null \
            | grep -v "$filepath" || true)
        [ -n "$ts_matches" ] && prod_importers=$(printf '%s\n%s' "$prod_importers" "$ts_matches")

        # Find Vue files
        local vue_matches
        vue_matches=$(rg -l "$pattern" -g '*.vue' -g '!node_modules' . 2>/dev/null \
            | grep -v "$filepath" || true)
        [ -n "$vue_matches" ] && vue_importers=$(printf '%s\n%s' "$vue_importers" "$vue_matches")

        # Find test-only importers
        local test_matches
        test_matches=$(rg -l "$pattern" --type ts -g '!node_modules' . 2>/dev/null \
            | grep -v "$filepath" | grep -E '\.(test|spec)\.|test_utils' || true)
        [ -n "$test_matches" ] && test_importers=$(printf '%s\n%s' "$test_importers" "$test_matches")
    done

    # Deduplicate
    prod_importers=$(echo "$prod_importers" | grep . | sort -u || true)
    vue_importers=$(echo "$vue_importers" | grep . | sort -u || true)
    test_importers=$(echo "$test_importers" | grep . | sort -u || true)

    local prod_count=0 vue_count=0 test_count=0
    [ -n "$prod_importers" ] && prod_count=$(echo "$prod_importers" | wc -l | tr -d ' ')
    [ -n "$vue_importers" ] && vue_count=$(echo "$vue_importers" | wc -l | tr -d ' ')
    [ -n "$test_importers" ] && test_count=$(echo "$test_importers" | wc -l | tr -d ' ')

    local total=$((prod_count + vue_count))

    if [ "$total" -eq 0 ] && [ "$test_count" -eq 0 ]; then
        echo "DEAD|No imports found"
    elif [ "$total" -eq 0 ] && [ "$test_count" -gt 0 ]; then
        local files
        files=$(echo "$test_importers" | head -3 | tr '\n' ', ' | sed 's/,$//')
        echo "TEST_ONLY|Only imported by tests: $files"
    else
        local files
        files=$(printf '%s\n%s' "$prod_importers" "$vue_importers" | grep . | head -3 | tr '\n' ', ' | sed 's/,$//')
        echo "USED|Imported by: $files"
    fi
}

count=$(jq '.unused_files | length' .dead-code/filtered.json)
echo "Validating $count files..." >&2

tmpfile=$(mktemp)
echo "[" > "$tmpfile"
first=true

while IFS= read -r filepath; do
    result=$(classify_file "$filepath")
    status="${result%%|*}"
    evidence="${result#*|}"

    if $first; then first=false; else echo "," >> "$tmpfile"; fi
    jq -n --arg f "$filepath" --arg s "$status" --arg e "$evidence" \
        '{file:$f, status:$s, evidence:$e}' </dev/null >> "$tmpfile"
done < <(jq -r '.unused_files[]' .dead-code/filtered.json)

echo "]" >> "$tmpfile"
jq '.' "$tmpfile" > .dead-code/validated-files.json
rm -f "$tmpfile"

# Summary
dead=$(jq '[.[] | select(.status == "DEAD")] | length' .dead-code/validated-files.json)
test_only=$(jq '[.[] | select(.status == "TEST_ONLY")] | length' .dead-code/validated-files.json)
used=$(jq '[.[] | select(.status == "USED")] | length' .dead-code/validated-files.json)

echo "Results: $dead DEAD, $test_only TEST_ONLY, $used USED (false positive)"
echo ""

if [ "$dead" -gt 0 ]; then
    echo "Confirmed dead files:"
    jq -r '.[] | select(.status == "DEAD") | "  \(.file)"' .dead-code/validated-files.json
fi

if [ "$test_only" -gt 0 ]; then
    echo ""
    echo "Test-only files:"
    jq -r '.[] | select(.status == "TEST_ONLY") | "  \(.file)"' .dead-code/validated-files.json
fi

if [ "$used" -gt 0 ]; then
    echo ""
    echo "False positives (need manual review): $used"
    jq -r '.[] | select(.status == "USED") | "  \(.file) — \(.evidence)"' .dead-code/validated-files.json
fi

echo ""
echo "Output: .dead-code/validated-files.json"
