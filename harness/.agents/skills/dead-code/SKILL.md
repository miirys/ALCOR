---
name: dead-code
description: Find and validate dead code (unused files, exports, types, dependencies, DI tokens). Covers running analysis scripts, interpreting results, and deciding what to remove.
---

# Dead Code Analysis

## Overview

Dead code analysis uses [knip](https://knip.dev) as the primary scanner, configured via `knip.config.ts` at the repo root. The config declares entry points that knip can't auto-discover (esbuild build targets, Vite webview apps whose shared config can't be loaded, CLI entries) and ignores files that are standalone entry points (scripts, test fixtures, `.d.ts` ambient types). Post-knip scripts handle project-specific filtering (DI decorators, Vue template usage, SCSS imports, Vite HTML entry detection) and validation (rg-based reference counting). The LLM's role is interpreting ambiguous results and making removal decisions.

## Full Process

The process has two phases: automated scanning, then LLM review. **Both are mandatory.**

### Phase 1: Run the automated pipeline

```bash
SKILL=.agents/skills/dead-code/scripts

$SKILL/run-knip.sh                  # Step 1: Run knip → .dead-code/knip-categorized.json
$SKILL/filter-false-positives.sh    # Step 2: Remove known FPs → .dead-code/filtered.json
$SKILL/validate-files.sh            # Step 3: Validate files → .dead-code/validated-files.json
$SKILL/validate-exports.sh          # Step 4: Validate exports/types → .dead-code/validated-{exports,types}.json
$SKILL/find-dead-di-tokens.sh       # Step 5: Find dead DI tokens → .dead-code/dead-di-tokens.json
$SKILL/generate-report.sh           # Step 6: Generate summary → .dead-code/report.md
```

Steps 3-5 are independent and can run in parallel. The whole pipeline takes ~5 minutes.
All output goes to `.dead-code/` (gitignored).

### Phase 2: LLM review (mandatory — do not skip)

The scripts produce findings with statuses: DEAD, TEST_ONLY, RE_EXPORTED_DEAD, and USED. The DEAD items are high-confidence but the pipeline has blind spots. After the scripts finish, you **must** perform these review steps:

#### Step 7: Review USED files for real false positives

Read `.dead-code/validated-files.json` and look at items with `"status": "USED"`. Many are correct (the script found an importer), but check:

- Is the "evidence" importer itself dead? (transitive death)
- Is it a config file (`vitest.config.ts`, `vite.config.ts`) that tools load, not code?

```bash
# Check items the script marked as USED:
jq '.[] | select(.status == "USED")' .dead-code/validated-files.json

# For each suspicious one, manually verify:
rg "the_module_name" . --type ts -g '!node_modules' | head -10
```

Note: Scripts (`scripts/`, `packages/*/scripts/`), test fixtures (`src/tests/fixtures/`, `**/test_examples/`), and `.d.ts` ambient declarations are already excluded by `knip.config.ts` and won't appear here.

#### Step 7b: Verify scripts are actually referenced

Scripts are excluded from knip because they're standalone entry points, not imported modules. But some may become orphaned over time. Check that each script file is referenced somewhere:

```bash
# List all script files:
fd -t f . scripts/ packages/*/scripts/ -E node_modules -e ts -e js -e mjs -e cjs -e sh -e mts

# For each script, check if it's referenced in CI, package.json, docs, or other scripts:
for script in $(fd -t f . scripts/ packages/*/scripts/ -E node_modules -e ts -e js -e mjs -e cjs -e sh -e mts); do
  name=$(basename "$script")
  refs=$(rg -c "$name" .gitlab-ci.yml .gitlab/ci/*.yml package.json packages/*/package.json docs/ scripts/ packages/*/scripts/ 2>/dev/null | grep -v ':0$' | wc -l)
  if [ "$refs" -eq 0 ]; then
    echo "UNREFERENCED: $script"
  fi
done
```

Unreferenced scripts may be dead. Verify manually before removing — they could be documented in READMEs, skill files, or run ad-hoc by developers.

#### Step 8: Review dead DI tokens against factory registration

The DI script only checks `@Implements`, `@Injectable`, `dependencies:`, `collection()`, `addClass()`, and `getRequiredService()`. It misses:

- `createFactoryDescriptor({ aliases: [Token], ... })` — factory-based registration
- `createInstanceDescriptor({ instance: ..., aliases: [Token] })` — pre-built instances

```bash
# For each dead DI token, check di.ts files:
jq -r '.[].name' .dead-code/dead-di-tokens.json | while read token; do
  echo "--- $token ---"
  rg "$token" . --type ts -g '!node_modules' -g '*di*' </dev/null 2>/dev/null
done
```

Tokens found in `di.ts` factory/instance descriptors are NOT dead — remove them from the findings.

#### Step 9: Check non-private package exports

Exports from packages with `"private": false` may be consumed by the VS Code extension or other downstream repos. The non-private packages are: `cli`, `lib_rpc_client`, `lib_rpc`, `lib_schema`, `webview_theming`.

```bash
# Find DEAD exports from non-private packages:
jq -r '.[] | select(.status == "DEAD") | .file' .dead-code/validated-exports.json \
  | grep -E 'lib_rpc_client|lib_rpc/|lib_schema|webview_theming' | sort -u
```

If any are found, search the VS Code extension repo before marking for removal.

#### Step 10: Produce final findings

After review, update or annotate the findings. Present the final list to the user, grouped by:

1. **Safe to remove** — confirmed dead, no caveats
1. **Needs verification** — dead but in non-private package or has DI factory edge case
1. **Not dead** — reclassified during review

If the user wants removal, proceed incrementally: remove a batch, run `bun run compile`, fix any breaks.

---

## Understanding Results

### Status classifications

| Status             | Meaning                                                                        | Action                                                                     |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `DEAD`             | No references outside defining file                                            | Safe to remove `export` keyword, or delete entire file if the file is dead |
| `TEST_ONLY`        | Only referenced in test files                                                  | Review — might be test utility (keep) or abandoned test code (remove)      |
| `RE_EXPORTED_DEAD` | Re-exported by a barrel `index.ts` but no consumer imports it from that barrel | Remove the re-export line from the barrel                                  |
| `USED`             | Found real usage                                                               | False positive — scripts mark it but defer to LLM judgment                 |

### What knip.config.ts handles

- **esbuild/bun build entry points**: `src/node/main.ts`, `src/node/sandbox_worker.ts`, `src/browser/main.ts`
- **Vite webview apps**: Declared explicitly per workspace (knip can't load the shared vite config)
- **CLI entries**: `src/index.tsx`, `src/sandbox_worker.ts`
- **Vendor files**: `**/vendor/**` ignored
- **Scripts**: `scripts/**` and `packages/*/scripts/**` ignored (standalone entry points run by CI/package.JSON/developers)
- **Test fixtures**: `src/tests/fixtures/**` and `**/test_examples/**` ignored (loaded by path at runtime)
- **Ambient type declarations**: `**/*.d.ts` ignored (referenced by tsconfig `include`, not imported)

### What the filter script catches (knip can't do)

- **Vue template usage**: Components used in `.vue` templates
- **SCSS imports**: Stylesheets imported by Vue/TS in same directory
- **Vite HTML entries**: Files referenced from `index.html`
- **DI tokens**: Symbols used via `@Implements`, `@Injectable`, `dependencies:`, `collection()`, `addClass()`, `getRequiredService()`, `aliases:`, `implements` (pre-computed set, O(1) lookup)

### What still needs LLM review

- **DI collection tokens**: `createCollectionId` tokens consumed via `@Injectable(Token, [collection(CollectionToken)])` where the collection is in the same file — the script sees this as a self-reference
- **String-based references**: RPC method names, dynamic imports via string literals
- **Cross-repo usage**: Non-private packages (`lib_rpc_client`, `lib_rpc`, `lib_schema`, `webview_theming`) may be imported by the VS Code extension
- **Type-only dead code**: Types with `DEAD` status may still be intentionally exported as public API
- **Transitive death**: File A imported only by file B, where B is also dead — A shows as USED
- **Knip-ignored scripts**: Scripts are excluded from knip scanning. Periodically verify that all files in `scripts/` and `packages/*/scripts/` are actually referenced from `.gitlab-ci.yml`, `package.json` scripts, or documentation (see Step 7b)

## Script Details

### `run-knip.sh`

Runs `bunx knip --reporter json` (using `knip.config.ts`), filters out test/spec files, and categorizes results into unused files, exports, types, deps, and devDeps.

### `filter-false-positives.sh`

Removes project-specific false positives that knip can't detect:

- Files: Vite HTML entries, Vue template usage, SCSS imports
- Exports/Types: DI tokens used via decorators/registration

Uses a pre-computed set of all DI-referenced symbols (~10 rg calls upfront) for O(1) per-symbol lookup.

### `validate-exports.sh`

For each unused export/type, runs `rg` to count references across the codebase. Checks TS files, Vue files, and JS files. Classifies as DEAD, TEST_ONLY, RE_EXPORTED_DEAD, or USED.

**Slow** (~3-5 min for 200+ items) because it runs `rg` per symbol. Could be parallelized.

### `validate-files.sh`

For each unused file, searches for `from ... '<module>'` imports across TS/Vue files. Uses path-based matching (last 2 path segments) to avoid false matches on common basenames like `types`, `index`, `utils`. Uses directory name for `index.ts` barrels.

### `find-dead-di-tokens.sh`

Finds all `createInterfaceId`, `brandedId`, and `createCollectionId` definitions, then checks if each token has consumers via `@Implements`, `@Injectable`, `dependencies:`, `collection()`, `addClass()`, `getRequiredService()`, `aliases:`, or `implements`.

### `generate-report.sh`

Merges all validated findings into a Markdown report at `.dead-code/report.md`.

## Removing Dead Code

After validation, removal should be done incrementally.

### Pre-removal: Check non-code references

**Before deleting any file**, check that it isn't referenced in skills, docs, configs, CI, or other non-TS/Vue places that knip and the validation scripts don't scan. The automated pipeline only checks TS/Vue imports — it misses references in:

- **Skill files** (`.agents/skills/*/SKILL.md`, references/)
- **Markdown docs** (`docs/`, `README.md`, `AGENTS.md`)
- **CI configs** (`.gitlab-ci.yml`, `.gitlab/ci/*.yml`)
- **ESLint/other tool configs** (`eslint.config.js`, etc.)
- **Shell scripts** that reference files by path

```bash
# For each dead file, search for its basename (without extension) across non-code files:
jq -r '.[] | select(.status == "DEAD") | .file' .dead-code/validated-files.json | while read f; do
  stem=$(basename "${f%.*}")
  results=$(rg -l "$stem" . -g '!node_modules' -g '!.dead-code' -g '!*.map' -g '!.turbo' \
    -t md -t yaml --glob '*.yml' --glob '*.sh' --glob 'SKILL.md' --glob 'AGENTS.md' \
    --glob 'eslint.config.*' --glob '.gitlab-ci.yml' --hidden 2>/dev/null)
  if [ -n "$results" ]; then
    echo "=== $f (stem: $stem) ==="
    echo "$results"
    echo
  fi
done
```

Files found here may be used by agent skills, documentation, or tooling configs. Verify each match manually — some may be stale references (e.g. an eslint ignore glob for a file that's genuinely dead), but others (like skill files that import/reference test utilities) are real usage.

### Removal steps

1. **Dead files**: Delete the file, then run `bun run compile` to verify nothing breaks.
1. **Dead exports**: Remove the `export` keyword (keep the symbol if used internally).
1. **Dead barrel re-exports**: Remove the re-export line from the barrel `index.ts`.
1. **Dead DI tokens**: More complex — the interface + const + implementations may all need removal together.

Always verify with `bun run compile` after each batch of removals.

## Optional: Find Production Code Kept Alive Only by Tests

The standard pipeline marks items as `TEST_ONLY` when only test files import them, but knip still considers them "used" because tests are part of the project. This optional process finds production code that would be dead in a production-only build by temporarily removing all tests, re-running knip, and diffing the results.

**Prerequisites**: Clean Git state. Work on a throwaway branch — the process mass-deletes and restores files.

### Step 1: Delete all test files

```bash
fd -e ts -e tsx -e js -e mjs -e cjs --exclude node_modules -E vendor . \
  | grep -E '\.(test|spec)\.(ts|tsx|js|mjs)$' | xargs rm
rm -rf packages/cli/test/ src/tests/
```

Verify `bun run compile` still passes. Fix any errors (e.g. production files importing from test files) by deleting the offending imports.

### Step 2: Run knip on the test-free codebase

```bash
bunx knip --reporter json > .dead-code/knip-no-tests-raw.json
```

Categorize into files, exports, types (same structure as `knip-categorized.json`).

### Step 3: Filter test helpers

Exclude files that are clearly test infrastructure — they're expected to be unused without tests:

- `**/test_utils/**`, `**/test_helpers/**`, `**/test/**`
- `**/mocks/**`, `**/__mocks__/**`
- `**/mock_data.*`, `**/mock_*.*`, `**/*_mock.*`
- `**/fixtures/**`
- `**/jest.*`, `**/*.setup.*`
- `*.test_utils.*`

### Step 4: Cross-reference with normal knip results

Load `.dead-code/knip-categorized.json` from the standard pipeline. The interesting findings are:

```text
test_only_dead = (knip_no_tests results) − (knip_normal results) − (test helpers)
```

These are production items knip considers used normally (because tests import them) but dead without tests.

### Step 5: Restore tests and remove candidates

```bash
git checkout -- '*.test.*' packages/cli/test/ src/tests/
```

Then remove the candidate dead code:

- Delete dead files
- Remove `export` keyword from dead exports/types (keep the symbol if used internally)
- For re-export lines (`export { A, B } from './mod'`), remove only the dead symbols; if all symbols are dead, delete the line

**Watch for re-export syntax**: removing `export` from `export type { X } from './mod'` leaves invalid `type { X } from './mod'` — delete the entire line instead.

### Step 6: Compile and triage

Run `bun run compile`. All errors will be in test files. For each:

- **Test can't import removed export**: The export existed solely for test access. Restore the `export` keyword with a TODO comment:

  ```typescript
  // TODO: test-only export — remove after fixing tests to not import internals
  ```

- **"declared but never read" in production file**: The symbol was only "used" via `export`. Restore `export` with the same TODO.

Iterate `compile → restore with TODO → compile` until clean.

### Output

- Uncommitted changes removing all safely-removable dead code
- `// TODO: test-only export` comments marking exports that need test cleanup before removal
- `.dead-code/test-only-production.json` with categorized candidates

### Lessons learned

- Many exports exist as test backdoors — functions/types exported solely so tests can import them directly. These are the bulk of findings.
- The first package to fail compilation blocks discovery of errors in dependent packages. After restoring exports for one package, re-compile to find more.
- Barrel `index.ts` files with combined re-exports (`export { A, B } from './mod'`) need surgical editing — remove only the dead symbol from the export list, not the whole line.
