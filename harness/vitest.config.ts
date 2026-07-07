import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/src/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'build'],
    workspace: [
      {
        extends: 'packages/webview/vitest.config.ts',
        test: {
          environment: 'jsdom',
        },
      },
    ],
  },
});
