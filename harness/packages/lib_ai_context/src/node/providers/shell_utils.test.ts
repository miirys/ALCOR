import { deepSnakeCaseKeys } from '@gitlab-org/core';
import {
  buildShellContextItems,
  buildShellInfoContent,
  extractUnixShellName,
  formatShellEnvironment,
} from './shell_utils';
import { type ShellInfo } from './shell';

describe('extractUnixShellName', () => {
  it.each([
    { input: '/bin/bash', expected: 'bash' },
    { input: '/usr/bin/zsh', expected: 'zsh' },
    { input: '/usr/local/bin/fish', expected: 'fish' },
    { input: '/bin/sh', expected: 'sh' },
    { input: '/bin/dash', expected: 'dash' },
    { input: '/bin/ksh', expected: 'ksh' },
    { input: '/bin/tcsh', expected: 'tcsh' },
    { input: '/bin/csh', expected: 'csh' },
    { input: 'bash', expected: 'bash' },
    { input: 'zsh\n', expected: 'zsh' },
    { input: '/usr/local/bin/custom-bash-4.0', expected: 'bash' },
    { input: '/usr/local/bin/zsh-5.8.1', expected: 'zsh' },
    { input: '/opt/homebrew/bin/fish', expected: 'fish' },
    { input: '/usr/local/bin/bash-5.0', expected: 'bash' },
  ])('extracts $expected from "$input"', ({ input, expected }) => {
    expect(extractUnixShellName(input)).toBe(expected);
  });

  it('returns null for unknown shell paths', () => {
    expect(extractUnixShellName('/bin/customshell')).toBeNull();
    expect(extractUnixShellName('/bin/nushell')).toBeNull();
    expect(extractUnixShellName('')).toBeNull();
  });
});

describe('formatShellEnvironment', () => {
  it.each([
    { env: 'wsl', expected: 'Windows Subsystem for Linux' },
    { env: 'git-bash', expected: 'Git Bash' },
    { env: 'mingw', expected: 'MinGW' },
    { env: 'cygwin', expected: 'Cygwin' },
    { env: 'ssh', expected: 'SSH Session' },
    { env: 'docker', expected: 'Docker Container' },
  ])('formats $env as "$expected"', ({ env, expected }) => {
    expect(
      formatShellEnvironment(
        env as Exclude<ShellInfo['shellEnvironment'], 'native' | null | undefined>,
      ),
    ).toBe(expected);
  });

  it('returns the env value as-is when not in the format map', () => {
    expect(
      formatShellEnvironment(
        'unknown-env' as Exclude<ShellInfo['shellEnvironment'], 'native' | null | undefined>,
      ),
    ).toBe('unknown-env');
  });
});

describe('buildShellInfoContent', () => {
  it('builds content with shell name only', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
    };
    expect(buildShellInfoContent(shellInfo)).toBe('Shell: bash');
  });

  it('includes variant when present', () => {
    const shellInfo: ShellInfo = {
      shellName: 'powershell',
      shellType: 'windows',
      shellVariant: 'Windows PowerShell',
    };
    expect(buildShellInfoContent(shellInfo)).toBe(
      'Shell: powershell • Variant: Windows PowerShell',
    );
  });

  it('includes environment when not native', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'hybrid',
      shellEnvironment: 'wsl',
    };
    expect(buildShellInfoContent(shellInfo)).toBe(
      'Shell: bash • Environment: Windows Subsystem for Linux',
    );
  });

  it('omits environment when native', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      shellEnvironment: 'native',
    };
    expect(buildShellInfoContent(shellInfo)).toBe('Shell: bash');
  });

  it('includes SSH session indicator when sshSession is true', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      shellEnvironment: 'native',
      sshSession: true,
    };
    expect(buildShellInfoContent(shellInfo)).toBe('Shell: bash • SSH Session: Active');
  });

  it('builds full content with all fields', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'hybrid',
      shellVariant: 'WSL Ubuntu',
      shellEnvironment: 'wsl',
      sshSession: true,
    };
    expect(buildShellInfoContent(shellInfo)).toBe(
      'Shell: bash • Variant: WSL Ubuntu • Environment: Windows Subsystem for Linux • SSH Session: Active',
    );
  });
});

describe('buildShellContextItems', () => {
  it('returns a single AI context item with correct shape', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      shellEnvironment: 'native',
      sshSession: false,
      cwd: '/home/user',
      detectionMethod: 'system-fallback',
    };

    const result = buildShellContextItems(shellInfo);

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('agent_user_environment');
    expect(result[0].id).toBe('agent_user_environment_shell_info');
  });

  it('serializes shell info as snake_case JSON in content', () => {
    const shellInfo: ShellInfo = {
      shellName: 'zsh',
      shellType: 'unix',
      shellEnvironment: 'native',
      sshSession: false,
      cwd: '/home/user',
      detectionMethod: 'system-fallback',
    };

    const result = buildShellContextItems(shellInfo);
    const content = JSON.parse(result[0].content ?? '{}');

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { detectionMethod, ...shellInfoWithoutMethod } = shellInfo;
    expect(content).toEqual(deepSnakeCaseKeys(shellInfoWithoutMethod));
  });

  it('excludes detectionMethod from content', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      detectionMethod: 'ide-terminal',
    };

    const result = buildShellContextItems(shellInfo);
    const content = JSON.parse(result[0].content ?? '{}');

    expect(content).not.toHaveProperty('detection_method');
  });

  it('sets subTypeLabel to "IDE Terminal" when detectionMethod is ide-terminal', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      detectionMethod: 'ide-terminal',
    };

    const result = buildShellContextItems(shellInfo);

    expect(result[0].metadata?.subTypeLabel).toBe('IDE Terminal');
  });

  it('sets subTypeLabel to "System Terminal" when detectionMethod is system-fallback', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      detectionMethod: 'system-fallback',
    };

    const result = buildShellContextItems(shellInfo);

    expect(result[0].metadata?.subTypeLabel).toBe('System Terminal');
  });

  it('sets subTypeLabel to "System Terminal" when detectionMethod is absent', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
    };

    const result = buildShellContextItems(shellInfo);

    expect(result[0].metadata?.subTypeLabel).toBe('System Terminal');
  });

  it('sets correct metadata fields', () => {
    const shellInfo: ShellInfo = {
      shellName: 'bash',
      shellType: 'unix',
      shellEnvironment: 'native',
      sshSession: false,
    };

    const result = buildShellContextItems(shellInfo);

    expect(result[0].metadata).toMatchObject({
      title: 'Shell Environment',
      enabled: true,
      subType: 'shell',
      icon: 'terminal',
    });
  });

  it('sets secondaryText from buildShellInfoContent', () => {
    const shellInfo: ShellInfo = {
      shellName: 'zsh',
      shellType: 'unix',
      shellVariant: undefined,
      shellEnvironment: 'native',
      sshSession: false,
    };

    const result = buildShellContextItems(shellInfo);

    expect(result[0].metadata?.secondaryText).toBe('Shell: zsh');
  });
});
