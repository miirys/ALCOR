import path from 'node:path';
import { readFileSync } from 'node:fs';
import vue2 from '@vitejs/plugin-vue2';
import tailwindcss from 'tailwindcss';
import checker from 'vite-plugin-checker';
import { syncLoadScriptsPlugin } from './plugins/sync_load_scripts_plugin';
import { tailwindConfig } from './default_tailwind_config';

let svgSpriteContent = '';

const imageToBase64 = (imagePath: string) => {
  const imageBuffer = readFileSync(imagePath);
  return imageBuffer.toString('base64');
};

const HtmlTransformPlugin = {
  name: 'html-transform',
  transformIndexHtml(html: string) {
    return html.replace('{{ svg placeholder }}', svgSpriteContent);
  },
};

const InlineSvgPlugin = {
  name: 'inline-svg',
  transform(code: string, id: string) {
    if (id.endsWith('@gitlab/svgs/dist/icons.svg')) {
      svgSpriteContent = readFileSync(id, 'utf-8');
      return 'export default ""';
    }
    if (id.match(/@gitlab\/svgs\/dist\/illustrations\/.*\.svg$/)) {
      const base64Data = imageToBase64(id);
      return `export default "data:image/svg+xml;base64,${base64Data}"`;
    }
    return code;
  },
};

export function createViteConfigForWebview(name: string) {
  // cwd() is the webview package root, which we assume is always in `./packages/webview_foo`
  const repoRoot = path.resolve(process.cwd(), '../../');
  const outDir = path.resolve(repoRoot, `out/webviews/${name}`);

  return {
    plugins: [
      vue2(),
      checker({
        typescript: {
          root: '.',
          tsconfigPath: './tsconfig.webview.json',
        },
      }),
      InlineSvgPlugin,
      syncLoadScriptsPlugin,
      HtmlTransformPlugin,
    ],
    resolve: {},
    root: './src/app',
    base: `/webview/${name}/`,
    build: {
      target: 'es2022',
      emptyOutDir: true,
      outDir,
      rollupOptions: {
        input: [path.join('src', 'app', 'index.html')],
        output: {
          manualChunks: {
            vue: ['vue'],
            'vue-router': ['vue-router'],
          },
        },
      },
    },
    css: {
      postcss: {
        plugins: [tailwindcss(tailwindConfig)],
      },
      preprocessorOptions: {
        scss: {
          quietDeps: true, // Suppress all scss warnings that originate from dependencies
        },
      },
    },
  };
}
