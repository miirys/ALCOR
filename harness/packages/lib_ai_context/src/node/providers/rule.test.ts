import { WorkspaceFolder } from 'vscode-languageserver';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { Logger } from '@gitlab-org/logging';
import type { FileAccessService } from '@gitlab-org/fs';
import { FileNotFoundError } from '@gitlab-org/fs';
import { DefaultConfigService } from '@gitlab-org/config';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import type { AgentsMdResolver } from './agents_md_resolver';
import type { AgentSkillsResolver } from './agent_skills_resolver';
import { DefaultUserRuleContextProvider } from './rule';

jest.mock('@gitlab-org/ai-configuration');

describe('UserRuleContextProvider', () => {
  let provider: DefaultUserRuleContextProvider;
  let mockLogger: Logger;
  let mockFileAccessService: FileAccessService;
  let mockAgentsMdResolver: AgentsMdResolver;
  let mockAgentSkillsResolver: AgentSkillsResolver;
  const mockConfigService = new DefaultConfigService();
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GLAB_CONFIG_DIR;

    jest.mocked(getDuoConfigDir).mockReturnValue('/home/user/.config/gitlab-lsp');

    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    });

    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn(),
    });

    mockAgentsMdResolver = createFakePartial<AgentsMdResolver>({
      resolveAgentsMdContextItem: jest.fn().mockResolvedValue(null),
    });

    mockAgentSkillsResolver = createFakePartial<AgentSkillsResolver>({
      resolveAgentSkillsContextItem: jest.fn().mockResolvedValue({
        category: 'user_rule' as const,
        content: 'No agent skills were discovered (no skill locations were configured).',
        id: 'agent-skills-instructions',
        metadata: {
          title: 'Agent Skills',
          enabled: true,
          subType: 'user_rule' as const,
          icon: 'document',
          secondaryText: '',
          subTypeLabel: 'No agent skills found',
        },
      }),
    });

    provider = new DefaultUserRuleContextProvider(
      mockLogger,
      [mockFileAccessService],
      mockConfigService,
      mockAgentsMdResolver,
      mockAgentSkillsResolver,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getItems', () => {
    describe('user-level rules', () => {
      it('reads user rules from GLAB_CONFIG_DIR when set', async () => {
        process.env.GLAB_CONFIG_DIR = '/custom/config/dir';
        const mockUserRuleContent = 'User-level rules from GLAB_CONFIG_DIR.';

        jest.mocked(mockFileAccessService.getText).mockResolvedValue(mockUserRuleContent);

        const result = await provider.getItems();

        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/custom/config/dir/chat-rules.md',
        );
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          category: 'user_rule',
          content: `The user wants you to adhere to these rules:\n${mockUserRuleContent}`,
          id: 'user-config-rules',
          metadata: {
            title: 'User rules',
            enabled: true,
            subType: 'user_rule',
            icon: 'folder',
            secondaryText: 'User config chat-rules.md',
            subTypeLabel: 'User rules',
          },
        });
        expect(result[1].id).toBe('agent-skills-instructions');
      });

      it('reads user rules from getDuoConfigDir when GLAB_CONFIG_DIR is not set', async () => {
        const mockUserRuleContent = 'User-level rules from getDuoConfigDir.';

        jest.mocked(mockFileAccessService.getText).mockResolvedValue(mockUserRuleContent);

        const result = await provider.getItems();

        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/home/user/.config/gitlab-lsp/chat-rules.md',
        );
        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
          category: 'user_rule',
          content: `The user wants you to adhere to these rules:\n${mockUserRuleContent}`,
          id: 'user-config-rules',
          metadata: {
            title: 'User rules',
            enabled: true,
            subType: 'user_rule',
            icon: 'folder',
            secondaryText: 'User config chat-rules.md',
            subTypeLabel: 'User rules',
          },
        });
        expect(result[1].id).toBe('agent-skills-instructions');
      });

      it('logs info when user-level rules file is not found', async () => {
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValue(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          );

        const result = await provider.getItems();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(mockLogger.info).toHaveBeenCalledWith(
          '[UserRuleContextProvider] User-level Duo Chat rules file not found at /home/user/.config/gitlab-lsp/chat-rules.md, no user rules applied.',
          undefined,
        );
      });

      it('logs warning when user-level rules file cannot be read due to other errors', async () => {
        const mockError = new Error('Permission denied');
        jest.mocked(mockFileAccessService.getText).mockRejectedValue(mockError);

        const result = await provider.getItems();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(mockLogger.warn).toHaveBeenCalledWith(
          '[UserRuleContextProvider] Could not read user rules file from /home/user/.config/gitlab-lsp/chat-rules.md',
          mockError,
        );
      });
    });

    describe('workspace-level rules', () => {
      it('returns workspace rule context item when file exists', async () => {
        const mockRuleContent = 'Always be helpful and concise.';

        mockConfigService.set(
          'workspaceFolders',
          createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
        );
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          )
          .mockResolvedValueOnce(mockRuleContent);

        const result = await provider.getItems();

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(result[1]).toEqual({
          category: 'user_rule',
          content: `The user wants you to adhere to these rules:\n${mockRuleContent}`,
          id: 'workspace-config-rules',
          metadata: {
            title: 'Workspace rules',
            enabled: true,
            subType: 'user_rule',
            icon: 'folder',
            secondaryText: 'Workspace config chat-rules.md',
            subTypeLabel: 'Workspace rules',
          },
        });
        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/workspace/.gitlab/duo/chat-rules.md',
        );
      });

      it('returns only agent skills item when no workspace folders are configured', async () => {
        mockConfigService.set('workspaceFolders', createFakePartial<WorkspaceFolder[]>([]));
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValue(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          );

        const result = await provider.getItems();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(mockFileAccessService.getText).toHaveBeenCalledTimes(1);
        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/home/user/.config/gitlab-lsp/chat-rules.md',
        );
      });

      it('returns only agent skills item when workspace rules file cannot be read', async () => {
        mockConfigService.set(
          'workspaceFolders',
          createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
        );

        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          )
          .mockRejectedValueOnce(
            new FileNotFoundError('/workspace/.gitlab/duo/chat-rules.md', new Error('ENOENT')),
          );

        const result = await provider.getItems();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(mockLogger.info).toHaveBeenCalledWith(
          '[UserRuleContextProvider] Workspace-level Duo Chat rules file not found at /workspace/.gitlab/duo/chat-rules.md, no user rules applied.',
          undefined,
        );
      });

      it.each([
        {
          description: 'invalid URI format',
          uri: 'invalid-uri-format',
          expectedPath: '/invalid-uri-format/.gitlab/duo/chat-rules.md',
        },
        {
          description: 'URI with encoded characters',
          uri: 'file:///workspace with spaces/and%20encoded',
          expectedPath: '/workspace with spaces/and encoded/.gitlab/duo/chat-rules.md',
        },
        {
          description: 'empty URI string',
          uri: '',
          expectedPath: '/.gitlab/duo/chat-rules.md',
        },
      ])('handles $description gracefully', async ({ uri, expectedPath }) => {
        mockConfigService.set('workspaceFolders', createFakePartial<WorkspaceFolder[]>([{ uri }]));
        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          )
          .mockRejectedValueOnce(new FileNotFoundError(expectedPath, new Error('ENOENT')));

        const result = await provider.getItems();

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(mockFileAccessService.getText).toHaveBeenNthCalledWith(2, expectedPath);
      });
    });

    describe('combined user and workspace rules', () => {
      it('returns both user and workspace rules when both exist', async () => {
        const mockUserRuleContent = 'User-level rules.';
        const mockWorkspaceRuleContent = 'Workspace-level rules.';

        mockConfigService.set(
          'workspaceFolders',
          createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
        );

        jest
          .mocked(mockFileAccessService.getText)
          .mockResolvedValueOnce(mockUserRuleContent)
          .mockResolvedValueOnce(mockWorkspaceRuleContent);

        const result = await provider.getItems();

        expect(result).toHaveLength(3);
        expect(result[0]).toEqual({
          category: 'user_rule',
          content: `The user wants you to adhere to these rules:\n${mockUserRuleContent}`,
          id: 'user-config-rules',
          metadata: {
            title: 'User rules',
            enabled: true,
            subType: 'user_rule',
            icon: 'folder',
            secondaryText: 'User config chat-rules.md',
            subTypeLabel: 'User rules',
          },
        });
        expect(result[1].id).toBe('agent-skills-instructions');
        expect(result[2]).toEqual({
          category: 'user_rule',
          content: `The user wants you to adhere to these rules:\n${mockWorkspaceRuleContent}`,
          id: 'workspace-config-rules',
          metadata: {
            title: 'Workspace rules',
            enabled: true,
            subType: 'user_rule',
            icon: 'folder',
            secondaryText: 'Workspace config chat-rules.md',
            subTypeLabel: 'Workspace rules',
          },
        });
        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/home/user/.config/gitlab-lsp/chat-rules.md',
        );
        expect(mockFileAccessService.getText).toHaveBeenCalledWith(
          '/workspace/.gitlab/duo/chat-rules.md',
        );
      });

      it('returns user rules and agent skills when workspace rules do not exist', async () => {
        const mockUserRuleContent = 'User-level rules only.';

        mockConfigService.set(
          'workspaceFolders',
          createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
        );

        jest
          .mocked(mockFileAccessService.getText)
          .mockResolvedValueOnce(mockUserRuleContent)
          .mockRejectedValueOnce(
            new FileNotFoundError('/workspace/.gitlab/duo/chat-rules.md', new Error('ENOENT')),
          );

        const result = await provider.getItems();

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('user-config-rules');
        expect(result[0].content).toContain(mockUserRuleContent);
        expect(result[1].id).toBe('agent-skills-instructions');
      });

      it('returns workspace rules and agent skills when user rules do not exist', async () => {
        const mockWorkspaceRuleContent = 'Workspace-level rules only.';

        mockConfigService.set(
          'workspaceFolders',
          createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
        );

        jest
          .mocked(mockFileAccessService.getText)
          .mockRejectedValueOnce(
            new FileNotFoundError(
              '/home/user/.config/gitlab-lsp/chat-rules.md',
              new Error('ENOENT'),
            ),
          )
          .mockResolvedValueOnce(mockWorkspaceRuleContent);

        const result = await provider.getItems();

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('agent-skills-instructions');
        expect(result[1].id).toBe('workspace-config-rules');
        expect(result[1].content).toContain(mockWorkspaceRuleContent);
      });
    });

    describe('When AGENTS.md resolver returns an item', () => {
      const mockAgentsMdItem = {
        category: 'user_rule' as const,
        content: 'AGENTS.md instructions',
        id: 'agents-md-user-instructions',
        metadata: {
          title: 'AGENTS.md',
          enabled: true,
          subType: 'user_rule' as const,
          icon: 'folder',
          secondaryText: 'Custom user instructions',
          subTypeLabel: '',
        },
      };

      beforeEach(() => {
        jest
          .mocked(mockAgentsMdResolver.resolveAgentsMdContextItem)
          .mockResolvedValue(mockAgentsMdItem);
      });

      it('includes AGENTS.md context ', async () => {
        const result = await provider.getItems();

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual(mockAgentsMdItem);
        expect(result[1].id).toBe('agent-skills-instructions');
        expect(mockAgentsMdResolver.resolveAgentsMdContextItem).toHaveBeenCalled();
      });

      describe('when chat-rules and AGENTS.md exists', () => {
        beforeEach(() => {
          const mockUserRuleContent = 'User-level rules.';
          const mockWorkspaceRuleContent = 'Workspace-level rules.';

          mockConfigService.set(
            'workspaceFolders',
            createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
          );

          jest
            .mocked(mockFileAccessService.getText)
            .mockResolvedValueOnce(mockUserRuleContent)
            .mockResolvedValueOnce(mockWorkspaceRuleContent);
        });

        it('orders AGENTS.mds after user-level chat rules, before agent skills and project-level chat rules', async () => {
          const result = await provider.getItems();

          expect(result).toHaveLength(4);
          expect(result[0].id).toEqual('user-config-rules');
          expect(result[1]).toEqual(mockAgentsMdItem);
          expect(result[2].id).toEqual('agent-skills-instructions');
          expect(result[3].id).toEqual('workspace-config-rules');
        });
      });
    });
  });

  describe('precalculateOnWorkflowStart', () => {
    it('caches user and workspace rules and getItems uses cached result', async () => {
      const mockUserRuleContent = 'User-level rules.';
      const mockWorkspaceRuleContent = 'Workspace-level rules.';

      mockConfigService.set(
        'workspaceFolders',
        createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
      );
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce(mockUserRuleContent)
        .mockResolvedValueOnce(mockWorkspaceRuleContent);

      await provider.precalculateOnWorkflowStart();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);

      const result = await provider.getItems();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2); // Still only called twice

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        category: 'user_rule',
        content: `The user wants you to adhere to these rules:\n${mockUserRuleContent}`,
        id: 'user-config-rules',
        metadata: {
          title: 'User rules',
          enabled: true,
          subType: 'user_rule',
          icon: 'folder',
          secondaryText: 'User config chat-rules.md',
          subTypeLabel: 'User rules',
        },
      });
      expect(result[1].id).toBe('agent-skills-instructions');
      expect(result[2]).toEqual({
        category: 'user_rule',
        content: `The user wants you to adhere to these rules:\n${mockWorkspaceRuleContent}`,
        id: 'workspace-config-rules',
        metadata: {
          title: 'Workspace rules',
          enabled: true,
          subType: 'user_rule',
          icon: 'folder',
          secondaryText: 'Workspace config chat-rules.md',
          subTypeLabel: 'Workspace rules',
        },
      });
    });

    it('caches errors from precalculation and getItems returns cached error', async () => {
      const mockError = new Error('Precalc failed');

      mockConfigService.set(
        'workspaceFolders',
        createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
      );
      jest.mocked(mockFileAccessService.getText).mockRejectedValue(mockError);

      await provider.precalculateOnWorkflowStart();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2); // User and workspace

      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[UserRuleContextProvider] Could not read user rules file from /home/user/.config/gitlab-lsp/chat-rules.md',
        mockError,
      );
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[UserRuleContextProvider] Could not read workspace rules file from /workspace/.gitlab/duo/chat-rules.md',
        mockError,
      );

      // getItems returns the cached (failed) result, no new calculation
      const result = await provider.getItems();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2); // Still only called twice
      // Agent skills item is always included even when other rules fail
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('agent-skills-instructions');
    });

    it('calling precalculateOnWorkflowStart again forces fresh calculation', async () => {
      mockConfigService.set(
        'workspaceFolders',
        createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
      );

      // First call succeeds
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce('First user rules')
        .mockResolvedValueOnce('First workspace rules');
      await provider.precalculateOnWorkflowStart();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);

      let result = await provider.getItems();
      expect(result[0].content).toContain('First user rules');
      expect(result[2].content).toContain('First workspace rules');
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2); // Cached

      // Second precalculateOnWorkflowStart forces fresh calculation
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce('Updated user rules')
        .mockResolvedValueOnce('Updated workspace rules');
      await provider.precalculateOnWorkflowStart();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(4); // Fresh call

      result = await provider.getItems();
      expect(result[0].content).toContain('Updated user rules');
      expect(result[2].content).toContain('Updated workspace rules');
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(4); // Still cached
    });

    it('getItems without precalculate performs lazy calculation and caches result', async () => {
      const mockUserRuleContent = 'User rules.';
      const mockWorkspaceRuleContent = 'Workspace rules.';

      mockConfigService.set(
        'workspaceFolders',
        createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
      );
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce(mockUserRuleContent)
        .mockResolvedValueOnce(mockWorkspaceRuleContent);

      // First call calculates
      await provider.getItems();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);

      // Second call uses cache
      await provider.getItems();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);

      // Third call still uses cache
      await provider.getItems();
      expect(mockFileAccessService.getText).toHaveBeenCalledTimes(2);
    });

    it('uses GLAB_CONFIG_DIR when set during precalculation', async () => {
      process.env.GLAB_CONFIG_DIR = '/custom/config';
      const mockUserRuleContent = 'Custom config rules.';
      const mockWorkspaceRuleContent = 'Workspace rules.';

      mockConfigService.set(
        'workspaceFolders',
        createFakePartial<WorkspaceFolder[]>([{ uri: 'file:///workspace' }]),
      );
      jest
        .mocked(mockFileAccessService.getText)
        .mockResolvedValueOnce(mockUserRuleContent)
        .mockResolvedValueOnce(mockWorkspaceRuleContent);

      await provider.precalculateOnWorkflowStart();

      expect(mockFileAccessService.getText).toHaveBeenCalledWith('/custom/config/chat-rules.md');
      expect(mockFileAccessService.getText).toHaveBeenCalledWith(
        '/workspace/.gitlab/duo/chat-rules.md',
      );

      const result = await provider.getItems();
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe('user-config-rules');
      expect(result[1].id).toBe('agent-skills-instructions');
      expect(result[2].id).toBe('workspace-config-rules');
    });
  });
});
