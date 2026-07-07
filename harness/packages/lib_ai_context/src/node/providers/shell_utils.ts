import { deepSnakeCaseKeys } from '@gitlab-org/core';
import { type AIContextItem } from '../../index';
import { type ShellInfo } from './shell';

export function buildShellInfoContent(shellInfo: ShellInfo): string {
  const lines: string[] = [];

  lines.push(`Shell: ${shellInfo.shellName}`);

  if (shellInfo.shellVariant) {
    lines.push(`Variant: ${shellInfo.shellVariant}`);
  }

  if (shellInfo.shellEnvironment && shellInfo.shellEnvironment !== 'native') {
    lines.push(`Environment: ${formatShellEnvironment(shellInfo.shellEnvironment)}`);
  }

  if (shellInfo.sshSession) {
    lines.push('SSH Session: Active');
  }

  return lines.join(' • ');
}

export function formatShellEnvironment(
  env: Exclude<ShellInfo['shellEnvironment'], 'native' | null | undefined>,
): string {
  const formatMap: Record<string, string> = {
    wsl: 'Windows Subsystem for Linux',
    'git-bash': 'Git Bash',
    mingw: 'MinGW',
    cygwin: 'Cygwin',
    ssh: 'SSH Session',
    docker: 'Docker Container',
  };

  return formatMap[env] || env;
}

export function extractUnixShellName(output: string): string | null {
  const knownShells = ['bash', 'zsh', 'fish', 'dash', 'tcsh', 'ksh', 'csh', 'sh'];

  for (const shell of knownShells) {
    const shellRegex = new RegExp(`(?:^|[^a-zA-Z0-9])${shell}(?:[^a-zA-Z0-9]|$)`);
    if (shellRegex.test(output)) {
      return shell;
    }
  }

  return null;
}

export function buildShellContextItems(shellInfo: ShellInfo): AIContextItem[] {
  const { detectionMethod, ...shellInfoContent } = shellInfo;

  // Transform to snake_case for DWS compatibility
  const shellInfoForDWS = deepSnakeCaseKeys(shellInfoContent);

  return [
    {
      category: 'agent_user_environment',
      content: JSON.stringify(shellInfoForDWS),
      id: 'agent_user_environment_shell_info',
      metadata: {
        title: 'Shell Environment',
        enabled: true,
        subType: 'shell',
        icon: 'terminal',
        secondaryText: buildShellInfoContent(shellInfo),
        subTypeLabel: detectionMethod === 'ide-terminal' ? 'IDE Terminal' : 'System Terminal',
      },
    },
  ];
}
