import { spawn, spawnSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { Command, Option } from 'commander';

const PACKAGE_NAME = '@gitlab-org/gitlab-lsp';

const VALID_EDITORS = ['vscode', 'jetbrains'] as const;
type EditorType = (typeof VALID_EDITORS)[number];

async function main(): Promise<void> {
  const options = new Command()
    .name('turbo-watch')
    .description('Development mode with Turborepo watch and editor integration')
    .addOption(
      new Option('-e, --editor <type>', 'Specify editor type (vscode, jetbrains)')
        .env('LS_EDITOR')
        .choices(['vscode', 'jetbrains']),
    )
    .addOption(
      new Option('--editor-path <path>', 'Path to extension directory').env('LS_EDITOR_PATH'),
    )
    .helpOption('-h, --help', 'Display help')
    .addHelpText(
      'after',
      `
Examples:
  $ bun run watch                                    # build + watch only, no editor copy
  $ bun run watch -- --editor vscode                 # + copy to ../gitlab-vscode-extension
  $ bun run watch -- --editor jetbrains              # + copy to ../gitlab-jetbrains-plugin
  $ bun run watch -- --editor vscode --editor-path ../my-custom-path/vscode-extension

Environment Variables:
  LS_EDITOR       Editor type (overridden by --editor flag)
  LS_EDITOR_PATH  Path to extension directory (overridden by --editor-path flag)
                  Requires --editor / LS_EDITOR to be set.
`,
    )
    .parse()
    .opts();

  const editor = options.editor as EditorType | undefined;

  if (options.editorPath && !editor) {
    console.error('Error: --editor-path requires --editor to be set');
    process.exit(1);
  }

  if (!editor) {
    runTurbo(undefined, undefined);
    return;
  }

  const defaultEditorPaths: Record<EditorType, string> = {
    vscode: '../gitlab-vscode-extension',
    jetbrains: '../gitlab-jetbrains-plugin',
  };

  const editorPath = options.editorPath || defaultEditorPaths[editor];
  const resolvedEditorPath = resolve(editorPath);

  if (!existsSync(resolvedEditorPath) || !statSync(resolvedEditorPath).isDirectory()) {
    console.error(`Error: Editor path does not exist or is not a directory: ${resolvedEditorPath}`);
    console.error(`Set a valid path with --editor-path or LS_EDITOR_PATH`);
    process.exit(1);
  }

  if (!existsSync(resolve(resolvedEditorPath, 'package.json'))) {
    console.error(
      `Error: No package.json found at ${resolvedEditorPath} — does not look like a valid editor repo`,
    );
    console.error(`Set a valid path with --editor-path or LS_EDITOR_PATH`);
    process.exit(1);
  }

  runTurbo(editor, editorPath);
}

/**
 * Print all known yalc installations of the LSP package for transparency.
 * Helps users spot unexpected links (e.g. other worktrees, stale installations).
 */
function showYalcInstallations() {
  const result = spawnSync('npx', ['yalc', 'installations', 'show', PACKAGE_NAME], {
    encoding: 'utf-8',
  });
  const output = (result.stdout || '').trim();
  if (output) {
    console.log(`yalc: ${output}\n`);
  }
}

function runTurbo(editor: EditorType | undefined, editorPath: string | undefined) {
  const turboArgs = editor
    ? ['watch', '//#tb:sync-assets-to-ide', '--continue=dependencies-successful']
    : ['watch', '//#tb:api-extract', '--continue=dependencies-successful'];

  const editorLine = editor
    ? `📁 Editor path: ${editorPath}`
    : `📁 No editor specified, build will not be synced anywhere`;

  console.log(`
🚀 Starting Turborepo watch${editor ? ` for ${editor} development` : ''}
${editorLine}
📦 Running: turbo ${turboArgs.join(' ')}
   (Press Ctrl+C to stop)

`);

  if (editor === 'vscode') {
    showYalcInstallations();
  }

  const turboProcess = spawn('turbo', turboArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(editor ? { LS_EDITOR: editor } : {}),
      ...(editorPath ? { LS_EDITOR_PATH: editorPath } : {}),
      TURBO_TELEMETRY_DISABLED: '1',
    },
    cwd: process.cwd(),
  });

  const cleanup = () => {
    console.log('\n🛑 Stopping Turborepo watch...');
    if (turboProcess && !turboProcess.killed) {
      turboProcess.kill('SIGTERM');
    }
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  turboProcess.on('close', (code, signal) => {
    if (signal) {
      console.log(`\nTurborepo watch stopped by signal: ${signal}`);
    } else if (code !== 0) {
      console.error(`\nTurborepo watch exited with code: ${code}`);
      process.exit(code);
    } else {
      console.log('\nTurborepo watch completed');
    }
  });

  turboProcess.on('error', (error) => {
    console.error('Failed to start Turborepo watch:', error.message);
    console.error('\nMake sure you have run "bun install" in your repository.');
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(`Unhandled error from turbo-watch.ts: "${error.message}"`, error);
  process.exit(1);
});
