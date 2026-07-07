import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignore: [
    // Vendor files (third-party, not our code)
    '**/vendor/**',
    // Scripts are standalone entry points run by CI, package.json, or developers — not imported
    'scripts/**',
    'packages/*/scripts/**',
    // Test fixtures are loaded by path at runtime (e.g. readFileSync, fork()), not imported
    'src/tests/fixtures/**',
    // Test example data files, loaded by path
    '**/test_examples/**',
    // Ambient type declarations referenced by tsconfig "include", not imported
    '**/*.d.ts',
  ],
  vitest: {
    config: ['vitest.config.ts'],
  },
  workspaces: {
    // --- Language server workspaces ---
    'src/node': {
      entry: ['main.ts', 'sandbox_worker.ts'],
    },
    'src/browser': {
      entry: ['main.ts'],
    },

    // --- Webview packages with Vite ---
    // Entry points declared explicitly because knip can't load vite.config.ts
    // (shared config package @gitlab-org/vite-common-config may not be built)
    'packages/webview': {
      entry: ['src/main.ts'],
    },
    'packages/webview_agentic_tabs': {
      entry: ['src/app/index.ts', 'src/index.ts'],
    },
    'packages/lib_webview_agentic_chat': {
      entry: ['src/app/index.ts', 'src/index.ts'],
    },
    'packages/webview_duo_chat_classic': {
      entry: ['src/app/main.ts', 'src/index.ts'],
    },
    'packages/webview_theming': {
      entry: ['src/app/main.ts', 'src/index.ts'],
    },
    'packages/webview_vuln_details': {
      entry: ['src/app/main.ts', 'src/index.ts'],
    },

    // --- CLI ---
    'packages/cli': {
      entry: ['src/index.tsx', 'src/sandbox_worker.ts'],
    },
  },
};

export default config;
