module.exports = () => {
  const transformIgnoreNodeModules = [
    '@gitlab/ui',
    '@gitlab/svgs',
    '@gitlab/duo-ui',
    'bootstrap-vue',
    'vscode-languageserver',
    'lodash-es',
  ];
  const moduleNameMapper = {
    '\\.(svg|gif|png|mp4)(\\?\\w+)?$': '<rootDir>/src/tests/mocks/file_mock.js',
    '\\.css$': '<rootDir>/src/tests/mocks/file_mock.js',
  };

  return {
    rootDir: '../../',
    modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
    testMatch: ['<rootDir>/packages/webview_duo_chat_classic/src/app/**/*.test.[jt]s'],
    moduleFileExtensions: ['js', 'ts', 'vue'],
    preset: 'ts-jest',
    transform: {
      '^.+\\.(ts|tsx)?$': ['ts-jest', { diagnostics: false }],
      '^.+\\.(js|jsx|mjs)$': 'babel-jest',
      '^.+\\.vue$': '@vue/vue2-jest',
    },
    transformIgnorePatterns: [`node_modules/(?!(${transformIgnoreNodeModules.join('|')}))`],
    testEnvironment: 'jsdom',
    testEnvironmentOptions: {
      customExportConditions: ['_ts-source', 'node', 'require', 'default'],
    },
    moduleNameMapper,
    setupFilesAfterEnv: ['<rootDir>/packages/webview_duo_chat_classic/jest.env.js'],
  };
};
