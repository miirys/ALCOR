import path from 'path';
import { getDuoConfigFilePath } from '../../utils/paths';
import type { FilePath } from '../config';

export type McpConfigScope = 'workspace' | 'user';

export interface McpConfigPathCandidate {
  path: FilePath;
  scope: McpConfigScope;
}

export function getMcpConfigPathCandidates(workspacePath: string): McpConfigPathCandidate[] {
  const candidates: McpConfigPathCandidate[] = [];

  // workspace configuration
  if (workspacePath && path.isAbsolute(workspacePath)) {
    const workspaceConfigPath = path.join(workspacePath, '.gitlab', 'duo', 'mcp.json') as FilePath;
    candidates.push({ path: workspaceConfigPath, scope: 'workspace' });
  }

  // user configuration
  const userMcpConfigPath = getDuoConfigFilePath('mcp.json');
  if (userMcpConfigPath) {
    candidates.push({ path: userMcpConfigPath as FilePath, scope: 'user' });
  }

  return candidates;
}
