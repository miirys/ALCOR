#!/usr/bin/env bash
# Find dead DI tokens — interface IDs created with createInterfaceId/brandedId/createCollectionId
# that have no implementation registered via @Implements, @Injectable, or addClass.
#
# Output: .dead-code/dead-di-tokens.json
#         stdout: dead tokens
set -euo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

mkdir -p .dead-code

# 1. Extract all DI token definitions
tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

echo "[" > "$tmpfile"
first=true

# Find createInterfaceId and brandedId definitions
while IFS= read -r line; do
    # Parse: ./path/file.ts:42:export const FooBar = createInterfaceId<...>(...)
    filepath=$(echo "$line" | sed 's/^\.\///' | cut -d: -f1)
    lineno=$(echo "$line" | cut -d: -f2)
    name=$(echo "$line" | sed -E 's/.*(const|let)[[:space:]]+([A-Za-z_][A-Za-z0-9_]*).*/\2/')
    is_collection=$(echo "$line" | grep -q 'createCollectionId' && echo "true" || echo "false")

    [ -z "$name" ] && continue

    # 2. Check if this token has consumers
    has_consumer=false
    for pattern in \
        "@Implements\\($name\\)" \
        "@Injectable\\($name\\b" \
        "dependencies:.*$name" \
        "collection\\($name\\)" \
        "getRequiredService\\($name\\)" \
        "getOptionalService\\($name\\)" \
        "addClass\\($name\\)" \
        "aliases:.*\\[$name" \
        "aliases:.*,\\s*$name" \
        "implements $name"; do
        if rg -q "$pattern" --type ts -g '!node_modules' . </dev/null 2>/dev/null; then
            has_consumer=true
            break
        fi
    done

    if ! $has_consumer; then
        if $first; then first=false; else echo "," >> "$tmpfile"; fi
        jq -n --arg f "$filepath" --arg l "$lineno" --arg n "$name" --argjson c "$is_collection" \
            '{file:$f, line:($l|tonumber), name:$n, collection:$c}' </dev/null >> "$tmpfile"
    fi
done < <(rg -n 'createInterfaceId|brandedId|createCollectionId' --type ts -g '!node_modules' . 2>/dev/null | \
    grep -E '(export\s+)?(const|let)\s+\w+\s*=')

echo "]" >> "$tmpfile"
jq '.' "$tmpfile" > .dead-code/dead-di-tokens.json

dead_count=$(jq 'length' .dead-code/dead-di-tokens.json)
echo "Dead DI tokens: $dead_count"

if [ "$dead_count" -gt 0 ]; then
    echo ""
    echo "Dead tokens (no @Implements, @Injectable, addClass, or container.get):"
    jq -r '.[] | "  \(.file):\(.line)  \(.name)" + (if .collection then " (collection)" else "" end)' \
        .dead-code/dead-di-tokens.json
fi

echo ""
echo "Output: .dead-code/dead-di-tokens.json"
