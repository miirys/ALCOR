const isCI = Boolean(process.env.CI);

process.env.FORCE_COLOR = '0';

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
          isolatedModules: true,
        },
      },
    ],
  },
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  setupFilesAfterEnv: ['./src/jest.setup-after-env.ts'],
  globals: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: '1.0.0-test',
    BUNDLER_INJECTED_ENVIRONMENT: 'development',
  },
  moduleNameMapper: {
    '^lodash$': 'lodash-es',
  },
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'require', 'default'],
  },
};
