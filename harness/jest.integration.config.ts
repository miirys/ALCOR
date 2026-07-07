import type { Config } from 'jest';

const isCI = Boolean(process.env.CI);

const config: Config = {
  verbose: isCI,
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'node-addons'],
  },
  testMatch: ['<rootDir>/src/tests/int/**/*.test.[jt]s?(x)'],
  modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
  testPathIgnorePatterns: ['/node_modules/', '/out/', '/tmp/'],
  collectCoverage: false,
  testTimeout: 15000,
  maxWorkers: 1,
  reporters: [['default', { summaryThreshold: 0 }]],
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
  globals: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: '1.0.0-test',
    BUNDLER_INJECTED_ENVIRONMENT: 'development',
  },
};

export default config;
