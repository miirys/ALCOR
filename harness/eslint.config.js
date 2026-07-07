const gitlabPlugin = require('@gitlab/eslint-plugin/eslint9');

module.exports = [
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      '.bun-cache/**',
      'out/**',
      '**/dist/**',
      '*.json',
      '*.md',
      'src/tests/fixtures/**/*',
      // FIXME: Build/tool config files are not included in tsconfig.json project service
      '**/vite.config.ts',
      '**/vite.config.shared.ts',
      '**/vitest.config.ts',
      '**/vitest.setup.ts',
      '**/tsdown.config.mts',
      'knip.config.ts',

      // Bun bundler entry point — excluded from tsconfig, not type-checked by tsc
      'packages/cli/src/sandbox_worker.ts',
      '**/scripts/**',

      'config/**',
      'docs/**',
      'reports/**',

      // Embedded pool bridge: vendored JS (formerly duo-bridge-v0.8.4.3),
      // preserved verbatim with Node-ESM conventions (explicit .js extensions)
      // that intentionally differ from the repo's bundler-oriented lint.
      'packages/lib_pool_bridge/**',
      'src/tests/**',
      'jest.*.config.ts',
      'eslint.config.js',

      // Network E2E spike files (throwaway dev artifacts) and standalone subprocess
      'packages/cli/test/e2e/network/spikes/**',
      'packages/cli/test/e2e/network/helpers/interceptor_proc.mjs',
    ],
  },
  // Include all GitLab TypeScript configurations
  ...gitlabPlugin.configs.typescript,
  {
    files: ['**/*.mjs'],
    rules: {
      'import/no-dynamic-require': 'off',
      'import/extensions': ['error', 'ignorePackages', { mjs: 'always' }],
    },
  },
  // Use the TypeScript import resolver for JS files in packages so that
  // workspace package `exports` resolve correctly (via the '_ts-source' condition).
  {
    files: ['packages/**/*.js'],
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          conditionNames: ['_ts-source', 'types', 'import', 'require', 'node', 'default'],
        },
      },
    },
  },
  // override basic rules
  {
    rules: {
      // the following rules are clashing with prettier
      'implicit-arrow-linebreak': 'off',
      'object-curly-newline': 'off',
      'max-len': 'off',
      'function-paren-newline': 'off',
      'space-before-function-paren': 'off',
      'operator-linebreak': 'off',
      curly: 'off',
      indent: 'off',
    },
  },
  // Override configurations for TypeScript files
  {
    files: ['src/**/*.ts', 'packages/**/*.ts', 'packages/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: null,
        tsconfigRootDir: null,
        projectService: true,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          conditionNames: ['_ts-source', 'types', 'import', 'require', 'node', 'default'],
        },
      },
    },
    rules: {
      // Override/add specific rules
      'no-spaced-func': 'off',
      'func-call-spacing': 'off',
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
        },
      ],
      '@typescript-eslint/parameter-properties': ['error', { prefer: 'class-property' }],
      '@typescript-eslint/prefer-as-const': 'error',
      '@typescript-eslint/no-invalid-void-type': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      // Enum-specific rules to avoid unusual scenarios
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/prefer-literal-enum-member': 'error',
      '@typescript-eslint/prefer-enum-initializers': 'error',
      '@typescript-eslint/no-mixed-enums': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      // Enforce PascalCase enum keys with CAPITAL_CASE string values
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'enumMember',
          format: ['PascalCase'],
        },
      ],
      // '@typescript-eslint/no-use-before-define': 'error',
      'import/extensions': 'error',
      'import/no-default-export': 'warn',
      'import/no-extraneous-dependencies': 'off',
      // eslint-import-resolver-typescript cannot resolve @modelcontextprotocol/sdk subpath
      // exports (e.g. /client/auth.js) with SDK >=1.26 because the wildcard export entry
      // now includes a "types" condition that the resolver mishandles. TypeScript itself
      // resolves these correctly (typescript-compiles CI job passes), so we suppress the
      // false-positive here.
      'import/no-unresolved': ['error', { ignore: ['^@modelcontextprotocol/sdk/'] }],
    },
  },
  // Allow PascalCase for TSX files (React components)
  {
    files: ['packages/tui/**/*.tsx'],
    rules: {
      'unicorn/filename-case': ['error', { cases: { snakeCase: true, pascalCase: true } }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXOpeningElement[name.name="Static"]',
          message:
            'Use of <Static> is restricted to ChatInterface.tsx to ensure single Static element in app.',
        },
      ],
    },
  },
  // NodeJS globals exception for node folder
  {
    files: ['src/node/**/*.ts'],
    languageOptions: {
      globals: {
        NodeJS: 'readonly',
      },
    },
  },
  // Test files
  {
    files: ['**/*.test.ts', '**/test_examples/**/*'],
    ignores: ['packages/webview/**'],
    rules: {
      'import/no-extraneous-dependencies': 'off',
      'func-names': 'off',
      'no-empty-function': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'CallExpression[callee.name=/(before|after)(Each|All)/] CallExpression[callee.property.name=/clearAllMocks|mockClear/]',
          message:
            "It's usually not necessary to clear mocks between tests, as Jest is configured to do so automatically.",
        },
      ],
    },
  },
  // Vue webview package configuration
  ...(() => {
    const pluginVue = require('eslint-plugin-vue');
    const pluginVitest = require('@vitest/eslint-plugin');
    const vueParser = require('vue-eslint-parser');
    const tsParser = require('@typescript-eslint/parser');

    return [
      // Vue files
      {
        files: ['packages/webview/**/*.vue'],
        languageOptions: {
          parser: vueParser,
          parserOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        plugins: {
          vue: pluginVue,
        },
        processor: pluginVue.processors['.vue'],
        settings: {
          'import/resolver': {
            typescript: {
              alwaysTryTypes: true,
              conditionNames: ['_ts-source', 'types', 'import', 'require', 'node', 'default'],
            },
          },
        },
        rules: {
          ...pluginVue.configs['flat/essential'].rules,
          ...pluginVue.configs['flat/strongly-recommended'].rules,
          ...pluginVue.configs['flat/recommended'].rules,
          // False positives on TS type annotations in <script setup lang="ts">.
          // Mirrors the override applied to .ts/.tsx files above.
          'no-spaced-func': 'off',
          'func-call-spacing': 'off',
          // Disable multi-word component name rule - PascalCase is sufficient
          'vue/multi-word-component-names': 'off',
          // Allow PascalCase for Vue component files
          'unicorn/filename-case': ['error', { cases: { pascalCase: true, camelCase: true } }],
          // Disable import resolution checks for Vue path aliases (vite handles these)
          'import/no-unresolved': [
            'error',
            {
              ignore: ['^@/', '^\\.'],
            },
          ],
          // Disable extensions check for webview (Vite handles resolution)
          'import/extensions': 'off',
          // Allow default exports in Vue files
          'import/no-default-export': 'off',
          // Relax import order for Vue files
          'import/order': 'warn',
        },
      },
      // Vue TypeScript files
      {
        files: ['packages/webview/**/*.{ts,mts,tsx}'],
        languageOptions: {
          parser: tsParser,
          parserOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
          },
        },
        settings: {
          'import/resolver': {
            typescript: {
              alwaysTryTypes: true,
              conditionNames: ['_ts-source', 'types', 'import', 'require', 'node', 'default'],
            },
          },
        },
        rules: {
          // Allow default exports in Vue files (common pattern)
          'import/no-default-export': 'off',
          // Allow PascalCase for Vue component files
          'unicorn/filename-case': ['error', { cases: { pascalCase: true, camelCase: true } }],
          // Disable import resolution checks for Vue path aliases (vite handles these)
          'import/no-unresolved': [
            'error',
            {
              ignore: ['^@/', '^\\.'],
            },
          ],
          // Disable extensions check for webview (Vite handles resolution)
          'import/extensions': 'off',
          // Relax import order for Vue files
          'import/order': 'warn',
        },
      },
      // Vitest test files in webview
      {
        files: ['packages/webview/**/*.test.ts', 'packages/webview/**/*.test.tsx'],
        plugins: {
          vitest: pluginVitest,
        },
        rules: {
          ...pluginVitest.configs.recommended.rules,
        },
      },
      // Skip formatting checks for webview (handled by Prettier)
      {
        files: ['packages/webview/**/*.{ts,mts,tsx,vue}'],
        rules: {
          'prettier/prettier': 'off',
        },
      },
    ];
  })(),
];
