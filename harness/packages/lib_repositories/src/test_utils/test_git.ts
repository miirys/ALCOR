import { simpleGit, SimpleGit } from 'simple-git';

/**
 * Creates a configured git instance for testing with isolated config.
 * This helper ensures tests don't interfere with system or global git config.
 *
 * @param dir - The directory to initialize as a git repository
 * @returns A configured SimpleGit instance with initialized repository
 */
export async function testGit(dir: string): Promise<SimpleGit> {
  const git = simpleGit(dir);
  git.env('GIT_CONFIG_NOSYSTEM', '1');
  git.env('GIT_CONFIG_NOGLOBAL', '1');
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'test@example.com');
  return git;
}
