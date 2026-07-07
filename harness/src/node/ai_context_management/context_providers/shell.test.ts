import { execSync } from 'node:child_process';
import * as fs from 'fs';
import { TestLogger } from '@gitlab-org/logging';
import { AIContextItem } from '@gitlab-org/ai-context';
import { RunCommandSuccess, WorkflowCommandService } from '@gitlab-org/workflow-executor';
import { createFakePartial } from '@gitlab-org/test-utils';
import { deepSnakeCaseKeys } from '@gitlab-org/core';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import { DefaultShellContextProvider, ShellInfo } from './shell';

jest.mock('node:child_process');
jest.mock('fs');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ShellContextProvider', () => {
  let provider: DefaultShellContextProvider;
  let logger: TestLogger;
  let configService: ConfigService;
  let mockCommandService: WorkflowCommandService;
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: NodeJS.Platform;
  let originalPpid: number | undefined;
  let originalCwd: () => string;

  const expectShellResult = (
    result: AIContextItem[],
    expectedShellInfoCamelCase: Omit<ShellInfo, 'detectionMethod'>,
    expectedSecondaryText: string,
    expectedSubTypeLabel: string = 'System Terminal',
  ) => {
    expect(result).toHaveLength(1);

    const actualResult = result[0];
    expect(actualResult.category).toBe('agent_user_environment');
    expect(actualResult.id).toBe('agent_user_environment_shell_info');

    // Content should be in snake_case for DWS
    const actualContent = actualResult.content ? JSON.parse(actualResult.content) : {};
    const expectedShellInfoSnakeCase = deepSnakeCaseKeys(expectedShellInfoCamelCase);
    expect(actualContent).toEqual(expectedShellInfoSnakeCase);

    expect(actualResult.metadata).toEqual({
      title: 'Shell Environment',
      enabled: true,
      subType: 'shell',
      icon: 'terminal',
      secondaryText: expectedSecondaryText,
      subTypeLabel: expectedSubTypeLabel,
    });
  };

  beforeEach(() => {
    logger = new TestLogger();

    configService = new DefaultConfigService();

    mockCommandService = createFakePartial<WorkflowCommandService>({
      runCommand: jest.fn(),
    });

    provider = new DefaultShellContextProvider(logger, configService, [mockCommandService]);

    originalEnv = process.env;
    originalPlatform = process.platform;
    originalPpid = process.ppid;
    originalCwd = process.cwd;

    process.env = {};

    const mockCwd = jest.fn().mockReturnValue('/home/user');
    process.cwd = mockCwd;

    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error('File not found');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.cwd = originalCwd;
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    Object.defineProperty(process, 'ppid', {
      value: originalPpid,
    });
  });

  describe('IDE Terminal Detection', () => {
    describe('Windows IDE Terminal Detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'win32',
        });
      });

      it('detects PowerShell via IDE terminal command', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: 'PSVersion:5.1.19041.1023 PSEdition:Desktop',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'Windows PowerShell',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: Windows PowerShell',
          'IDE Terminal',
        );

        expect(mockCommandService.runCommand).toHaveBeenCalledWith(
          'shell-detection',
          '/home/user',
          'powershell',
          true,
          [
            '-NoProfile',
            '-Command',
            'echo "PSVersion:$($PSVersionTable.PSVersion) PSEdition:$($PSVersionTable.PSEdition)"',
          ],
        );
      });

      it('detects PowerShell Core via IDE terminal command', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output:
              '$PSVersionTable.PSVersion\nMajor  Minor  Build  Revision\n-----  -----  -----  --------\n7      2      0      0\nPSEdition                      Core',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'PowerShell Core',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: PowerShell Core',
          'IDE Terminal',
        );
      });

      it('detects Command Prompt via IDE terminal command', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output: 'C:\\Windows\\System32\\cmd.exe',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'cmd',
            shellType: 'windows',
            shellVariant: 'Command Prompt',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: cmd • Variant: Command Prompt',
          'IDE Terminal',
        );
      });

      it('handles empty output gracefully', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output: '',
          }),
        );

        // Mock system detection fallback
        mockExecSync.mockReturnValue(Buffer.from(''));

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'Windows PowerShell',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: Windows PowerShell',
          'System Terminal',
        );
      });

      it('handles mixed PowerShell output', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output:
              'C:\\Windows\\System32\\cmd.exe\n$PSVersionTable.PSVersion\nMajor  Minor  Build  Revision\n-----  -----  -----  --------\n5      1      19041  1023',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'Windows PowerShell',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: Windows PowerShell',
          'IDE Terminal',
        );
      });

      it('handles PowerShell with additional version info', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output:
              '$PSVersionTable.PSVersion\nMajor  Minor  Build  Revision\n-----  -----  -----  --------\n7      3      0      0\nPSEdition                      Core\nPSCompatibleVersions           {1.0, 2.0, 3.0, 4.0...}',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'PowerShell Core',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: PowerShell Core',
          'IDE Terminal',
        );
      });

      it('handles cmd.exe with full path variations', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output: 'C:\\WINDOWS\\system32\\cmd.exe',
          }),
        );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'cmd',
            shellType: 'windows',
            shellVariant: 'Command Prompt',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: cmd • Variant: Command Prompt',
          'IDE Terminal',
        );
      });

      it('falls back to system detection when IDE terminal detection fails', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial({
            error: 'Command failed',
          }),
        );

        // Mock system detection
        mockExecSync.mockReturnValue(Buffer.from(''));

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'powershell',
            shellType: 'windows',
            shellVariant: 'Windows PowerShell',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: powershell • Variant: Windows PowerShell',
          'System Terminal',
        );
      });
    });

    describe('Unix IDE Terminal Detection', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', {
          value: 'linux',
        });
      });

      it('detects bash shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash',
          'IDE Terminal',
        );

        expect(mockCommandService.runCommand).toHaveBeenCalledWith(
          'shell-detection',
          '/home/user',
          'ps',
          true,
          ['-p', '$$', '-o', 'comm='],
        );
      });

      it('detects zsh shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/zsh',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'zsh',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: zsh',
          'IDE Terminal',
        );
      });

      it('detects fish shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/usr/local/bin/fish',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'fish',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: fish',
          'IDE Terminal',
        );
      });

      it('detects dash shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/dash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'dash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: dash',
          'IDE Terminal',
        );
      });

      it('detects ksh shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/ksh',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'ksh',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: ksh',
          'IDE Terminal',
        );
      });

      it('detects tcsh shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/tcsh',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'tcsh',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: tcsh',
          'IDE Terminal',
        );
      });

      it('detects csh shell via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/csh',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'csh',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: csh',
          'IDE Terminal',
        );
      });

      it('detects shell with ANSI chars via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '\u001b]633;C\u0007bash\r\n',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash',
          'IDE Terminal',
        );
      });

      it('detects WSL environment via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=Ubuntu\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'hybrid',
            shellEnvironment: 'wsl',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Windows Subsystem for Linux',
          'IDE Terminal',
        );
      });

      it('detects SSH session via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=true\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: true,
            cwd: '/home/user',
          },
          'Shell: bash • SSH Session: Active',
          'IDE Terminal',
        );
      });

      it('detects Docker environment via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=true\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'docker',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Docker Container',
          'IDE Terminal',
        );
      });

      it('detects Cygwin environment via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=nodosfilewarning\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'cygwin',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Cygwin',
          'IDE Terminal',
        );
      });

      it('detects MinGW environment via IDE terminal', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=MINGW64',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'mingw',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: MinGW',
          'IDE Terminal',
        );
      });

      it('handles environment detection failure gracefully', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial({
              error: 'Environment detection failed',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash',
          'IDE Terminal',
        );
      });

      it('handles output with ANSI escape codes', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output:
                'WSL=Ubuntu\u001b[7m%\u001b[0m\nSSH=true\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'hybrid',
            shellEnvironment: 'wsl',
            sshSession: true,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Windows Subsystem for Linux • SSH Session: Active',
          'IDE Terminal',
        );
      });

      it('falls back to system detection when IDE terminal detection fails', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial({
            error: 'Command failed',
          }),
        );

        // Mock system detection
        process.env.SHELL = '/bin/zsh';

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'zsh',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: zsh',
          'System Terminal',
        );
      });

      it('returns null when shell output is empty', async () => {
        jest.mocked(mockCommandService.runCommand).mockResolvedValue(
          createFakePartial<RunCommandSuccess>({
            output: '',
          }),
        );

        // Mock system detection
        process.env.SHELL = '/bin/bash';

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash',
          'System Terminal',
        );
      });

      it('handles combined WSL and SSH environment', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=Ubuntu\nSSH=true\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'hybrid',
            shellEnvironment: 'wsl',
            sshSession: true,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Windows Subsystem for Linux • SSH Session: Active',
          'IDE Terminal',
        );
      });

      it('handles combined Docker and SSH environment', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: '/bin/bash',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=true\nDOCKER=true\nCYGWIN=false\nMINGW=false',
            }),
          );

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'docker',
            sshSession: true,
            cwd: '/home/user',
          },
          'Shell: bash • Environment: Docker Container • SSH Session: Active',
          'IDE Terminal',
        );
      });

      it('handles unknown shell names gracefully', async () => {
        jest
          .mocked(mockCommandService.runCommand)
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'unknown-shell',
            }),
          )
          .mockResolvedValueOnce(
            createFakePartial<RunCommandSuccess>({
              output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
            }),
          );

        // Mock system detection fallback
        process.env.SHELL = '/bin/bash';

        const result = await provider.getItems();

        expectShellResult(
          result,
          {
            shellName: 'bash',
            shellType: 'unix',
            shellEnvironment: 'native',
            sshSession: false,
            cwd: '/home/user',
          },
          'Shell: bash',
          'System Terminal',
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('handles IDE terminal command service throwing exceptions', async () => {
      jest
        .mocked(mockCommandService.runCommand)
        .mockRejectedValue(new Error('Service unavailable'));
      process.env.SHELL = '/bin/bash';
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });

      const result = await provider.getItems();

      expectShellResult(
        result,
        {
          shellName: 'bash',
          shellType: 'unix',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
        },
        'Shell: bash',
        'System Terminal',
      );
    });
  });

  describe('precalculate', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
      process.env.SHELL = '/bin/bash';

      jest.mocked(mockCommandService.runCommand).mockReset();
    });

    it('caches shell context and getItems uses cached result', async () => {
      const freshProvider = new DefaultShellContextProvider(logger, configService, [
        mockCommandService,
      ]);

      jest
        .mocked(mockCommandService.runCommand)
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: '/bin/bash',
          }),
        )
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
          }),
        );

      await freshProvider.precalculateOnWorkflowStart();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2);

      const result = await freshProvider.getItems();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2); // Still only 2, uses cache

      expectShellResult(
        result,
        {
          shellName: 'bash',
          shellType: 'unix',
          shellEnvironment: 'native',
          sshSession: false,
          cwd: '/home/user',
        },
        'Shell: bash',
        'IDE Terminal',
      );
    });

    it('caches errors from precalculation and getItems returns cached error', async () => {
      const freshProvider = new DefaultShellContextProvider(logger, configService, [
        mockCommandService,
      ]);

      // Make all detection methods fail
      jest.mocked(mockCommandService.runCommand).mockResolvedValue(
        createFakePartial({
          error: 'Command failed',
        }),
      );
      delete process.env.SHELL;
      Object.defineProperty(process, 'ppid', {
        value: undefined,
      });
      Object.defineProperty(process, 'platform', {
        value: 'aix' as NodeJS.Platform, // Unsupported platform
      });

      await freshProvider.precalculateOnWorkflowStart();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(1);

      // getItems returns the cached (failed) result, no new calculation
      const result = await freshProvider.getItems();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(1); // Still only 1
      expect(result).toEqual([]);
    });

    it('calling precalculate again forces fresh calculation', async () => {
      const freshProvider = new DefaultShellContextProvider(logger, configService, [
        mockCommandService,
      ]);

      // First precalculate - bash
      jest
        .mocked(mockCommandService.runCommand)
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: '/bin/bash',
          }),
        )
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
          }),
        );

      await freshProvider.precalculateOnWorkflowStart();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2);

      let result = await freshProvider.getItems();
      expect(result[0].content).toContain('"shell_name":"bash"');
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2); // Cached

      // Second precalculate forces fresh calculation - zsh
      jest
        .mocked(mockCommandService.runCommand)
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: '/bin/zsh',
          }),
        )
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
          }),
        );

      await freshProvider.precalculateOnWorkflowStart();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(4); // Fresh call

      result = await freshProvider.getItems();
      expect(result[0].content).toContain('"shell_name":"zsh"');
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(4); // Still cached
    });

    it('getItems without precalculate performs lazy calculation and caches result', async () => {
      const freshProvider = new DefaultShellContextProvider(logger, configService, [
        mockCommandService,
      ]);

      jest
        .mocked(mockCommandService.runCommand)
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: '/bin/bash',
          }),
        )
        .mockResolvedValueOnce(
          createFakePartial<RunCommandSuccess>({
            output: 'WSL=false\nSSH=false\nDOCKER=false\nCYGWIN=false\nMINGW=false',
          }),
        );

      // First call calculates
      await freshProvider.getItems();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2);

      // Second call uses cache
      await freshProvider.getItems();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2);

      // Third call still uses cache
      await freshProvider.getItems();
      expect(mockCommandService.runCommand).toHaveBeenCalledTimes(2);
    });
  });
});
