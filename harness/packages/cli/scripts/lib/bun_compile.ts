import { spawn } from 'node:child_process';
import type { BunTarget } from './build_targets';

export type BuildTarget = BunTarget | 'bun';

export interface BunBuildOptions {
  sourceFile: string;
  // For specific platform targets, this is the --outfile path of the compiled
  // binary. For the generic "bun" target, this is the --outdir path for the
  // plain JS bundle with external source maps.
  output: string;
  target: BuildTarget;
  version: string;
  environment: 'production' | 'development';
}

// Core bun build invocation shared between binary compilation and source map
// generation. The --define flags are defined once here; callers must not
// duplicate them.
//
// When target is a specific platform (e.g. bun-linux-x64) the output is a
// compiled binary (--compile, --sourcemap=inline, --outfile).
// When target is the generic "bun" the output is a plain JS bundle with
// external source maps (--sourcemap=external, --outdir), used for Sentry uploads.
export async function runBunBuild(opts: BunBuildOptions): Promise<void> {
  const { sourceFile, output, target, version, environment } = opts;

  const args: string[] = [
    'build',
    sourceFile,
    '--minify',
    `--target=${target}`,
    '--define',
    `BUNDLER_INJECTED_GITLAB_LANGUAGE_SERVER_VERSION="${version}"`,
    '--define',
    `BUNDLER_INJECTED_ENVIRONMENT="${environment}"`,
    '--define',
    `BUNDLER_INJECTED_DISTRIBUTION="binary"`,
  ];

  if (target !== 'bun') {
    args.push(
      '--compile',
      '--no-compile-autoload-dotenv',
      '--no-compile-autoload-bunfig',
      '--compile-exec-argv=--use-system-ca',
      '--sourcemap=inline',
      '--outfile',
      output,
    );
  } else {
    args.push('--sourcemap=external', '--outdir', output);
  }

  await runSubprocess('bun', args);
}

// Runs a command with inherited stdio and resolves on exit-0, rejects otherwise.
// Kept here because every consumer of runBunBuild also wants the same behavior.
export function runSubprocess(
  command: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: options.env ?? process.env,
      cwd: options.cwd,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? signal}`));
    });
  });
}
