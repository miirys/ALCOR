const transformIgnoreNodeModules = ['graphql-request', 'confbox', 'lodash-es'];

module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    customExportConditions: ['_ts-source', 'node', 'require', 'default'],
  },
  rootDir: '../../',
  modulePathIgnorePatterns: ['<rootDir>/.bun-cache'],
  testMatch: [
    '<rootDir>/packages/lib_webview_agentic_chat/src/plugin/**/*.test.[jt]s',
    '<rootDir>/packages/lib_webview_agentic_chat/src/common/**/*.test.[jt]s',
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
  transformIgnorePatterns: [`node_modules/(?!(${transformIgnoreNodeModules.join('|')}))`],
};
