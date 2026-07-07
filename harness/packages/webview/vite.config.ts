import { createRequire } from 'node:module';
import path from 'node:path';

import { ConfigEnv, defineConfig, type Plugin, type UserConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import vueJsx from '@vitejs/plugin-vue-jsx';

const require = createRequire(import.meta.url);
const resolvePackageDir = (pkg: string) => path.dirname(require.resolve(`${pkg}/package.json`));

const isStorybook = process.env.npm_lifecycle_script?.includes('storybook');

const LS_HTTP_PORT = 3007;
const LS_HTTP_TARGET = `http://127.0.0.1:${LS_HTTP_PORT}`;

/**
 * Dev-only Vite plugin that ensures the initial webview navigation includes a CSRF token.
 *
 * For HTML document requests under the webview base path, we fetch a token from the language
 * server dev endpoint and redirect to the same URL with `_csrf` appended as a query param.
 * This keeps the existing Socket.IO client behavior (reading `_csrf` from location.search)
 * working without modifying application code or injecting scripts.
 */
function csrfDevTokenPlugin(): Plugin {
  return {
    name: 'csrf-dev-token',
    configureServer(server) {
      let cachedToken: string | null = null;
      let cachedAt = 0;

      server.middlewares.use(async (req, res, next) => {
        try {
          if (!req.url) return next();

          const url = new URL(req.url, `http://${req.headers.host}`);
          const accept = req.headers.accept ?? '';
          const isDocument = accept.includes('text/html');

          if (!isDocument) return next();
          if (!url.pathname.startsWith('/webview/root/')) return next();
          if (url.searchParams.has('_csrf')) return next();
          if (url.pathname.startsWith('/@') || url.pathname.startsWith('/__vite')) return next();

          const now = Date.now();
          if (!cachedToken || now - cachedAt > 60_000) {
            const resp = await fetch(`${LS_HTTP_TARGET}/api/dev/csrf-token`);
            if (!resp.ok) throw new Error(`token endpoint: ${resp.status}`);
            const { token } = (await resp.json()) as { token: string };
            cachedToken = token;
            cachedAt = now;
          }

          url.searchParams.set('_csrf', cachedToken);
          res.statusCode = 302;
          res.setHeader('Location', url.pathname + url.search);
          res.end();
        } catch {
          // LS not running / endpoint failing — allow normal dev behavior
          next();
        }
      });
    },
  };
}

// https://vite.dev/config/
export default async ({ mode }: ConfigEnv) =>
  defineConfig({
    plugins: [
      tailwindcss(),
      vue(),
      vueJsx(),
      // Only load devtools in development (dynamic import to avoid module resolution issues)
      // Check if it's storybook to avoid crashing due to incompatibility between storybook and vue devtools (https://github.com/vuejs/devtools/issues/703)
      ...(mode === 'development' && !isStorybook
        ? [(await import('vite-plugin-vue-devtools')).default(), csrfDevTokenPlugin()]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        vue: resolvePackageDir('vue'),
        // vue-demi's postinstall switches lib/index to v2 or v3 based on the
        // detected Vue version.  With bun's hoisted layout a single copy of
        // vue-demi is shared across all workspaces and may be configured for
        // Vue 2.  Point directly at the Vue 3 variant so the webview build
        // always gets the right one.
        'vue-demi': path.join(resolvePackageDir('vue-demi'), 'lib', 'v3'),
      },
      dedupe: ['vue', 'vue-demi', '@vue/runtime-core', '@vue/runtime-dom', '@vue/shared'],
    },
    build: {
      outDir: path.resolve(__dirname, '../../out/webviews/root'),
      emptyOutDir: true,
      target: 'es2022',
    },
    base: '/webview/root/',
    server: {
      proxy: {
        '/socket.io': {
          target: LS_HTTP_TARGET,
          ws: true,
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.removeHeader('origin');
            });
          },
        },
      },
    },
  }) as UserConfig;
