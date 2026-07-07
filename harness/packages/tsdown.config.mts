import babel from '@rollup/plugin-babel';
import { defineConfig } from 'tsdown';

// OXC does not support lowering TC39 standard decorators (see oxc-project/oxc#9170).
// Rolldown emits raw `@Decorator` syntax in the output, which older consumers
// (e.g. vite 3 / rollup 2) cannot parse. We use @rollup/plugin-babel to lower them.
const lowerDecorators = babel({
  presets: ['@babel/preset-typescript'],
  plugins: [['@babel/plugin-proposal-decorators', { version: '2023-11' }]],
  babelHelpers: 'inline',
  extensions: ['.ts', '.mts', '.cts'],
});

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: {
    sourcemap: true,
  },
  // Adds a "_ts-source" condition to each package's exports pointing at the .ts source.
  // TypeScript and ESLint resolve via this condition (see tsconfig customConditions),
  // so linting/type-checking works without built dist/ artifacts.
  exports: {
    devExports: '_ts-source',
  },
  deps: {
    skipNodeModulesBundle: true,
  },
  plugins: [lowerDecorators],
});
