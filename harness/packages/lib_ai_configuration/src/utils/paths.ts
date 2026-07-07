import { homedir } from 'node:os';
import * as path from 'path';

/**
 * Gets the base directory for Duo configuration files based on the platform.
 * - Windows: %APPDATA%\GitLab\duo
 * - macOS/Linux: $XDG_CONFIG_HOME/gitlab/duo or ~/.gitlab/duo
 *
 * @returns The path to the Duo configuration directory or undefined if required environment variables are missing
 */
export function getDuoConfigDir(): string | undefined {
  const { platform } = process;

  if (platform === 'win32') {
    // Windows: Use AppData
    const appData = process.env.APPDATA;
    if (!appData) {
      return undefined;
    }
    return path.join(appData, 'GitLab', 'duo');
  }

  // macOS or Linux
  // First try XDG_CONFIG_HOME
  const xdgConfigHome = process.env.XDG_CONFIG_HOME;

  // If XDG_CONFIG_HOME is defined, respect it regardless of where it points.
  // See: https://specifications.freedesktop.org/basedir/latest/
  if (xdgConfigHome && xdgConfigHome.trim() !== '') {
    return path.join(xdgConfigHome, 'gitlab', 'duo');
  }

  // Fallback to ~/.gitlab/duo/
  // homedir() falls back to the passwd entry when $HOME is unset (containers).
  try {
    return path.join(homedir(), '.gitlab', 'duo');
  } catch {
    return undefined;
  }
}

/**
 * Gets the full path to a specific configuration file in the Duo directory
 *
 * @param filename The name of the configuration file
 * @returns The full path to the configuration file or undefined if the Duo directory couldn't be determined
 */
export function getDuoConfigFilePath(filename: string): string | undefined {
  const duoDir = getDuoConfigDir();
  if (!duoDir) {
    return undefined;
  }

  return path.join(duoDir, filename);
}

// The user-level agent skills directory, ~/.agents.
export function getGlobalAgentsDir(): string | undefined {
  try {
    return path.join(homedir(), '.agents');
  } catch {
    // homedir() can throw if $HOME is unset and no passwd entry exists.
    return undefined;
  }
}

// Directories outside the repo that the CLI already trusts for skill discovery and config loading.
export function getTrustedReadableDirectories(): string[] {
  return [getGlobalAgentsDir(), process.env.GLAB_CONFIG_DIR || getDuoConfigDir()].filter(
    (dir): dir is string => dir !== undefined,
  );
}

// Whether `p` resolves to a location inside any of `dirs`.
export function isContainedIn(dirs: string[], p: string): boolean {
  return dirs.some((dir) => {
    const rel = path.relative(dir, p);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  });
}
