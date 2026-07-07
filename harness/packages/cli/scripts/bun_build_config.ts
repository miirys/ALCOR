import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

export const config = {
  entrypoints: ['./src/index.tsx', './src/sandbox_worker.ts'],
  outdir: './dist',
  banner: '#!/usr/bin/env node',
  sourcemap: 'linked',
  target: 'node',
  define: {
    BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION: `"${packageJson.version}"`,
    BUNDLER_INJECTED_ENVIRONMENT: "'production'",
    BUNDLER_INJECTED_DISTRIBUTION: "'npm'",
  },
  minify: true,
};
