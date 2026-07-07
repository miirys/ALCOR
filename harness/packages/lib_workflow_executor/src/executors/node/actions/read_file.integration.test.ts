import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFakePartial, writeArchive, parse } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FsFileAccessService, DesktopFsClient } from '@gitlab-org/fs/node';
import { ConfigService, ClientConfig } from '@gitlab-org/config';
import { ReadFileActionHandler, ReadFileAction } from './read_file';
import { FileStateTracker } from './file_state_tracker';
import { testGit } from './test_utils/test_git';
import { WorkflowActionContext } from './index';

// Force the trusted-dir set empty so an out-of-workspace absolute read is denied,
// and a workspace-skill read can only succeed via the workspace-folder path.
jest.mock('@gitlab-org/ai-configuration', () => ({
  getTrustedReadableDirectories: jest.fn().mockReturnValue([]),
}));

// Exercises the direct (non-sandboxed) executor, where the handler is DI-wired with the
// real ConfigService. The sandboxed worker gets only the active folder over RPC, so the
// multi-root case there is a separate follow-up (see create_worker_handlers.ts).
describe('ReadFileActionHandler multi-workspace (integration)', () => {
  let tempDir: string;
  let activeWorkspace: string;
  let otherWorkspace: string;
  let handler: ReadFileActionHandler;
  let context: WorkflowActionContext;

  const skillBody = '---\nname: greeting\ndescription: says hi\n---\nhello from the skill';

  beforeAll(async () => {
    tempDir = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'read-file-multiroot-')));
    activeWorkspace = path.join(tempDir, 'ws-active');
    otherWorkspace = path.join(tempDir, 'ws-other');

    await Promise.all(
      [activeWorkspace, otherWorkspace].map(async (repo) => {
        await fs.mkdir(repo, { recursive: true });
        const git = await testGit(repo);
        await writeArchive(repo, parse(`\n-- .agents/skills/greeting/SKILL.md --\n${skillBody}\n`));
        await git.add('.agents/skills/greeting/SKILL.md');
        await git.commit('add skill');
      }),
    );

    const logger = new TestLogger();
    const fileAccessService = new FsFileAccessService();
    const fsClient = new DesktopFsClient();
    const configService = createFakePartial<ConfigService>({
      get: (() =>
        createFakePartial<ClientConfig>({
          workspaceFolders: [
            { uri: `file://${activeWorkspace}`, name: 'active' },
            { uri: `file://${otherWorkspace}`, name: 'other' },
          ],
        })) as ConfigService['get'],
    });

    handler = new ReadFileActionHandler(logger, [fileAccessService], fsClient, configService);

    // Active workspace is ws-active; reads of ws-other must still resolve.
    context = createFakePartial<WorkflowActionContext>({
      workspaceFolderPath: activeWorkspace,
      workspaceFolderUri: `file://${activeWorkspace}`,
      fileStateTracker: createFakePartial<FileStateTracker>({
        recordFileRead: jest.fn(),
        assertFileNotModifiedSinceLastRead: jest.fn(),
      }),
    });
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const read = (filepath: string) =>
    handler.execute(createFakePartial<ReadFileAction>({ runReadFile: { filepath } }), context);

  it('reads a skill in a NON-active workspace folder via its absolute path', async () => {
    const result = await read(path.join(otherWorkspace, '.agents/skills/greeting/SKILL.md'));

    expect(result.error).toBe('');
    expect(result.response).toContain('hello from the skill');
  });

  it('reads a skill in the active workspace folder via its absolute path', async () => {
    const result = await read(path.join(activeWorkspace, '.agents/skills/greeting/SKILL.md'));

    expect(result.error).toBe('');
    expect(result.response).toContain('hello from the skill');
  });

  it('denies an absolute path outside every workspace folder and trusted dir', async () => {
    const result = await read(path.join(tempDir, 'outside.txt'));

    expect(result.response).toBe('');
    expect(result.error).toContain('Access denied');
  });
});
