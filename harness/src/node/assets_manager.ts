import { dirname, join } from 'node:path';

type AppEnvironmentType = 'not-bundled' | 'bundled';

let directory: string;

// Resolve the directory that contains bundled assets (tree-sitter WASM,
// grammars, webviews) at runtime.
//
// process.env.BUNDLE_ENVIRONMENT is inlined at build time, so the inactive
// branch is dropped by the minifier — this acts as a conditional compile.
//
//   - 'bun'    : `bun build --compile` produces a single executable. ESM
//                modules inside the binary report `import.meta.url` as a
//                virtual path (`file:///$bunfs/root/...`), which is NOT a
//                real on-disk location. The actual binary path — and the
//                directory where sidecar assets are shipped — is
//                `process.execPath`.
//   - default  : esbuild CJS bundle (Node SEA / npm `bin`). Use __dirname.
if (process.env.BUNDLE_ENVIRONMENT === 'bun') {
  directory = dirname(process.execPath);
} else {
  directory = __dirname;
}

const getAppEnvironmentType = (): AppEnvironmentType => {
  if (process.env.IS_BUNDLED === 'true') {
    return 'bundled';
  }
  return 'not-bundled';
};

export const getAssetsRootPath = () => {
  if (getAppEnvironmentType() === 'bundled') {
    return directory;
  }
  return join(directory, '../../');
};
