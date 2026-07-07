import type { Config } from 'jest';

const isCI = Boolean(process.env.CI);

const config: Config = {
  verbose: isCI,
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'node-addons'],
  },
  testMatch: [
    '<rootDir>/src/browser/**/*.test.[jt]s',
    '<rootDir>/src/common/**/*.test.[jt]s',
    '<rootDir>/src/node/**/*.test.[jt]s',
    '<rootDir>/src/tests/unit/**/*.test.[jt]s',
    '<rootDir>/packages/**/*.test.[jt]s',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/out/',
    '/lib_webview_agentic_chat/',
    '/packages/cli',
    '/packages/webview/',
    '/webview_duo_workflow_panel/',
    '/webview_duo_chat_classic/',
    '/webview_agentic_tabs/',
  ],
  transform: {
    '^.+\\.(ts|tsx|js|jsx|mjs)$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  transformIgnorePatterns: [],
  moduleNameMapper: {
    '^@dagrejs/dagre$': '<rootDir>/node_modules/@dagrejs/dagre/dist/dagre.cjs.js',
    '^@dagrejs/graphlib$': '<rootDir>/node_modules/@dagrejs/graphlib/dist/graphlib.cjs.js',
  },
  clearMocks: true,
  collectCoverage: isCI,
  ...(isCI && {
    collectCoverageFrom: [
      '<rootDir>/src/**/*.[jt]s',
      '<rootDir>/packages/**/src/**/*.[jt]s',
      '!<rootDir>/**/*.test.[jt]s',
      '!<rootDir>/**/*.d.ts',
      '!**/node_modules/**',
      '!<rootDir>/src/tests/fixtures/**/*',
    ],
    coverageReporters: ['cobertura'],
    coverageDirectory: './reports',
  }),
  reporters: [
    'default',
    ...(isCI
      ? [
          [
            'jest-junit',
            {
              outputDirectory: 'reports',
              outputName: 'unit.xml',
              titleTemplate: '{title}',
              classNameTemplate: '{classname}',
            },
          ] as [string, Record<string, string>],
        ]
      : []),
  ],
  globals: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: '1.0.0-test',
    BUNDLER_INJECTED_ENVIRONMENT: 'development',
  },
};

export default config;
