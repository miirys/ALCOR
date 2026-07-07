---
name: workspace-packages
description: Building workspace packages with tsdown. Covers shared config, per-package overrides, entry points, multi-platform splits, and the exports lifecycle. Guidance for creating new workspace packages.
---

# Workspace package build system

Workspace packages are built with **tsdown** (rolldown-based bundler). Each package emits ESM to `./dist/`. Builds are orchestrated by Turborepo (`mise exec -- bun run compile` / `mise exec -- bun run build`) which handles dependency ordering and caching.

## Shared config

All packages inherit from `packages/tsdown.config.mts`. Single-entry packages need zero config - tsdown auto-discovers `src/index.ts` via config walk-up.

```text
packages/
  tsdown.config.mts          ← shared config
  lib_foo/
    src/index.ts             ← auto-discovered, no local config needed
    package.json             ← "build": "tsdown"
```

## Adding a local config (multi-entry packages)

Create a local `tsdown.config.mts` when you need multiple entry points or format overrides.

```ts
// packages/lib_foo/tsdown.config.mts
import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    node: 'src/node/index.ts',
  },
});
```

The local config is discovered first (before walk-up), so it takes full effect. `mergeConfig` inherits all shared settings.

### When to use multiple entrypoints in packages

Separate entries produce separate bundles with separate `exports` in `package.json`. E.g.:

| Scenario                   | Entry name   | Example                             |
| -------------------------- | ------------ | ----------------------------------- |
| Node-specific code         | `node`       | `node: 'src/node/index.ts'`         |
| Browser-specific code      | `browser`    | `browser: 'src/browser.ts'`         |
| Webview flow split         | `flow`       | `flow: 'src/webview/flow/index.ts'` |
| Webview plugin split       | `webview`    | `webview: 'src/webview/index.ts'`   |
| Test utilities / mock data | `test_utils` | `test_utils: 'src/test_utils.ts'`   |

**Do NOT create entries for:**

- Individual services, types, or helpers - re-export from the main `src/index.ts` barrel
- Anything with a single consumer - barrel re-export is simpler

**Test utilities MUST be separate entries** - never re-export them from the main barrel, or test/mock code will be bundled into production.
**Node.js specific code** - MUST NOT be included in common/browser bundles.

## Exports lifecycle

On each build, `tsdown` auto-generates the `exports` and `publishConfig.exports` fields in `package.json`. These are committed to Git.

Generated exports have two conditions per entry:

- `_ts-source` - points at the raw `.ts` source (used by TypeScript / ESLint / TS Language Server (IDEs) via `customConditions` in tsconfig.JSON: so linting/type-checking works without built `dist/` artifacts)
- `default` - points at `./dist/*.mjs`

A `publishConfig.exports` block is also generated, containing only the `default` paths (excludes `_ts-source`).

- Do NOT manually edit `exports` or `publishConfig` in `package.json` for tsdown-built packages
- After adding/removing entries, rebuild to regenerate the exports map
- TypeScript resolves `.d.mts` declarations alongside the `.mjs` via `moduleResolution: "bundler"`

## Key files

- `packages/tsdown.config.mts` - shared config
- `packages/lib_fetch/tsdown.config.mts` - node split example
- `packages/lib_workflow_api/tsdown.config.mts` - node + test_utils split example
