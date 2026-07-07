import { createInterfaceId } from '@gitlab/needle';

export interface GitLsFiles {
  execute(
    basePath: string,
    repositoryUrl?: string,
    gitPassword?: string,
    gitDir?: string,
  ): Promise<string[]>;
}

export const GitLsFiles = createInterfaceId<GitLsFiles>('GitLsFiles');

export function isUnsupportedDircacheError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'InternalError' &&
    error.message.includes('Unsupported dircache version: ')
  );
}
