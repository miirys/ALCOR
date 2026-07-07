/* eslint-disable no-console */
// no console warning is disabled, as this function communicates with the user via console and we don't want to use default logger here
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, type ChildProcess } from 'child_process';
import { ok, err, Result } from 'neverthrow';
import { getCliLogDir } from './utils';

const LOG_RETENTION_DAYS = 28;

export interface LogFileInfo {
  path: string;
  mtime: Date;
}

export function getLogFilesWithStats(): Result<LogFileInfo[], string> {
  const logDir = getCliLogDir();

  if (!fs.existsSync(logDir)) {
    return err(`Log directory does not exist: ${logDir}`);
  }

  let files;
  try {
    files = fs.readdirSync(logDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return err(`Failed to read log directory: ${message}`);
  }

  if (files.length === 0) {
    return ok([]);
  }

  // Get file stats and sort by modification time (newest first)
  const filesWithStats = files
    .map((file) => {
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        mtime: stats.mtime,
      };
    })
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return ok(filesWithStats);
}

function getLogFilesOrExit(): LogFileInfo[] {
  const result = getLogFilesWithStats();
  if (result.isErr()) {
    console.error(result.error);
    process.exit(1);
  }
  return result.value;
}

function findLastLogFile() {
  const filesWithStats = getLogFilesOrExit();

  if (filesWithStats.length === 0) {
    console.error('No log files found in:', path.join(os.tmpdir(), 'gitlab-duo-cli'));
    process.exit(1);
  }

  return filesWithStats[0].path;
}

function openInEditor(filePath: string) {
  const explicitEditor = process.env.EDITOR;
  const isWindows = process.platform === 'win32';

  let command: string;
  let args: string[];
  // On Windows, `spawn` needs the shell to resolve PATH extensions (e.g.
  // notepad.exe) when launching a user-configured editor by name.
  let useShell = false;
  // Bypass Node's argument quoting so the raw `start "" <path>` arguments are
  // passed verbatim to cmd.exe (see Windows branch below).
  let windowsVerbatimArguments = false;

  if (explicitEditor) {
    command = explicitEditor;
    useShell = isWindows;
    args = useShell ? [`"${filePath}"`] : [filePath];
  } else if (isWindows) {
    // No editor configured: open the log with its default associated app.
    // Invoke `start` via `cmd.exe /c` with `shell: false` so the path is not
    // re-parsed by an outer shell. The path is wrapped in double quotes (which
    // cmd.exe treats literally) to guard against spaces and special characters
    // such as `%`, `&`, `^`, and `!` that can appear in a Windows temp path.
    command = 'cmd.exe';
    // The empty "" is the window-title argument `start` expects first.
    args = ['/c', 'start', '""', `"${filePath}"`];
    windowsVerbatimArguments = true;
  } else {
    command = 'vi';
    args = [filePath];
  }

  console.log(`Opening ${filePath} in ${command}...`);

  const editorProcess = spawn(command, args, {
    shell: useShell,
    windowsVerbatimArguments,
    stdio: 'inherit',
  });

  editorProcess.on('error', (error) => {
    console.error('Failed to start editor:', error.message);
    process.exit(1);
  });

  editorProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Editor exited with code ${code}`);
      process.exit(code);
    }
  });
}

function listAllLogFiles() {
  const filesWithStats = getLogFilesOrExit();
  const logDir = getCliLogDir();

  if (filesWithStats.length === 0) {
    console.log('No log files found in:', logDir);
    return;
  }

  filesWithStats.forEach((file) => {
    console.log(file.path);
  });
}

export const openLastLogFile = () => {
  const lastLogFile = findLastLogFile();
  openInEditor(lastLogFile);
};

export const listLogFiles = () => {
  listAllLogFiles();
};

export const tailLastLogFile = (tailArgs: string[] = []) => {
  const lastLogFile = findLastLogFile();
  const isWindows = process.platform === 'win32';

  let childProcess: ChildProcess;

  if (isWindows) {
    const psArgs = ['-Command', 'Get-Content', '-Path', lastLogFile];
    if (tailArgs.length > 0) {
      psArgs.push(...tailArgs);
    } else {
      psArgs.push('-Tail', '10');
    }
    childProcess = spawn('powershell', psArgs, { stdio: 'inherit' });
  } else {
    const finalArgs = tailArgs.length > 0 ? [...tailArgs, lastLogFile] : [lastLogFile];
    childProcess = spawn('tail', finalArgs, { stdio: 'inherit' });
  }

  childProcess.on('error', (error) => {
    console.error('Process failed:', error.message);
    process.exit(1);
  });
  childProcess.on('close', (code) => process.exit(code || 0));
};

function clearAllLogFiles() {
  const files = getLogFilesOrExit();

  if (files.length === 0) {
    console.log('No log files found to clear.');
    return;
  }

  let deletedCount = 0;
  let failedCount = 0;

  for (const file of files) {
    const filePath = file.path;
    try {
      // It's sync operations, but it should be ok since it's the only thing this command does
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`Deleted: ${filePath}`);
    } catch (error) {
      failedCount++;
      if (error instanceof Error) {
        console.error(`Failed to delete ${filePath}:`, error.message);
      }
    }
  }

  if (deletedCount > 0) {
    console.log(`Successfully deleted ${deletedCount} log file(s).`);
  }
  if (failedCount > 0) {
    console.error(`Failed to delete ${failedCount} file(s).`);
    process.exit(1);
  }
}

export const clearLogFiles = () => {
  clearAllLogFiles();
};

export function pruneOldLogFiles(): void {
  const result = getLogFilesWithStats();
  if (result.isErr()) {
    return;
  }

  const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const file of result.value) {
    if (file.mtime.getTime() < cutoffTime) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        // Silently ignore - don't block CLI startup for cleanup failures
      }
    }
  }
}
