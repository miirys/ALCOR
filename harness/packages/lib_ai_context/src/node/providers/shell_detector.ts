import * as fs from 'fs';
import { execSync } from 'node:child_process';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { isFileSchemeUri, workspaceFolderPathFromUri } from '@gitlab-org/fs';
import { type ShellInfo } from './shell';
import { extractUnixShellName } from './shell_utils';

export class ShellDetector {
  #logger: Logger;

  #configService: ConfigService;

  constructor(logger: Logger, configService: ConfigService) {
    this.#logger = withPrefix(logger, '[ShellDetector]');
    this.#configService = configService;
  }

  detectSystemShell(): ShellInfo | null {
    try {
      return this.#detectSystemShellInternal();
    } catch (error) {
      this.#logger.warn('Could not detect shell information', error);
      return null;
    }
  }

  #detectSystemShellInternal(): ShellInfo | null {
    const environment = this.detectEnvironment();
    const isSSH = this.isSSHSession();
    const cwd = this.getWorkspacePath() || undefined;

    if (environment === 'wsl') {
      return {
        ...this.#detectWSLShell(isSSH),
        cwd,
        detectionMethod: 'system-fallback',
      };
    }

    if (environment === 'git-bash' || environment === 'mingw') {
      return {
        shellName: 'bash',
        shellType: 'hybrid',
        shellVariant: 'Git Bash',
        shellEnvironment: environment,
        sshSession: isSSH,
        cwd,
        detectionMethod: 'system-fallback',
      };
    }

    if (environment === 'cygwin') {
      return {
        ...this.#detectCygwinShell(isSSH),
        cwd,
        detectionMethod: 'system-fallback',
      };
    }

    const { platform } = process;
    if (platform === 'win32') {
      const shell = this.detectWindowsSystemShell();
      if (shell) {
        return {
          ...shell,
          shellEnvironment: 'native',
          sshSession: isSSH,
          cwd,
          detectionMethod: 'system-fallback',
        };
      }
    } else if (
      platform === 'linux' ||
      platform === 'darwin' ||
      platform === 'freebsd' ||
      platform === 'openbsd'
    ) {
      const shell = this.detectUnixSystemShell();
      if (shell) {
        return {
          ...shell,
          shellEnvironment: environment || 'native',
          sshSession: isSSH,
          cwd,
          detectionMethod: 'system-fallback',
        };
      }
    }

    return null;
  }

  detectWindowsSystemShell(): Omit<ShellInfo, 'shellEnvironment' | 'sshSession'> | null {
    try {
      try {
        execSync('Get-Host', { stdio: 'pipe', windowsHide: true });
        const isPowerShellCore = Boolean(process.env.POWERSHELL_DISTRIBUTION_CHANNEL);
        return {
          shellName: 'powershell',
          shellType: 'windows',
          shellVariant: isPowerShellCore ? 'PowerShell Core' : 'Windows PowerShell',
        };
      } catch {
        const comSpec = process.env.ComSpec;
        if (comSpec?.toLowerCase().includes('cmd.exe')) {
          return {
            shellName: 'cmd',
            shellType: 'windows',
            shellVariant: 'Command Prompt',
          };
        }

        if (!comSpec) {
          return {
            shellName: 'cmd',
            shellType: 'windows',
            shellVariant: 'Command Prompt',
          };
        }

        return null;
      }
    } catch (error) {
      this.#logger.error('Error detecting Windows shell', error);
      return null;
    }
  }

  detectUnixSystemShell(): Omit<ShellInfo, 'shellEnvironment' | 'sshSession'> | null {
    const { ppid } = process;
    if (ppid) {
      try {
        const parentCmd = execSync(`ps -p ${ppid} -o comm=`, {
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();

        const shellName = extractUnixShellName(parentCmd);
        if (shellName) {
          return {
            shellName,
            shellType: 'unix',
          };
        }
      } catch {
        /* failed to detect with the first approach */
      }
    }

    const shellEnv = process.env.SHELL;
    if (shellEnv) {
      const shellName = extractUnixShellName(shellEnv);
      if (shellName) {
        return {
          shellName,
          shellType: 'unix',
        };
      }
    }

    return {
      shellName: 'sh',
      shellType: 'unix',
      shellVariant: 'POSIX shell',
    };
  }

  detectEnvironment(): ShellInfo['shellEnvironment'] | null {
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
      return 'wsl';
    }

    if (process.env.CYGWIN || this.#isCygwin()) {
      return 'cygwin';
    }

    if (process.env.MINGW_PREFIX || process.env.MSYSTEM) {
      return 'mingw';
    }

    if (process.platform === 'win32' && process.env.SHELL?.includes('bash')) {
      return 'git-bash';
    }

    if (this.#isDocker()) {
      return 'docker';
    }

    return null;
  }

  isSSHSession(): boolean {
    return Boolean(process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION);
  }

  /**
   * Gets the workspace path from the config service, falling back to process.cwd().
   *
   * This is necessary because Node.js SEA (Single Executable Application) binaries
   * don't respect the working directory set by the parent process (e.g., via
   * Java's ProcessBuilder.directory()). The workspaceFolders are sent during
   * LSP initialization and provide the correct workspace path.
   */
  getWorkspacePath(): string {
    const workspaceFolders = this.#configService.get('workspaceFolders');

    if (workspaceFolders && workspaceFolders.length > 0) {
      const firstFolder = workspaceFolders[0];
      if (isFileSchemeUri(firstFolder.uri)) {
        try {
          return workspaceFolderPathFromUri(firstFolder.uri);
        } catch (error) {
          this.#logger.warn(
            'Failed to parse workspace folder URI, falling back to cwd config',
            error,
          );
        }
      }
    }

    const configCwd = this.#configService.get('cwd');
    if (configCwd) {
      return configCwd;
    }

    try {
      return process.cwd();
    } catch (error) {
      this.#logger.error('Could not get current working directory', error);
      return '/';
    }
  }

  #detectWSLShell(isSSH: boolean): ShellInfo {
    return {
      ...(this.detectUnixSystemShell() ?? { shellName: 'bash' }),
      shellType: 'hybrid',
      shellEnvironment: 'wsl',
      shellVariant: `WSL ${process.env.WSL_DISTRO_NAME || 'Unknown'}`,
      sshSession: isSSH,
    };
  }

  #detectCygwinShell(isSSH: boolean): ShellInfo {
    const shellEnv = process.env.SHELL;
    const shellName = shellEnv ? extractUnixShellName(shellEnv) : null;

    return {
      shellName: shellName || 'bash',
      shellType: 'hybrid',
      shellVariant: 'Cygwin',
      shellEnvironment: 'cygwin',
      sshSession: isSSH,
    };
  }

  #isDocker(): boolean {
    try {
      if (fs.existsSync('/.dockerenv')) {
        return true;
      }
    } catch {
      // ignore error and try cgroup
    }

    try {
      const cgroup = fs.readFileSync('/proc/self/cgroup', 'utf8');
      return cgroup.includes('docker');
    } catch {
      return false;
    }
  }

  #isCygwin(): boolean {
    try {
      return fs.existsSync('/cygdrive') || fs.existsSync('/proc/cygdrive');
    } catch {
      return false;
    }
  }
}
