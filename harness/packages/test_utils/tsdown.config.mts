import { mergeConfig } from 'tsdown';
import shared from '../tsdown.config.mts';

export default mergeConfig(shared, {
  entry: {
    index: 'src/index.ts',
    browser: 'src/index_browser.ts',
  },
  exports: {
    // The "." entry needs a "browser" condition so that bundlers using
    // platform:'browser' (e.g. the browser integration tests' esbuild)
    // resolve to the browser-safe entry instead of the default one which
    // pulls in Node builtins and @jest/globals via MockChildProcess.
    // The condition must come before "default" or it's dead code.
    customExports(pkg) {
      const root = pkg['.'];
      if (typeof root === 'object') {
        const { default: def, ...rest } = root as Record<string, unknown>;
        pkg['.'] = { ...rest, browser: './dist/browser.mjs', default: def };
      }
      return pkg;
    },
  },
});
