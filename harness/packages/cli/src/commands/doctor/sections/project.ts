import { URI } from 'vscode-uri';
import type { ConfigService } from '@gitlab-org/config';
import { NOT_AVAILABLE, STATUS } from '../render_helpers';

function uriToFsPath(uri: string): string {
  try {
    return URI.parse(uri).fsPath;
  } catch {
    return uri;
  }
}

export function renderProject(configService: ConfigService): string {
  const workspaceFolders = configService.get('workspaceFolders') ?? [];
  const projectPath = configService.get('projectPath');
  const baseUrl = configService.get('baseUrl');

  const workspaceLine =
    workspaceFolders.length > 0
      ? `- Workspace: ${uriToFsPath(workspaceFolders[0].uri)}`
      : `- Workspace: ${NOT_AVAILABLE}`;

  const remoteLine = projectPath
    ? `- Git remote: ${projectPath}${baseUrl ? ` (${baseUrl})` : ''}`
    : '- Git remote: not detected';

  const resolvedLine = projectPath
    ? `- GitLab project resolved: ${STATUS.pass} yes`
    : `- GitLab project resolved: ${STATUS.fail} no`;

  return ['## Project', workspaceLine, remoteLine, resolvedLine].join('\n');
}
