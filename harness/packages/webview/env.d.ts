/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_REAL_BACKEND?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<{}, {}, null>;
  export default component;
}
