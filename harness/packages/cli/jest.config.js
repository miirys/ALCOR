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
          isolatedModules: true,
        },
      },
    ],
  },
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/', '/test/e2e/'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: '1.0.0-test',
    BUNDLER_INJECTED_ENVIRONMENT: 'development',
    BUNDLER_INJECTED_DISTRIBUTION: 'npm',
  },
  moduleNameMapper: {
    '^lodash$': 'lodash-es',
    '^@dagrejs/dagre$': '<rootDir>/../../node_modules/@dagrejs/dagre/dist/dagre.cjs.js',
    '^@dagrejs/graphlib$': '<rootDir>/../../node_modules/@dagrejs/graphlib/dist/graphlib.cjs.js',
  },
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'require', 'default'],
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
};
