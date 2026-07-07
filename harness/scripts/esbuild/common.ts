import { nodeExternalsPlugin } from 'esbuild-node-externals';
import { build, sentryPlugin } from './helpers';

void build({
  entryNames: '[dir]/[name]',
  entryPoints: [{ in: 'src/common/index.ts', out: 'common/index' }],
  platform: 'node',
  target: 'node18.19',
  plugins: [
    // This plugin ensures that dependencies from `node_modules` are not bundled
    // in the common folder package, as they will be installed in the client project.
    nodeExternalsPlugin({
      // Include any workspace dependency denoted by the `workspace:` version prefix in the bundle.
      allowWorkspaces: true,
      // Bundle ajv and ajv-draft-04 directly to avoid resolution failures in
      // consuming projects where npm may nest these under
      // node_modules/@gitlab-org/gitlab-lsp/node_modules/ instead of hoisting them.
      allowList: ['ajv-draft-04', 'ajv'],
    }),
    sentryPlugin,
  ],
});
