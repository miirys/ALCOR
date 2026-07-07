import { chmodSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import type { Plugin, BuildOptions, PluginBuild } from 'esbuild';
import * as esbuild from 'esbuild';
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin';
import { RG_BINARY_NAME } from '@gitlab-org/workflow-executor/node';

const esmRequire = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

type BuildTarget = 'node' | 'browser';

const wasmEntryPoints = (buildTarget: BuildTarget = 'node') => {
  const targetDir = buildTarget === 'node' ? '.' : buildTarget;
  const files = readdirSync('vendor/grammars').reduce(
    (acc, file) => {
      if (file.endsWith('.wasm')) {
        acc.push({
          in: `vendor/grammars/${file}`,
          out: `vendor/grammars/${file.replace(/\.wasm$/, '')}`,
        });
      }
      return acc;
    },
    [{ in: 'node_modules/web-tree-sitter/tree-sitter.wasm', out: `${targetDir}/tree-sitter` }],
  );

  return files;
};

const pathImportPlugin = {
  name: 'pathImport',
  setup(pluginBuild: esbuild.PluginBuild) {
    pluginBuild.onResolve({ filter: /^path$/ }, () => {
      // For the browser, resolve to the path-browserify module
      const resolvedPath = esmRequire.resolve('path-browserify');
      return {
        path: resolvedPath,
        namespace: 'file',
      };
    });
  },
} satisfies Plugin;

const sentryPlugin = sentryEsbuildPlugin({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: 'gitlab',
  project: 'gitlab-language-server',
  url: 'https://new-sentry.gitlab.net/',
  sourcemaps: {
    disable: process.env.SENTRY_TRACKING_ENABLED !== 'true',
  },
});

const commonBuildOptions = {
  bundle: true,
  loader: { '.wasm': 'copy' },
  logLevel: 'info',
  minify: process.env.NO_MINIFY !== 'true',
  outbase: '.',
  outdir: 'out',
  sourcemap: true,
  define: {
    'process.env.IS_BUNDLED': '"true"',
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: `"${packageJson.version}"`,
  },
} satisfies BuildOptions;

async function build(options: BuildOptions) {
  await esbuild.build({
    ...options,
    ...commonBuildOptions,
    define: {
      ...options.define,
      ...commonBuildOptions.define,
    },
    banner: {
      ...options.banner,
    },
  });
}

const rgCopyPlugin = {
  name: 'rg-copy',
  setup(pluginBuild: PluginBuild) {
    pluginBuild.onResolve({ filter: /\/rg(\.exe)?$/ }, (args) => ({
      path: args.path,
      namespace: 'binary',
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: 'binary' }, (args) => ({
      contents: readFileSync(args.path),
      loader: 'copy',
    }));

    // esbuild's `copy` loader does not preserve file permissions, so the rg
    // binary loses its executable bit. Restore it after the build completes.
    pluginBuild.onEnd(() => {
      const outdir = pluginBuild.initialOptions.outdir ?? 'out';
      const rgOut = join(outdir, RG_BINARY_NAME);
      if (existsSync(rgOut)) {
        chmodSync(rgOut, 0o755);
      }
    });
  },
} satisfies Plugin;

export { wasmEntryPoints, build, pathImportPlugin, sentryPlugin, rgCopyPlugin };
