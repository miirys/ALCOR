const transformIgnoreNodeModules = [
  '@gitlab/ui',
  '@gitlab/duo-ui',
  '@gitlab/svgs',
  'bootstrap-vue',
  'vscode-languageserver',
  'graphql-request',
  'gridstack',
  'lodash-es',
];
const path = require('path');

const piniaPath = path.resolve(__dirname, 'node_modules/pinia');
const moduleNameMapper = {
  '\\.(svg|gif|png|mp4)(\\?\\w+)?$': '<rootDir>/src/tests/mocks/file_mock.js',
  '\\.css$': '<rootDir>/src/tests/mocks/file_mock.js',
  '^pinia$': piniaPath,
};

module.exports = {
  displayName: 'lib_webview_agentic_chat',
  rootDir: '../../',
  modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
  moduleFileExtensions: ['ts', 'js', 'json', 'vue'],
  moduleNameMapper,
  preset: 'ts-jest',
  testMatch: ['<rootDir>/packages/lib_webview_agentic_chat/src/app/**/*.test.[jt]s'],
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
  setupFilesAfterEnv: ['<rootDir>/packages/lib_webview_agentic_chat/jest.env.js'],
};
