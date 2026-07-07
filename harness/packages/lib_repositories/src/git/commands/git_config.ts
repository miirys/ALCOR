import { createInterfaceId } from '@gitlab/needle';
import { URI } from 'vscode-uri';

export interface GitConfigCommand {
  getRemoteUrl(gitConfigUri: URI, remoteName: string, fallbackUrl: string): Promise<string>;
}

export const GitConfigCommand = createInterfaceId<GitConfigCommand>('GitConfigCommand');
