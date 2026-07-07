import { basename } from 'node:path';
import { rgPath } from '@vscode/ripgrep';
import { build, wasmEntryPoints, rgCopyPlugin, sentryPlugin } from './helpers';

void build({
  entryNames: '[dir]/[name]',
  entryPoints: [
    { in: 'src/node/main.ts', out: 'main-bundle-node' },
    { in: 'src/node/sandbox_worker.ts', out: 'sandbox_worker' },
    { in: rgPath, out: basename(rgPath) },
    ...wasmEntryPoints(),
  ],
  platform: 'node',
  target: 'node18.19',
  plugins: [rgCopyPlugin, sentryPlugin],
  banner: {
    js: "var import_meta_url = require('url').pathToFileURL(__filename).toString();",
  },
  define: {
    'import.meta.url': 'import_meta_url',
  },
});
