const isCI = Boolean(process.env.CI);

// eslint-disable-next-line import/no-default-export
export default {
  verbose: isCI,
  preset: 'ts-jest/presets/default-esm',
  transform: {
    '^.+\\.m?tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          moduleDetection: 'auto',
        },
      },
    ],
  },
  testEnvironment: '<rootDir>/test/e2e/cli_log_environment.ts',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: [
    '<rootDir>/test/e2e/jest_matchers.ts',
    '<rootDir>/test/e2e/jest_retry_setup.cjs',
  ],
  // No moduleNameMapper: mockttp (dep of network/ tests) requires real
  // lodash via CJS; remapping '^lodash$' to 'lodash-es' breaks it.
  // E2E tests don't transitively import code that needs lodash-es remapping.
  globals: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: '1.0.0-test',
    BUNDLER_INJECTED_ENVIRONMENT: 'development',
    BUNDLER_INJECTED_DISTRIBUTION: 'npm',
  },
  testTimeout: 30000, // 30 seconds
  maxWorkers: 1, // Sequential execution to avoid resource conflicts
};
