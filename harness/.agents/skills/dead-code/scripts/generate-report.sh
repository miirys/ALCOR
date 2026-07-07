#!/usr/bin/env bash
# Generate a markdown summary from all validated findings.
# Input:  .dead-code/validated-files.json
#         .dead-code/validated-exports.json
#         .dead-code/validated-types.json
#         .dead-code/false-positives.json
#         .dead-code/dead-di-tokens.json (optional)
# Output: .dead-code/report.md
#         stdout: the report
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

{
echo "# Dead Code Report"
echo ""

# Dead files
dead_files=$(jq '[.[] | select(.status == "DEAD")]' .dead-code/validated-files.json 2>/dev/null || echo "[]")
count=$(echo "$dead_files" | jq 'length')
if [ "$count" -gt 0 ]; then
    echo "## Dead Files ($count)"
    echo ""
    echo "| File | Evidence |"
    echo "|------|----------|"
    echo "$dead_files" | jq -r '.[] | "| `\(.file)` | \(.evidence) |"'
    echo ""
fi

# Dead exports
dead_exports=$(jq '[.[] | select(.status == "DEAD" or .status == "RE_EXPORTED_DEAD")]' .dead-code/validated-exports.json 2>/dev/null || echo "[]")
count=$(echo "$dead_exports" | jq 'length')
if [ "$count" -gt 0 ]; then
    echo "## Dead Exports ($count)"
    echo ""
    echo "| File | Export | Status |"
    echo "|------|--------|--------|"
    echo "$dead_exports" | jq -r '.[] | "| `\(.file)` | `\(.name)` | \(.status) |"'
    echo ""
fi

# Dead types
dead_types=$(jq '[.[] | select(.status == "DEAD" or .status == "RE_EXPORTED_DEAD")]' .dead-code/validated-types.json 2>/dev/null || echo "[]")
count=$(echo "$dead_types" | jq 'length')
if [ "$count" -gt 0 ]; then
    echo "## Dead Types ($count)"
    echo ""
    echo "| File | Type | Status |"
    echo "|------|------|--------|"
    echo "$dead_types" | jq -r '.[] | "| `\(.file)` | `\(.name)` | \(.status) |"'
    echo ""
fi

# Dead DI tokens
if [ -f .dead-code/dead-di-tokens.json ]; then
    di_count=$(jq 'length' .dead-code/dead-di-tokens.json)
    if [ "$di_count" -gt 0 ]; then
        echo "## Dead DI Tokens ($di_count)"
        echo ""
        echo "| File | Token |"
        echo "|------|-------|"
        jq -r '.[] | "| `\(.file):\(.line)` | `\(.name)`" + (if .collection then " (collection)" else "" end) + " |"' \
            .dead-code/dead-di-tokens.json
        echo ""
    fi
fi

# Test-only
test_files=$(jq '[.[] | select(.status == "TEST_ONLY")]' .dead-code/validated-files.json 2>/dev/null || echo "[]")
test_exports=$(jq '[.[] | select(.status == "TEST_ONLY")]' .dead-code/validated-exports.json 2>/dev/null || echo "[]")
tf_count=$(echo "$test_files" | jq 'length')
te_count=$(echo "$test_exports" | jq 'length')
if [ "$((tf_count + te_count))" -gt 0 ]; then
    echo "## Test-Only (review needed)"
    echo ""
    if [ "$tf_count" -gt 0 ]; then
        echo "Files only imported by tests:"
        echo "$test_files" | jq -r '.[] | "- `\(.file)`"'
    fi
    if [ "$te_count" -gt 0 ]; then
        echo ""
        echo "Exports only used in tests:"
        echo "$test_exports" | jq -r '.[] | "- `\(.file)`: `\(.name)`"'
    fi
    echo ""
fi

# False positives
fp_count=$(jq 'length' .dead-code/false-positives.json 2>/dev/null || echo 0)
if [ "$fp_count" -gt 0 ]; then
    echo "## False Positives Filtered ($fp_count)"
    echo ""
    echo "| Item | Reason |"
    echo "|------|--------|"
    jq -r '.[] | "| `\(.file)`" + (if .name then " → `\(.name)`" else "" end) + " | \(.reason) |"' \
        .dead-code/false-positives.json
    echo ""
fi

# Summary
echo "## Summary"
echo ""

df=$(echo "$dead_files" | jq 'length')
de=$(echo "$dead_exports" | jq 'length')
dt=$(echo "$dead_types" | jq 'length')
di=$(jq 'length' .dead-code/dead-di-tokens.json 2>/dev/null || echo 0)
total=$((df + de + dt + di))

uf=$(jq '[.[] | select(.status == "USED")] | length' .dead-code/validated-files.json 2>/dev/null || echo 0)
ue=$(jq '[.[] | select(.status == "USED")] | length' .dead-code/validated-exports.json 2>/dev/null || echo 0)
ut=$(jq '[.[] | select(.status == "USED")] | length' .dead-code/validated-types.json 2>/dev/null || echo 0)

echo "| Category | Dead | Test-Only | False Positive |"
echo "|----------|------|-----------|----------------|"
echo "| Files | $df | $tf_count | $uf |"
echo "| Exports | $de | $te_count | $ue |"
test_types=$(jq '[.[] | select(.status == "TEST_ONLY")]' .dead-code/validated-types.json 2>/dev/null || echo "[]")
tt_count=$(echo "$test_types" | jq 'length')
echo "| Types | $dt | $tt_count | $ut |"
[ "$di" -gt 0 ] && echo "| DI Tokens | $di | — | — |"
echo "| **Total** | **$total** | | |"

} | tee .dead-code/report.md

echo "" >&2
echo "Output: .dead-code/report.md" >&2
