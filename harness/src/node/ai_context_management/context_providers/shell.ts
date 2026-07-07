import { Injectable, collection } from '@gitlab/needle';
import { AIContextItem, SystemContextProvider } from '@gitlab-org/ai-context';
import {
  ShellDetector,
  ShellInfo,
  buildShellContextItems,
  extractUnixShellName,
} from '@gitlab-org/ai-context/node';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import {
  RunCommandError,
  RunCommandSuccess,
  WorkflowCommandService,
} from '@gitlab-org/workflow-executor';
import { BareService, createFallbackService } from '@gitlab-org/core';

export type { ShellInfo } from '@gitlab-org/ai-context/node';

const timeout = (ms: number): Promise<never> =>
  new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Command timed out')), ms);
  });

@Injectable(SystemContextProvider, [Logger, ConfigService, collection(WorkflowCommandService)])
export class DefaultShellContextProvider implements SystemContextProvider {
  #logger: Logger;

  #detector: ShellDetector;

  #commandService: BareService<WorkflowCommandService>;

  /** In-flight calculation promise - non-null only while a calculation is running */
  #inflightItems: Promise<AIContextItem[]> | null = null;

  /** Last resolved result - set after precalculate completes, cleared on next precalculate */
  #resolvedItems: AIContextItem[] | null = null;

  constructor(
    logger: Logger,
    configService: ConfigService,
    commandServices: WorkflowCommandService[],
  ) {
    this.#logger = withPrefix(logger, '[ShellContextProvider]');
    this.#detector = new ShellDetector(logger, configService);
    this.#commandService = createFallbackService(this.#logger, commandServices);
  }

  async precalculate(): Promise<void> {
    await this.precalculateOnWorkflowStart();
  }

  /**
   * Recalculates and caches shell context items on workflow start.
   * Skips recalculation if one is already in flight, reusing the existing promise.
   */
  async precalculateOnWorkflowStart(): Promise<void> {
    if (this.#inflightItems) {
      this.#logger.info('Shell context calculation already in flight, reusing');
      await this.#inflightItems;
      return;
    }

    this.#resolvedItems = null;
    this.#inflightItems = this.#calculateItems();

    try {
      this.#resolvedItems = await this.#inflightItems;
      this.#logger.info('Shell context precalculated and cached');
    } catch (error) {
      this.#logger.error('Failed to precalculate shell context', error);
    } finally {
      this.#inflightItems = null;
    }
  }

  async getItems(): Promise<AIContextItem[]> {
    if (this.#inflightItems) {
      return this.#inflightItems;
    }
    if (this.#resolvedItems) {
      return this.#resolvedItems;
    }
    this.#resolvedItems = await this.#calculateItems();
    return this.#resolvedItems;
  }

