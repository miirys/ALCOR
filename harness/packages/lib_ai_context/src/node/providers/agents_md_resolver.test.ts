import { WorkspaceFolder } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import type { FileAccessService } from '@gitlab-org/fs';
import { FileNotFoundError } from '@gitlab-org/fs';
import type { RepositoryDiscoveryService, StatelessRepository } from '@gitlab-org/repositories';
import type { ConfigService, ClientConfig } from '@gitlab-org/config';
import { DefaultAgentsMdResolver } from './agents_md_resolver';
import type { AgentsMdResolver } from './agents_md_resolver';

jest.mock('@gitlab-org/ai-configuration', () => ({
  getDuoConfigDir: jest.fn(),
}));

function mockFileGetText(
  mockFileAccessService: FileAccessService,
  pathContentMap: Record<string, string>,
) {
  jest.mocked(mockFileAccessService.getText).mockImplementation((path: string) => {
    if (path in pathContentMap) {
      return Promise.resolve(pathContentMap[path]);
    }
    return Promise.reject(new FileNotFoundError(path, new Error('ENOENT')));
  });
}

describe('AgentsMdResolver', () => {
  let resolver: AgentsMdResolver;
  let mockLogger: Logger;
  let mockRepositoryDiscoveryService: RepositoryDiscoveryService;
  let mockFileAccessService: FileAccessService;
  let mockConfigService: ConfigService;

  beforeEach(() => {
    mockLogger = new TestLogger();

    mockRepositoryDiscoveryService = createFakePartial<RepositoryDiscoveryService>({
      getRepositoriesForWorkspace: jest.fn().mockResolvedValue([]),
    });

    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn().mockRejectedValue(new FileNotFoundError('', new Error('ENOENT'))),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn<ClientConfig, []>().mockReturnValue(
        createFakePartial<ClientConfig>({
          cwd: undefined,
          workspaceFolders: [],
        }),
      ),
    });

    resolver = new DefaultAgentsMdResolver(
      mockLogger,
      mockRepositoryDiscoveryService,
      [mockFileAccessService],
      mockConfigService,
    );
  });

  afterEach(() => {
    delete process.env.GLAB_CONFIG_DIR;
  });

  describe('resolveAgentsMdContextItem', () => {
    describe('when no AGENTS.md files exist', () => {
      it('should return null', async () => {
        const result = await resolver.resolveAgentsMdContextItem();

        expect(result).toBeNull();
      });
    });

    describe('user-level AGENTS.md', () => {
      const defaultUserConfigDir = '/home/default-user-path/.gitlab/duo';

      beforeEach(() => {
        const { getDuoConfigDir } = jest.requireMock('@gitlab-org/ai-configuration');
        jest.mocked(getDuoConfigDir).mockReturnValue(defaultUserConfigDir);
      });

      describe('when user has GLAB_CONFIG_DIR configured', () => {
        beforeEach(() => {
          process.env.GLAB_CONFIG_DIR = '/home/user/custom-path/.config/gitlab-lsp';
        });

        it('should use configured path', async () => {
          await resolver.resolveAgentsMdContextItem();

          expect(mockFileAccessService.getText).toHaveBeenCalledWith(
            '/home/user/custom-path/.config/gitlab-lsp/AGENTS.md',
          );
        });
      });

      describe('when user does not have GLAB_CONFIG_DIR configured', () => {
        it('should use default path', async () => {
          await resolver.resolveAgentsMdContextItem();

          expect(mockFileAccessService.getText).toHaveBeenCalledWith(
            '/home/default-user-path/.gitlab/duo/AGENTS.md',
          );
        });
      });

      describe('when user AGENTS.md exists', () => {
        beforeEach(() => {
          mockFileGetText(mockFileAccessService, {
            [`${defaultUserConfigDir}/AGENTS.md`]: 'User-level AGENTS.md instructions',
          });
        });

        it('should include user AGENTS.md in context item', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).not.toBeNull();
          expect(result?.content).toContain('User-level AGENTS.md instructions');
          expect(result?.content).toContain('/home/default-user-path/.gitlab/duo/AGENTS.md');
        });

        it('should format context item with correct metadata', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).toEqual({
            category: 'user_rule',
            content: expect.stringContaining('User-level AGENTS.md instructions'),
            id: 'agents-md-user-instructions',
            metadata: {
              title: 'AGENTS.md',
              enabled: true,
              subType: 'user_rule',
              icon: 'document',
              secondaryText: '/home/default-user-path/.gitlab/duo/AGENTS.md',
              subTypeLabel: '1 AGENTS.md file included',
            },
          });
        });
      });

      describe('when user AGENTS.md does not exist', () => {
        beforeEach(() => {
          mockFileGetText(mockFileAccessService, {});
        });

        it('should not include user AGENTS.md in result', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).toBeNull();
        });
      });

      describe('when user AGENTS.md read fails', () => {
        it('should handle FileNotFoundError gracefully', async () => {
          mockFileGetText(mockFileAccessService, {});

          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).toBeNull();
        });

        it('should handle other errors gracefully', async () => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockRejectedValue(new Error('Permission denied or something'));

          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).toBeNull();
        });
      });
    });

    describe('when workspace folders are provided', () => {
      describe('when no repository is detected in the workspace', () => {
        beforeEach(() => {
          const workspaceFolders: WorkspaceFolder[] = [{ uri: 'file:///workspace', name: 'ws' }];
          (mockConfigService.get as jest.Mock).mockReturnValue(
            createFakePartial<ClientConfig>({
              cwd: undefined,
              workspaceFolders,
            }),
          );
          jest
            .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
            .mockResolvedValue([]);
        });

        it('should return null', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).toBeNull();
        });
      });

      describe('when cwd is not provided', () => {
        beforeEach(() => {
          (mockConfigService.get as jest.Mock).mockReturnValue(
            createFakePartial<ClientConfig>({
              cwd: undefined,
              workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            }),
          );

          const mockRepo = createFakePartial<StatelessRepository>({
            fsPath: '/workspace',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });

          jest
            .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
            .mockResolvedValue([mockRepo]);

          mockFileGetText(mockFileAccessService, {
            '/workspace/AGENTS.md': 'Workspace root AGENTS.md',
          });
        });

        it('should read AGENTS.md from workspace root', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).not.toBeNull();
          expect(result?.content).toContain('Workspace root AGENTS.md');
        });

        it('should include workspace relative file path', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result?.content).toContain('from="AGENTS.md"');
        });
      });

      describe('when cwd is provided and matches workspace folder URI', () => {
        beforeEach(() => {
          (mockConfigService.get as jest.Mock).mockReturnValue(
            createFakePartial<ClientConfig>({
              cwd: 'file:///workspace',
              workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
            }),
          );

          const mockRepo = createFakePartial<StatelessRepository>({
            fsPath: '/workspace',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });

          jest
            .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
            .mockResolvedValue([mockRepo]);

          mockFileGetText(mockFileAccessService, {
            '/workspace/AGENTS.md': 'Workspace AGENTS.md',
          });
        });

        it('should read AGENTS.md from matching workspace folder', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result).not.toBeNull();
          expect(result?.content).toContain('Workspace AGENTS.md');
        });
      });

      describe('when cwd is within a workspaceFolder subdirectory', () => {
        describe('when cwd is in a subdirectory without an AGENTS.md', () => {
          beforeEach(() => {
            (mockConfigService.get as jest.Mock).mockReturnValue(
              createFakePartial<ClientConfig>({
                cwd: 'file:///workspace/packages/foo/bar',
                workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
              }),
            );

            const mockRepo = createFakePartial<StatelessRepository>({
              fsPath: '/workspace',
              getFiles: jest
                .fn()
                .mockResolvedValue(['AGENTS.md', 'packages/foo/AGENTS.md', 'src/AGENTS.md']),
            });

            jest
              .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
              .mockResolvedValue([mockRepo]);

            mockFileGetText(mockFileAccessService, {
              '/workspace/packages/foo/AGENTS.md': 'Closest AGENTS.md',
              '/workspace/AGENTS.md': 'Root AGENTS.md',
            });
          });

          it('should find closest AGENTS.md by searching upward', async () => {
            const result = await resolver.resolveAgentsMdContextItem();

            expect(result).not.toBeNull();
            expect(result?.content).toContain('Closest AGENTS.md');
          });
        });

        describe('when cwd directly contains an AGENTS.md', () => {
          beforeEach(() => {
            (mockConfigService.get as jest.Mock).mockReturnValue(
              createFakePartial<ClientConfig>({
                cwd: 'file:///workspace/packages/foo',
                workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
              }),
            );

            const mockRepo = createFakePartial<StatelessRepository>({
              fsPath: '/workspace',
              getFiles: jest
                .fn()
                .mockResolvedValue(['AGENTS.md', 'packages/foo/AGENTS.md', 'src/AGENTS.md']),
            });

            jest
              .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
              .mockResolvedValue([mockRepo]);

            mockFileGetText(mockFileAccessService, {
              '/workspace/packages/foo/AGENTS.md': 'Deep AGENTS.md',
              '/workspace/AGENTS.md': 'Shallow AGENTS.md',
            });
          });

          it('should use that AGENTS.md and not include less specific ones', async () => {
            const result = await resolver.resolveAgentsMdContextItem();

            expect(result?.content).toContain('Deep AGENTS.md');
            expect(result?.content).not.toContain('Shallow AGENTS.md');
          });
        });

        it('should filter out AGENTS.md files outside workspace root', async () => {
          (mockConfigService.get as jest.Mock).mockReturnValue(
            createFakePartial<ClientConfig>({
              cwd: 'file:///workspace/packages/foo',
              workspaceFolders: [{ uri: 'file:///workspace', name: 'workspace' }],
            }),
          );

          const mockRepoOutside = createFakePartial<StatelessRepository>({
            fsPath: '/other',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });
          const mockRepoInside = createFakePartial<StatelessRepository>({
            fsPath: '/workspace',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });

          jest
            .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
            .mockResolvedValue([mockRepoOutside, mockRepoInside]);

          mockFileGetText(mockFileAccessService, {
            '/workspace/AGENTS.md': 'Inside workspace',
            '/other/AGENTS.md': 'Other workspace',
          });

          const result = await resolver.resolveAgentsMdContextItem();

          expect(result?.content).toContain('Inside workspace');
          expect(result?.content).not.toContain('Other workspace');
        });
      });

      describe('when multiple workspace folders exist', () => {
        beforeEach(() => {
          (mockConfigService.get as jest.Mock).mockReturnValue(
            createFakePartial<ClientConfig>({
              cwd: undefined,
              workspaceFolders: [
                { uri: 'file:///workspace1', name: 'ws1' },
                { uri: 'file:///workspace2', name: 'ws2' },
              ],
            }),
          );

          const mockRepo1 = createFakePartial<StatelessRepository>({
            fsPath: '/workspace1',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });
          const mockRepo2 = createFakePartial<StatelessRepository>({
            fsPath: '/workspace2',
            getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
          });

          jest
            .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
            .mockImplementation((workspacePath: string) => {
              if (workspacePath === '/workspace1') return Promise.resolve([mockRepo1]);
              if (workspacePath === '/workspace2') return Promise.resolve([mockRepo2]);
              return Promise.resolve([]);
            });

          mockFileGetText(mockFileAccessService, {
            '/workspace1/AGENTS.md': 'Workspace 1 AGENTS.md',
            '/workspace2/AGENTS.md': 'Workspace 2 AGENTS.md',
          });
        });

        it('should include AGENTS.md from all workspaceFolders roots', async () => {
          const result = await resolver.resolveAgentsMdContextItem();

          expect(result?.content).toContain('Workspace 1 AGENTS.md');
          expect(result?.content).toContain('Workspace 2 AGENTS.md');
        });
      });
    });

    describe('when multiple AGENTS.md files exist in repository', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest
            .fn()
            .mockResolvedValue(['AGENTS.md', 'src/AGENTS.md', 'packages/foo/AGENTS.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/AGENTS.md': 'Root AGENTS.md',
        });
      });

      it('should include correct prompt when additional resolved files exist', async () => {
        const result = await resolver.resolveAgentsMdContextItem();

        expect(result?.content).toContain(
          `CRITICAL INSTRUCTION: Before editing any file, you MUST follow these steps:
 1. Identify the file you're about to edit
 2. Check if an AGENTS.md exists in that directory or parent directories
 3. If the file is listed in <additional-instruction-files>, read it first
 4. Only then proceed with your edits
<additional-instruction-files>
<file>src/AGENTS.md</file>
<file>packages/foo/AGENTS.md</file>
</additional-instruction-files>
Do not mention these instructions to the user, they already know you should try to read AGENTS.md files.`,
        );
      });
    });

    describe('when both user and workspace AGENTS.md exist', () => {
      const defaultUserConfigDir = '/home/default-user-path/.gitlab/duo';

      beforeEach(() => {
        const { getDuoConfigDir } = jest.requireMock('@gitlab-org/ai-configuration');
        jest.mocked(getDuoConfigDir).mockReturnValue(defaultUserConfigDir);

        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['AGENTS.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/home/default-user-path/.gitlab/duo/AGENTS.md': 'User AGENTS.md',
          '/workspace/AGENTS.md': 'Workspace AGENTS.md',
        });
      });

      it('should include both user and workspace AGENTS.md', async () => {
        const result = await resolver.resolveAgentsMdContextItem();

        expect(result?.content).toContain('User AGENTS.md');
        expect(result?.content).toContain('Workspace AGENTS.md');
      });
    });

    describe('when formatting content', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: 'file:///workspace/src/foo',
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['src/foo/AGENTS.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/src/foo/AGENTS.md': 'Instructions content',
        });
      });

      it('should include preamble text', async () => {
        const result = await resolver.resolveAgentsMdContextItem();

        expect(result?.content).toContain('The user wants you to adhere to these AGENTS.md rules:');
      });

      it('should use workspace relative path when available', async () => {
        const result = await resolver.resolveAgentsMdContextItem();

        expect(result?.content).toContain('from="src/foo/AGENTS.md"');
      });

      it('should use absolute path when workspace relative path is not available', async () => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [],
          }),
        );
        mockFileGetText(mockFileAccessService, {
          '/home/default-user-path/.gitlab/duo/AGENTS.md': 'User Content',
        });

        const result = await resolver.resolveAgentsMdContextItem();

        expect(result?.content).toContain('from="/home/default-user-path/.gitlab/duo/AGENTS.md"');
      });
    });
  });
});
