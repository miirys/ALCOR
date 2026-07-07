import { QueryCapture } from 'web-tree-sitter';

export type ValueOf<T> = T[keyof T];
export type CaptureNameMap = {
  [key: string]: string;
};

export type QueryCaptureWithNames<T extends CaptureNameMap> = QueryCapture & {
  name: ValueOf<T>;
};

// File extensions we want to track for module resolution
export const TRACKED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.vue',
  '.svelte',
  '.mjs',
  '.cjs',
]);

// Extensions that should be stripped for module resolution
// These are the extensions that TypeScript/JavaScript can resolve without explicit extension
export const STRIP_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