  async #calculateItems(): Promise<AIContextItem[]> {
    try {
      // First try to detect the IDE terminal shell
      const ideShellStartMs = Date.now();
      const ideShellInfo = await this.#detectIDETerminalShell();
      this.#logger.info(`IDE terminal shell detection took ${Date.now() - ideShellStartMs}ms`);

      if (ideShellInfo) {
        return buildShellContextItems(ideShellInfo);
      }

      // Fall back to system detection
      const shellInfo = this.#detector.detectSystemShell();
      if (!shellInfo) {
        this.#logger.info('No shell information detected');
        return [];
      }
      return buildShellContextItems(shellInfo);
    } catch (error) {
      this.#logger.warn('Could not detect shell information', error);
      return [];
    }
  }

  async #detectIDETerminalShell(): Promise<ShellInfo | null> {
    try {
      const workflowIdForShellDetection = 'shell-detection';
      const workspacePath = this.#detector.getWorkspacePath();
      const isWindows = process.platform === 'win32';

      if (isWindows) {
        return await this.#detectWindowsIDEShell(workflowIdForShellDetection, workspacePath);
      }
      return await this.#detectUnixIDEShell(workflowIdForShellDetection, workspacePath);
    } catch (error) {
      this.#logger.error('Error detecting IDE terminal shell', error);
      return null;
    }
  }

  async #detectWindowsIDEShell(
    workflowId: string,
    workspacePath: string,
  ): Promise<ShellInfo | null> {
    // First, try PowerShell
    try {
      const psResult = await this.#runCommandWithTimeout(workflowId, workspacePath, 'powershell', [
        '-NoProfile',
        '-Command',
        'echo "PSVersion:$($PSVersionTable.PSVersion) PSEdition:$($PSVersionTable.PSEdition)"',
      ]);

      if (!('error' in psResult) && psResult.output?.includes('PSVersion:')) {
        const shellInfo = this.#extractWindowsShellName(psResult.output);
        if (shellInfo) {
          return {
            ...shellInfo,
            shellEnvironment: this.#detector.detectEnvironment() || 'native',
            sshSession: this.#detector.isSSHSession(),
            detectionMethod: 'ide-terminal',
            cwd: workspacePath,
          };
        }
      }
    } catch {
      this.#logger.debug('PowerShell detection failed, trying CMD');
    }

    try {
      const cmdResult = await this.#runCommandWithTimeout(workflowId, workspacePath, 'cmd', [
        '/c',
        'echo %COMSPEC%',
      ]);

      if (!('error' in cmdResult) && cmdResult.output) {
        const shellInfo = this.#extractWindowsShellName(cmdResult.output);
        if (shellInfo) {
          return {
            ...shellInfo,
            shellEnvironment: this.#detector.detectEnvironment() || 'native',
            sshSession: this.#detector.isSSHSession(),
            detectionMethod: 'ide-terminal',
            cwd: workspacePath,
          };
        }
      }
    } catch {
      this.#logger.debug('CMD detection also failed');
    }

    return null;
  }

  async #detectUnixIDEShell(workflowId: string, workspacePath: string): Promise<ShellInfo | null> {
    const psStartMs = Date.now();
    const result = await this.#runCommandWithTimeout(workflowId, workspacePath, 'ps', [
      '-p',
      '$$',
      '-o',
      'comm=',
    ]);
    this.#logger.info(`ps command took ${Date.now() - psStartMs}ms`);

    if ('error' in result) {
      this.#logger.debug('IDE terminal detection failed, will use system fallback');
      return null;
    }

    const output = result.output?.trim();
    if (!output) {
      return null;
    }

    const shellName = extractUnixShellName(output);
    if (!shellName) {
      return null;
    }

    // Detect environment (WSL, Docker, SSH, etc.)
    const envStartMs = Date.now();
    const envResult = await this.#runCommandWithTimeout(
      'shell-env-detection',
      workspacePath,
      'sh',
      [
        '-c',
        // eslint-disable-next-line no-template-curly-in-string
        'echo "WSL=${WSL_DISTRO_NAME:-false}" && echo "SSH=$( [ -n "$SSH_CLIENT" ] || [ -n "$SSH_TTY" ] || [ -n "$SSH_CONNECTION" ] && echo true || echo false )" && echo "DOCKER=$( [ -f /.dockerenv ] && echo true || echo false )" && echo "CYGWIN=${CYGWIN:-false}" && echo "MINGW=${MINGW_PREFIX:-${MSYSTEM:-false}}"',
      ],
    );

    this.#logger.info(`env detection command took ${Date.now() - envStartMs}ms`);

    if ('error' in envResult) {
      this.#logger.debug('Environment detection failed, using defaults');
      return {
        shellName,
        shellType: 'unix',
        shellEnvironment: 'native',
        sshSession: false,
        detectionMethod: 'ide-terminal',
        cwd: workspacePath,
      };
    }

    const { environment, sshSession } = this.#extractUnixEnvironment(envResult.output);

    return {
      shellName,
      shellType: environment === 'wsl' || environment === 'git-bash' ? 'hybrid' : 'unix',
      shellEnvironment: environment,
      sshSession,
      detectionMethod: 'ide-terminal',
      cwd: workspacePath,
    };
  }

  #extractWindowsShellName(
    output: string,
  ): Omit<ShellInfo, 'shellEnvironment' | 'sshSession' | 'detectionMethod' | 'cwd'> | null {
    if (output.includes('PSVersion') || output.includes('Major')) {
      return {
        shellName: 'powershell',
        shellType: 'windows',
        shellVariant: output.includes('Core') ? 'PowerShell Core' : 'Windows PowerShell',
      };
    }

    // Check for cmd.exe
    if (output.toLowerCase().includes('cmd.exe')) {
      return {
        shellName: 'cmd',
        shellType: 'windows',
        shellVariant: 'Command Prompt',
      };
    }

    return null;
  }

  #extractUnixEnvironment(output: string | undefined): {
    environment: ShellInfo['shellEnvironment'];
    sshSession: boolean;
  } {
    if (!output) {
      return { environment: 'native', sshSession: false };
    }

    let environment: ShellInfo['shellEnvironment'] = 'native';

    /**
     * Uses simple string matching instead of line parsing to avoid issues with ANSI escape codes
     * mixed in terminal output (e.g., \u001b[7m%\u001b[0m).
     */
    if (output.includes('WSL=') && !output.includes('WSL=false')) {
      environment = 'wsl';
    } else if (output.includes('DOCKER=true')) {
      environment = 'docker';
    } else if (output.includes('CYGWIN=') && !output.includes('CYGWIN=false')) {
      environment = 'cygwin';
    } else if (output.includes('MINGW=') && !output.includes('MINGW=false')) {
      environment = 'mingw';
    }

    const sshSession = output.includes('SSH=true');

    this.#logger.debug(
      `Determined environment:, ${JSON.stringify({ environment, sshSession, output }, null, 2)}`,
    );

    return { environment, sshSession };
  }

  async #runCommandWithTimeout(
    workflowId: string,
    workspacePath: string,
    command: string,
    args: string[],
  ): Promise<RunCommandSuccess | RunCommandError> {
    try {
      return await Promise.race([
        this.#commandService.runCommand(workflowId, workspacePath, command, true, args),
        timeout(10000),
      ]);
    } catch {
      return { error: 'Command timeout' };
    }
  }
}
