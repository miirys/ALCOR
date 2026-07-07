const transformIgnoreNodeModules = [
  '@gitlab/ui',
  '@gitlab/duo-ui',
  '@gitlab/svgs',
  'bootstrap-vue',
  'vscode-languageserver',
  'graphql-request',
  'lodash-es',
];

const moduleNameMapper = {
  '\\.(svg|gif|png|mp4)(\\?\\w+)?$': '<rootDir>/src/tests/mocks/file_mock.js',
  '\\.css$': '<rootDir>/src/tests/mocks/file_mock.js',
};

module.exports = {
  displayName: 'webview_agentic_tabs',
  rootDir: '../../',
  modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
  moduleFileExtensions: ['ts', 'js', 'json', 'vue'],
  moduleNameMapper,
  preset: 'ts-jest',
  testMatch: ['<rootDir>/packages/webview_agentic_tabs/src/app/**/*.test.[jt]s'],
  transform: {
    '^.+\\.(ts|tsx)?$': ['ts-jest', { diagnostics: false }],
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
    '^.+\\.vue$': '@vue/vue2-jest',
  },
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'require', 'default'],
  },
  transformIgnorePatterns: [`node_modules/(?!(${transformIgnoreNodeModules.join('|')}))`],
  setupFilesAfterEnv: ['<rootDir>/packages/webview_agentic_tabs/jest.env.js'],
};
