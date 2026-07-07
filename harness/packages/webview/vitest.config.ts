import { fileURLToPath } from 'node:url';
import { mergeConfig, defineConfig, configDefaults, ConfigEnv } from 'vitest/config';
import viteConfig from './vite.config';
import vue from '@vitejs/plugin-vue';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import path from 'node:path';
import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

export default defineConfig((configEnv: ConfigEnv) =>
  mergeConfig(
    viteConfig(configEnv),
    defineConfig({
      plugins: [vue()],
      resolve: {
        alias: {
          '@': path.resolve(dirname, './src'),
          'vue-demi': 'vue-demi/lib/v3/index.mjs',
          'vue-router': path.resolve(dirname, 'node_modules/vue-router'),
        },
        conditions: ['_ts-source'],
      },
      optimizeDeps: {
        include: ['vue-router'],
      },
      test: {
        exclude: [...configDefaults.exclude, 'e2e/**'],
        root: fileURLToPath(new URL('./', import.meta.url)),
        projects: [
          {
            extends: true,
            test: {
              name: 'unit',
              include: ['**/*.test.ts'],
              environment: 'jsdom',
            },
          },
          {
            extends: true,
            plugins: [
              // The plugin will run tests for the stories defined in your Storybook config
              // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
              storybookTest({
                configDir: path.join(dirname, '.storybook'),
              }),
            ],
            test: {
              name: 'storybook',
              browser: {
                enabled: true,
                headless: true,
                provider: playwright({}),
                instances: [
                  {
                    browser: 'chromium',
                  },
                ],
              },
              setupFiles: ['.storybook/vitest.setup.ts'],
            },
          },
        ],
      },
    }),
  ),
);
