import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import type { Dirent, Stats } from 'node:fs';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type Logger, TestLogger } from '@gitlab-org/logging';
import type { FileAccessService } from '@gitlab-org/fs';
import { FileNotFoundError } from '@gitlab-org/fs';
import type { RepositoryDiscoveryService, StatelessRepository } from '@gitlab-org/repositories';
import type { ConfigService, ClientConfig } from '@gitlab-org/config';
import { getTrustedReadableDirectories } from '@gitlab-org/ai-configuration';
import { DefaultAgentSkillsResolver } from './agent_skills_resolver';
import type { AgentSkillsResolver } from './agent_skills_resolver';

jest.mock('node:fs/promises');
jest.mock('node:os');
jest.mock('@gitlab-org/ai-configuration', () => {
  const { isAbsolute, relative } = jest.requireActual('node:path');
  return {
    getTrustedReadableDirectories: jest.fn(),
    isContainedIn: (dirs: string[], p: string) =>
      dirs.some((dir) => {
        const rel = relative(dir, p);
        return !rel.startsWith('..') && !isAbsolute(rel);
      }),
  };
});

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

const VALID_SKILL_CONTENT = `---
name: test-skill
description: A test skill for testing
---

# Test Skill

Some skill instructions here.`;

const VALID_SKILL_WITH_SLASH_COMMAND = `---
name: test-skill
description: A test skill for testing
metadata:
  slash-command: true
---

# Test Skill

Some skill instructions here.`;

const VALID_SKILL_NO_DESC = `---
name: test-skill
---

# Test Skill`;

const NO_FRONTMATTER = `# Test Skill

Some skill instructions here.`;

describe('AgentSkillsResolver', () => {
  let resolver: AgentSkillsResolver;
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
      // Default: realPath is an identity resolve, so symlink targets stay within
      // their trusted directory. Tests for escaping symlinks override this.
      realPath: jest.fn().mockImplementation((path: string) => Promise.resolve(path)),
    });

    mockConfigService = createFakePartial<ConfigService>({
      get: jest.fn<ClientConfig, []>().mockReturnValue(
        createFakePartial<ClientConfig>({
          cwd: undefined,
          workspaceFolders: [],
        }),
      ),
    });

    // Default: global skill directories don't exist (ENOENT)
    jest.mocked(homedir).mockReturnValue('/home/testuser');
    jest
      .mocked(getTrustedReadableDirectories)
      .mockReturnValue(['/home/testuser/.agents', '/home/testuser/.gitlab/duo']);
    (readdir as jest.Mock).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    resolver = new DefaultAgentSkillsResolver(
      mockLogger,
      mockRepositoryDiscoveryService,
      [mockFileAccessService],
      mockConfigService,
    );
  });

  afterEach(() => {
    delete process.env.GLAB_CONFIG_DIR;
  });

  describe('parseFrontmatter', () => {
    describe('when content has valid frontmatter', () => {
      it('should extract name, description, body, and slashCommand as false', () => {
        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(VALID_SKILL_CONTENT);
        expect(result).toEqual({
          ok: true,
          value: {
            name: 'test-skill',
            description: 'A test skill for testing',
            body: '# Test Skill\n\nSome skill instructions here.',
            slashCommand: false,
          },
        });
      });
    });

    describe('when frontmatter uses CRLF line endings', () => {
      it('should parse it the same as LF', () => {
        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(
          VALID_SKILL_CONTENT.replace(/\n/g, '\r\n'),
        );

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'test-skill',
            description: 'A test skill for testing',
            body: '# Test Skill\n\nSome skill instructions here.',
            slashCommand: false,
          },
        });
      });
    });

    describe('when content has a leading UTF-8 BOM', () => {
      it('should parse it as if the BOM were absent', () => {
        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(
          `\uFEFF${VALID_SKILL_CONTENT}`,
        );

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'test-skill',
            description: 'A test skill for testing',
            body: '# Test Skill\n\nSome skill instructions here.',
            slashCommand: false,
          },
        });
      });
    });

    describe('when metadata has slash-command: true', () => {
      it('should extract slashCommand as true', () => {
        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(
          VALID_SKILL_WITH_SLASH_COMMAND,
        );

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'test-skill',
            description: 'A test skill for testing',
            body: '# Test Skill\n\nSome skill instructions here.',
            slashCommand: true,
          },
        });
      });
    });

    describe('when frontmatter is missing description', () => {
      it('should return null', () => {
        const { ok } = DefaultAgentSkillsResolver.parseFrontmatterResult(VALID_SKILL_NO_DESC);
        expect(ok).toBeFalsy();
      });
    });

    describe('when content has no frontmatter', () => {
      it('should return null', () => {
        const { ok } = DefaultAgentSkillsResolver.parseFrontmatterResult(NO_FRONTMATTER);
        expect(ok).toBeFalsy();
      });
    });

    describe('when frontmatter values are quoted', () => {
      it('should strip quotes', () => {
        const content = `---
name: "quoted-skill"
description: 'A quoted description'
---

Body`;

        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(content);

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'quoted-skill',
            description: 'A quoted description',
            body: 'Body',
            slashCommand: false,
          },
        });
      });
    });

    describe('when description contains colons', () => {
      it('should parse correctly', () => {
        const content = `---
name: my-skill
description: "Note: this value has colons: in it"
---

Body`;

        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(content);

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'my-skill',
            description: 'Note: this value has colons: in it',
            body: 'Body',
            slashCommand: false,
          },
        });
      });
    });

    describe('when description uses YAML folded scalar', () => {
      it('should parse the multi-line value', () => {
        const content = `---
name: my-skill
description: >
  A long description
  that spans multiple lines
---

Body`;

        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(content);

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'my-skill',
            description: 'A long description that spans multiple lines\n',
            body: 'Body',
            slashCommand: false,
          },
        });
      });
    });

    describe('when frontmatter has YAML comments', () => {
      it('should ignore comments', () => {
        const content = `---
name: my-skill # this is a comment
description: A skill with comments
---

Body`;

        const result = DefaultAgentSkillsResolver.parseFrontmatterResult(content);

        expect(result).toEqual({
          ok: true,
          value: {
            name: 'my-skill',
            description: 'A skill with comments',
            body: 'Body',
            slashCommand: false,
          },
        });
      });
    });

    describe('when frontmatter YAML is invalid', () => {
      it('should return null', () => {
        const content = `---
name: [invalid yaml
description: broken
---

Body`;

        const { ok } = DefaultAgentSkillsResolver.parseFrontmatterResult(content);
        expect(ok).toBeFalsy();
      });
    });

    describe('when description has an unquoted colon (the original bug)', () => {
      it('should return null due to YAML parse error', () => {
        const content = `---
name: my-skill
description: Note: unquoted colon
---

Body`;

        const { ok } = DefaultAgentSkillsResolver.parseFrontmatterResult(content);

        // YAML parses "Note: unquoted colon" as { Note: 'unquoted colon' }, not a string
        // so schema validation fails
        expect(ok).toBeFalsy();
      });
    });
  });

  describe('skill load warnings', () => {
    describe('when no skill files exist', () => {
      it('should return no warnings', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();
        expect(warnings).toEqual([]);
      });
    });

    describe('when a skill file has no frontmatter', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/bad-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/bad-skill/SKILL.md': NO_FRONTMATTER,
        });
      });

      it('should return a warning from getSkillSlashCommands', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();

        expect(warnings).toHaveLength(1);
        expect(warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
        expect(warnings[0].reason).toContain('missing YAML frontmatter');
      });
    });

    describe('when a skill file has invalid YAML', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/bad-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/bad-skill/SKILL.md': `---
name: [invalid yaml
description: broken
---

Body`,
        });
      });

      it('should return a warning with a reason mentioning parse failure', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();

        expect(warnings).toHaveLength(1);
        expect(warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
        expect(warnings[0].reason).toContain('invalid YAML frontmatter');
      });
    });

    describe('when a skill file is missing required fields', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/bad-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/bad-skill/SKILL.md': VALID_SKILL_NO_DESC,
        });
      });

      it('should return a warning', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();

        expect(warnings).toHaveLength(1);
        expect(warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
        expect(warnings[0].reason).toContain('missing required frontmatter field(s): description');
      });
    });

    describe('when a skill file has an unquoted colon in description', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/bad-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/bad-skill/SKILL.md': `---
name: my-skill
description: Note: unquoted colon
---

Body`,
        });
      });

      it('should return a warning identifying the description field', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();

        expect(warnings).toHaveLength(1);
        expect(warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
        expect(warnings[0].reason).toContain('description');
      });
    });

    describe('when a mix of valid and invalid skill files exist', () => {
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
            .mockResolvedValue([
              '.agents/skills/good-skill/SKILL.md',
              '.agents/skills/bad-skill/SKILL.md',
            ]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/good-skill/SKILL.md': VALID_SKILL_CONTENT,
          '/workspace/.agents/skills/bad-skill/SKILL.md': NO_FRONTMATTER,
        });
      });

      it('should load valid skills and warn about invalid ones', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>test-skill</name>');

        const { warnings } = await resolver.getSkillSlashCommands();
        expect(warnings).toHaveLength(1);
        expect(warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
      });
    });

    describe('when all skill files are valid', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/good-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/good-skill/SKILL.md': VALID_SKILL_CONTENT,
        });
      });

      it('should return no warnings', async () => {
        const { warnings } = await resolver.getSkillSlashCommands();
        expect(warnings).toEqual([]);
      });
    });

    describe('across multiple and concurrent calls', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/bad-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/bad-skill/SKILL.md': NO_FRONTMATTER,
        });
      });

      it('should not accumulate warnings across repeated calls', async () => {
        const first = await resolver.getSkillSlashCommands();
        expect(first.warnings).toHaveLength(1);

        const second = await resolver.getSkillSlashCommands();
        expect(second.warnings).toHaveLength(1);
      });

      it('should bind warnings to the resolve each caller awaited', async () => {
        const [, slashCommands] = await Promise.all([
          resolver.resolveAgentSkillsContextItem(),
          resolver.getSkillSlashCommands(),
        ]);

        expect(slashCommands.warnings).toHaveLength(1);
        expect(slashCommands.warnings[0].path).toBe('/workspace/.agents/skills/bad-skill/SKILL.md');
      });
    });
  });

  describe('resolveAgentSkillsContextItem', () => {
    describe('when no SKILL.md files exist (no workspace folders, global disabled)', () => {
      it('should return a "no skills found" context item with fallback message', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).toEqual({
          category: 'user_rule',
          content: 'No agent skills were discovered (no skill locations were configured).',
          id: 'agent-skills-instructions',
          metadata: {
            title: 'Agent Skills',
            enabled: true,
            subType: 'user_rule',
            icon: 'document',
            secondaryText: '',
            subTypeLabel: 'No agent skills found',
          },
        });
      });
    });

    describe('when workspace has repos but no skills are found', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            enableGlobalSkills: false,
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);
      });

      it('should list the searched workspace glob locations in the empty message', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toContain('No agent skills were discovered.');
        expect(result.content).toContain('Searched the following locations:');
        expect(result.content).toContain('.agents/skills/*/');
        expect(result.content).toContain('**/.agents/skills/*/');
        expect(result.content).toContain('skills/*/');
        expect(result.content).toContain('**/skills/*/');
      });

      it('should not include global locations when global skills are disabled', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).not.toContain('~/.agents/skills/*/');
      });
    });

    describe('when workspace has repos and global skills are enabled but nothing found', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            enableGlobalSkills: true,
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);
      });

      it('should list both workspace and global searched locations', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toContain('No agent skills were discovered.');
        expect(result.content).toContain('Searched the following locations:');
        expect(result.content).toContain('.agents/skills/*/');
        expect(result.content).toContain('~/.agents/skills/*/');
        expect(result.content).toContain('~/.gitlab/duo/skills/*/');
      });

      it('should list workspace locations before global locations', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();
        const content = result.content ?? '';

        const wsIndex = content.indexOf('.agents/skills/*/');
        const globalIndex = content.indexOf('~/.agents/skills/*/');
        expect(wsIndex).toBeLessThan(globalIndex);
      });
    });

    describe('when workspace has repos and nothing is found', () => {
      it('should call getRepositoriesForWorkspace only once per workspace folder (repo cache)', async () => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            enableGlobalSkills: false,
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        await resolver.resolveAgentSkillsContextItem();

        // Should be called exactly once: the cache prevents the second call
        // that would otherwise happen in #getWorkspaceSearchedLocations.
        expect(mockRepositoryDiscoveryService.getRepositoriesForWorkspace).toHaveBeenCalledTimes(1);
      });
    });

    describe('when workspace folders use non-file:// URI schemes', () => {
      it('should return a "no skills found" context item with fallback message for non-file:// workspace folders', async () => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            workspaceFolders: [
              {
                uri: 'adt://my-sap-server/sap/bc/adt/packages/zmy_package',
                name: 'SAP ABAP',
              },
            ],
            enableGlobalSkills: false,
          }),
        );

        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toBe(
          'No agent skills were discovered (no skill locations were configured).',
        );
        expect(mockRepositoryDiscoveryService.getRepositoriesForWorkspace).not.toHaveBeenCalled();
      });
    });

    describe('when workspace has skill files', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/my-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);
      });

      describe('when skill file has valid frontmatter', () => {
        beforeEach(() => {
          mockFileGetText(mockFileAccessService, {
            '/workspace/.agents/skills/my-skill/SKILL.md': VALID_SKILL_CONTENT,
          });
        });

        it('should return a context item with skill frontmatter as XML', async () => {
          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result).not.toBeNull();
          expect(result?.content).toContain('<name>test-skill</name>');
          expect(result?.content).toContain('<description>A test skill for testing</description>');
          expect(result?.content).not.toContain('Some skill instructions here.');
        });

        it('should format metadata correctly', async () => {
          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result).toEqual({
            category: 'user_rule',
            content: expect.stringContaining('<name>test-skill</name>'),
            id: 'agent-skills-instructions',
            metadata: {
              title: 'Agent Skills',
              enabled: true,
              subType: 'user_rule',
              icon: 'document',
              secondaryText: 'test-skill',
              subTypeLabel: '1 agent skill included',
            },
          });
        });

        it('should wrap skills in available_skills XML', async () => {
          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result?.content).toContain('<available_skills>');
          expect(result?.content).toContain('</available_skills>');
          expect(result?.content).toContain('<skill>');
          expect(result?.content).toContain('</skill>');
          expect(result?.content).toContain(
            '<location>/workspace/.agents/skills/my-skill/SKILL.md</location>',
          );
        });
      });

      describe('when skill file has no valid frontmatter', () => {
        beforeEach(() => {
          mockFileGetText(mockFileAccessService, {
            '/workspace/.agents/skills/my-skill/SKILL.md': NO_FRONTMATTER,
          });
        });

        it('should return a "no skills found" context item listing searched locations', async () => {
          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result.content).toContain('No agent skills were discovered.');
          expect(result.content).toContain('Searched the following locations:');
          expect(result.content).toContain('.agents/skills/*/');
        });
      });

      describe('when skill file read fails', () => {
        it('should handle FileNotFoundError gracefully and list searched locations', async () => {
          mockFileGetText(mockFileAccessService, {});

          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result.content).toContain('No agent skills were discovered.');
          expect(result.content).toContain('Searched the following locations:');
        });

        it('should handle other errors gracefully and list searched locations', async () => {
          jest
            .mocked(mockFileAccessService.getText)
            .mockRejectedValue(new Error('Permission denied'));

          const result = await resolver.resolveAgentSkillsContextItem();

          expect(result.content).toContain('No agent skills were discovered.');
          expect(result.content).toContain('Searched the following locations:');
        });
      });
    });

    describe('when multiple skill files exist', () => {
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
            .mockResolvedValue([
              '.agents/skills/skill-a/SKILL.md',
              '.agents/skills/skill-b/SKILL.md',
            ]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/skill-a/SKILL.md': `---
name: skill-a
description: First skill
---

Skill A content`,
          '/workspace/.agents/skills/skill-b/SKILL.md': `---
name: skill-b
description: Second skill
---

Skill B content`,
        });
      });

      it('should include all skills as frontmatter XML', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('<name>skill-a</name>');
        expect(result?.content).toContain('<name>skill-b</name>');
        expect(result?.content).toContain('<description>First skill</description>');
        expect(result?.content).toContain('<description>Second skill</description>');
        expect(result?.content).not.toContain('Skill A content');
        expect(result?.content).not.toContain('Skill B content');
      });

      it('should report correct count in metadata', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.metadata?.subTypeLabel).toBe('2 agent skills included');
        expect(result?.metadata?.secondaryText).toBe('skill-a, skill-b');
      });
    });

    describe('when workspace has symlinked skill directories', () => {
      const symlinkDirent = (name: string) =>
        createFakePartial<Dirent>({
          name,
          isSymbolicLink: () => true,
          isDirectory: () => false,
        });

      const dirStats = createFakePartial<Stats>({ isDirectory: () => true });

      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );
      });

      it('discovers a skill linked in as a symlinked directory', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          // git ls-files cannot see inside a symlinked directory, so getFiles is empty.
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('linked-skill')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (stat as jest.Mock).mockResolvedValue(dirStats);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/linked-skill/SKILL.md': `---
name: linked-skill
description: A symlinked skill
---

Linked skill content`,
        });

        const skills = await resolver.getSkills();

        expect(skills).toEqual([{ name: 'linked-skill', description: 'A symlinked skill' }]);
      });

      it('includes both git-tracked and symlinked skills without duplicates', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/real-skill/SKILL.md']),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('linked-skill')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (stat as jest.Mock).mockResolvedValue(dirStats);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/real-skill/SKILL.md': `---
name: real-skill
description: A tracked skill
---

Real skill content`,
          '/workspace/.agents/skills/linked-skill/SKILL.md': `---
name: linked-skill
description: A symlinked skill
---

Linked skill content`,
        });

        const skills = await resolver.getSkills();

        expect(skills).toHaveLength(2);
        expect(skills).toEqual(
          expect.arrayContaining([
            { name: 'real-skill', description: 'A tracked skill' },
            { name: 'linked-skill', description: 'A symlinked skill' },
          ]),
        );
      });

      it('skips dangling symlinks without throwing', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('dangling')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (stat as jest.Mock).mockRejectedValue(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );

        const skills = await resolver.getSkills();

        expect(skills).toEqual([]);
      });

      it('skips and warns when the symlink target cannot be stat-ed (non-ENOENT)', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('unreadable')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (stat as jest.Mock).mockRejectedValue(
          Object.assign(new Error('EACCES'), { code: 'EACCES' }),
        );
        const warnSpy = jest.spyOn(mockLogger, 'warn');

        const skills = await resolver.getSkills();

        expect(skills).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('/workspace/.agents/skills/unreadable'),
          expect.objectContaining({ code: 'EACCES' }),
        );
      });

      it('warns when the symlink target stat fails with an error lacking a code', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('weird')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        // A plain Error with no `code` property must not be silently swallowed:
        // it is not ENOENT, so it should be surfaced like any other failure.
        const codelessError = new Error('permission denied');
        (stat as jest.Mock).mockRejectedValue(codelessError);
        const warnSpy = jest.spyOn(mockLogger, 'warn');

        const skills = await resolver.getSkills();

        expect(skills).toEqual([]);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('/workspace/.agents/skills/weird'),
          codelessError,
        );
      });

      it('skips a symlink whose target is a regular file', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/.agents/skills') {
            return Promise.resolve([symlinkDirent('linked-file')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        // Symlink resolves, but the target is a file, not a directory.
        (stat as jest.Mock).mockResolvedValue(
          createFakePartial<Stats>({ isDirectory: () => false }),
        );

        const skills = await resolver.getSkills();

        expect(skills).toEqual([]);
      });

      it('handles a permission error reading the skill base directory', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue([]),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockRejectedValue(
          Object.assign(new Error('EACCES'), { code: 'EACCES' }),
        );

        const skills = await resolver.getSkills();

        expect(skills).toEqual([]);
      });

      it('discovers a symlinked skill in a nested base dir derived from a git path', async () => {
        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          // A real skill lives at packages/foo/skills/real-skill; the symlink sits beside it.
          getFiles: jest.fn().mockResolvedValue(['packages/foo/skills/real-skill/SKILL.md']),
        });
        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((dir: string) => {
          if (dir === '/workspace/packages/foo/skills') {
            return Promise.resolve([symlinkDirent('linked-skill')]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });
        (stat as jest.Mock).mockResolvedValue(dirStats);

        mockFileGetText(mockFileAccessService, {
          '/workspace/packages/foo/skills/real-skill/SKILL.md': `---
name: real-skill
description: A tracked skill
---

Real skill content`,
          '/workspace/packages/foo/skills/linked-skill/SKILL.md': `---
name: linked-skill
description: A symlinked skill
---

Linked skill content`,
        });

        const skills = await resolver.getSkills();

        expect(skills).toEqual(
          expect.arrayContaining([
            { name: 'real-skill', description: 'A tracked skill' },
            { name: 'linked-skill', description: 'A symlinked skill' },
          ]),
        );
        expect(skills).toHaveLength(2);
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
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/skill-a/SKILL.md']),
        });

        const mockRepo2 = createFakePartial<StatelessRepository>({
          fsPath: '/workspace2',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/skill-b/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockImplementation((workspacePath: string) => {
            if (workspacePath === '/workspace1') return Promise.resolve([mockRepo1]);
            if (workspacePath === '/workspace2') return Promise.resolve([mockRepo2]);
            return Promise.resolve([]);
          });

        mockFileGetText(mockFileAccessService, {
          '/workspace1/.agents/skills/skill-a/SKILL.md': `---
name: skill-a
description: First workspace skill
---

Skill A content`,
          '/workspace2/.agents/skills/skill-b/SKILL.md': `---
name: skill-b
description: Second workspace skill
---

Skill B content`,
        });
      });

      it('should include skills from all workspaces', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('<name>skill-a</name>');
        expect(result?.content).toContain('<name>skill-b</name>');
      });
    });

    describe('when skills are in root skills/ directory (without .agents/ prefix)', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['skills/my-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/skills/my-skill/SKILL.md': VALID_SKILL_CONTENT,
        });
      });

      it('should detect and resolve the skill frontmatter', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>test-skill</name>');
        expect(result?.content).toContain('<description>A test skill for testing</description>');
        expect(result?.content).not.toContain('Some skill instructions here.');
      });

      it('should include the absolute path as location', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain(
          '<location>/workspace/skills/my-skill/SKILL.md</location>',
        );
      });
    });

    describe('when skills exist in both .agents/skills/ and skills/ directories', () => {
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
            .mockResolvedValue(['.agents/skills/skill-a/SKILL.md', 'skills/skill-b/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/skill-a/SKILL.md': `---
name: skill-a
description: Agents dir skill
---

Skill A content`,
          '/workspace/skills/skill-b/SKILL.md': `---
name: skill-b
description: Root skills dir skill
---

Skill B content`,
        });
      });

      it('should include skills from both directories as frontmatter only', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('<name>skill-a</name>');
        expect(result?.content).toContain('<description>Agents dir skill</description>');
        expect(result?.content).toContain('<name>skill-b</name>');
        expect(result?.content).toContain('<description>Root skills dir skill</description>');
        expect(result?.content).not.toContain('Skill A content');
        expect(result?.content).not.toContain('Skill B content');
      });

      it('should report correct count', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.metadata?.subTypeLabel).toBe('2 agent skills included');
      });
    });

    describe('when skills/ directory is nested in a subdirectory', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['packages/foo/skills/nested-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/packages/foo/skills/nested-skill/SKILL.md': `---
name: nested-skill
description: A nested skill
---

Nested skill content`,
        });
      });

      it('should detect skills in nested directories', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>nested-skill</name>');
        expect(result?.content).toContain('<description>A nested skill</description>');
        expect(result?.content).not.toContain('Nested skill content');
      });
    });

    describe('when no repository is detected in the workspace', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([]);
      });

      it('should return a "no skills found" context item with fallback message (no repos to walk)', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        // No repos means no workspace glob locations can be computed; global is disabled.
        expect(result.content).toBe(
          'No agent skills were discovered (no skill locations were configured).',
        );
      });
    });
  });

  describe('global skills', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockReturnValue(
        createFakePartial<ClientConfig>({
          cwd: undefined,
          workspaceFolders: [],
          enableGlobalSkills: true,
        }),
      );
    });

    function mockDirent(name: string, isDir: boolean): Dirent {
      return createFakePartial<Dirent>({
        name,
        isDirectory: () => isDir,
        isSymbolicLink: () => false,
      });
    }

    function mockSymlinkDirent(name: string): Dirent {
      return createFakePartial<Dirent>({
        name,
        isDirectory: () => false,
        isSymbolicLink: () => true,
      });
    }

    describe('when global skills exist in ~/.agents/skills/', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('my-global-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/my-global-skill/SKILL.md': `---
name: my-global-skill
description: A global skill
---

Global skill body`,
        });
      });

      it('should include the global skill in context item', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>my-global-skill</name>');
        expect(result?.content).toContain('<description>A global skill</description>');
      });

      it('should include the absolute path as location', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain(
          '<location>/home/testuser/.agents/skills/my-global-skill/SKILL.md</location>',
        );
      });

      it('should use tilde-prefixed display path', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.metadata?.secondaryText).toBe('my-global-skill');
      });
    });

    describe('when a global skill is a symlinked directory (user-scope plugin install)', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockSymlinkDirent('linked-skill')] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        (stat as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills/linked-skill') {
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.gitlab/duo/skills/linked-skill/SKILL.md': `---
name: linked-skill
description: A symlinked global skill
---

Body`,
        });
      });

      it('resolves the skill through the symlink', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>linked-skill</name>');
      });
    });

    describe('when a global skill is a dangling symlink', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockSymlinkDirent('dangling-skill')] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        (stat as jest.Mock).mockRejectedValue(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
        );
      });

      it('skips the dangling symlink without throwing', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('No agent skills were discovered.');
      });
    });

    describe('when a global skill symlink points outside the trusted directories', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockSymlinkDirent('escaped-skill')] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        (stat as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills/escaped-skill') {
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        // The symlink resolves to /etc, which is a directory but outside every
        // trusted directory. Canonical trusted dirs resolve to themselves.
        jest.mocked(mockFileAccessService.realPath).mockImplementation((path: string) => {
          if (path === '/home/testuser/.gitlab/duo/skills/escaped-skill') {
            return Promise.resolve('/etc');
          }
          return Promise.resolve(path);
        });

        mockFileGetText(mockFileAccessService, {
          '/etc/SKILL.md': `---
name: escaped-skill
description: An out-of-bounds skill
---

Body`,
        });
      });

      it('skips the symlink and does not read the out-of-bounds target', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('No agent skills were discovered.');
        expect(mockFileAccessService.getText).not.toHaveBeenCalledWith('/etc/SKILL.md');
      });
    });

    describe('when a global skill SKILL.md resolves outside trusted dirs (nested symlink)', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockDirent('nested-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        // The directory itself is a plain directory (it passes the directory-level check),
        // but the SKILL.md inside is a symlink whose canonical target escapes trusted dirs.
        // realPath collapses the full chain, so the read-time check catches it.
        jest.mocked(mockFileAccessService.realPath).mockImplementation((path: string) => {
          if (path === '/home/testuser/.gitlab/duo/skills/nested-skill/SKILL.md') {
            return Promise.resolve('/etc/passwd-skill/SKILL.md');
          }
          return Promise.resolve(path);
        });

        // Following the symlink (as the unhardened code would) yields the out-of-bounds
        // content, so the test fails unless the read-time containment check rejects it.
        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.gitlab/duo/skills/nested-skill/SKILL.md': `---
name: nested-skill
description: An out-of-bounds nested skill
---

Body`,
        });
      });

      it('skips the skill and never reads the out-of-bounds target', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('No agent skills were discovered.');
        expect(mockFileAccessService.getText).not.toHaveBeenCalledWith(
          '/home/testuser/.gitlab/duo/skills/nested-skill/SKILL.md',
        );
      });
    });

    describe('when a symlinked skill passes the directory check but escapes at read time (TOCTOU)', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockSymlinkDirent('toctou-skill')] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        (stat as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills/toctou-skill') {
            return Promise.resolve({ isDirectory: () => true });
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        // The directory symlink resolves inside a trusted dir (passes the up-front check),
        // but by read time the SKILL.md resolves outside it (symlink swapped underneath us).
        jest.mocked(mockFileAccessService.realPath).mockImplementation((path: string) => {
          if (path === '/home/testuser/.gitlab/duo/skills/toctou-skill/SKILL.md') {
            return Promise.resolve('/etc/SKILL.md');
          }
          return Promise.resolve(path);
        });

        // The unhardened code reads the pre-check path and would leak this content.
        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.gitlab/duo/skills/toctou-skill/SKILL.md': `---
name: toctou-skill
description: An out-of-bounds skill
---

Body`,
        });
      });

      it('re-checks at read time and does not read the escaped target', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('No agent skills were discovered.');
        expect(mockFileAccessService.getText).not.toHaveBeenCalledWith(
          '/home/testuser/.gitlab/duo/skills/toctou-skill/SKILL.md',
        );
      });
    });

    describe('when global skills exist in getDuoConfigDir()/skills/', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockDirent('duo-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.gitlab/duo/skills/duo-skill/SKILL.md': `---
name: duo-skill
description: A duo config skill
---

Body`,
        });
      });

      it('should include the skill from duo config directory', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>duo-skill</name>');
        expect(result?.content).toContain(
          '<location>/home/testuser/.gitlab/duo/skills/duo-skill/SKILL.md</location>',
        );
      });
    });

    describe('when GLAB_CONFIG_DIR is set', () => {
      beforeEach(() => {
        jest
          .mocked(getTrustedReadableDirectories)
          .mockReturnValue(['/home/testuser/.agents', '/custom/config']);

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/custom/config/skills') {
            return Promise.resolve([mockDirent('custom-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/custom/config/skills/custom-skill/SKILL.md': `---
name: custom-skill
description: A skill from custom config dir
---

Body`,
        });
      });

      it('should use custom config directory from trusted directories', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>custom-skill</name>');
      });
    });

    describe('when a workspace skill and global skill share the same name', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            enableGlobalSkills: true,
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/shared-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('shared-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/shared-skill/SKILL.md': `---
name: shared-skill
description: Workspace version
---

Workspace body`,
          '/home/testuser/.agents/skills/shared-skill/SKILL.md': `---
name: shared-skill
description: Global version
---

Global body`,
        });
      });

      it('should use the workspace skill and discard the global one', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<description>Workspace version</description>');
        expect(result?.content).not.toContain('<description>Global version</description>');
      });

      it('should only include the skill once', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.metadata?.subTypeLabel).toBe('1 agent skill included');
      });
    });

    describe('when both workspace and global skills exist with different names', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
            enableGlobalSkills: true,
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/ws-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('global-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/ws-skill/SKILL.md': `---
name: ws-skill
description: A workspace skill
---

Body`,
          '/home/testuser/.agents/skills/global-skill/SKILL.md': `---
name: global-skill
description: A global skill
---

Body`,
        });
      });

      it('should include both skills', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result?.content).toContain('<name>ws-skill</name>');
        expect(result?.content).toContain('<name>global-skill</name>');
        expect(result?.metadata?.subTypeLabel).toBe('2 agent skills included');
      });
    });

    describe('when global skills directory does not exist', () => {
      it('should return a "no skills found" context item listing global searched locations', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toContain('No agent skills were discovered.');
        expect(result.content).toContain('Searched the following locations:');
        expect(result.content).toContain('~/.agents/skills/*/');
        expect(result.content).toContain('~/.gitlab/duo/skills/*/');
      });
    });

    describe('when global skills directory has a permission error', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockRejectedValue(
          Object.assign(new Error('EACCES'), { code: 'EACCES' }),
        );
      });

      it('should return a "no skills found" context item listing global searched locations', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toContain('No agent skills were discovered.');
        expect(result.content).toContain('Searched the following locations:');
        expect(result.content).toContain('~/.agents/skills/*/');
      });
    });

    describe('when trusted directories only include duo config dir', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue(['/home/testuser/.gitlab/duo']);

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.gitlab/duo/skills') {
            return Promise.resolve([mockDirent('duo-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.gitlab/duo/skills/duo-skill/SKILL.md': `---
name: duo-skill
description: Found via duo config
---

Body`,
        });
      });

      it('should still discover skills from duo config directory', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>duo-skill</name>');
      });
    });

    describe('when trusted directories only include ~/.agents', () => {
      beforeEach(() => {
        jest.mocked(getTrustedReadableDirectories).mockReturnValue(['/home/testuser/.agents']);

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('home-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/home-skill/SKILL.md': `---
name: home-skill
description: Found in home agents dir
---

Body`,
        });
      });

      it('should still discover skills from ~/.agents/skills/', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.content).toContain('<name>home-skill</name>');
      });
    });

    describe('when global skill has slash-command: true', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('global-slash-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/global-slash-skill/SKILL.md': `---
name: global-slash-skill
description: A global skill with slash command
metadata:
  slash-command: true
---

Body`,
        });
      });

      it('should appear in slash commands', async () => {
        const { commands } = await resolver.getSkillSlashCommands();

        expect(commands).toEqual([
          {
            name: '/global-slash-skill',
            description: 'A global skill with slash command',
            skillName: 'global-slash-skill',
          },
        ]);
      });
    });

    describe('when global directory contains non-directory entries', () => {
      beforeEach(() => {
        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([
              mockDirent('valid-skill', true),
              mockDirent('README.md', false),
              mockDirent('.DS_Store', false),
            ] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/valid-skill/SKILL.md': `---
name: valid-skill
description: Only skill directories should be picked up
---

Body`,
        });
      });

      it('should only pick up directories, ignoring files', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result).not.toBeNull();
        expect(result?.metadata?.subTypeLabel).toBe('1 agent skill included');
        expect(result?.content).toContain('<name>valid-skill</name>');
      });
    });

    describe('when enableGlobalSkills is false', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [],
            enableGlobalSkills: false,
          }),
        );

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('hidden-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/hidden-skill/SKILL.md': `---
name: hidden-skill
description: Should not be discovered
---

Body`,
        });
      });

      it('should not discover global skills and use fallback message (no locations configured)', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toBe(
          'No agent skills were discovered (no skill locations were configured).',
        );
      });

      it('should not include global skills in slash commands', async () => {
        const { commands } = await resolver.getSkillSlashCommands();

        expect(commands).toEqual([]);
      });
    });

    describe('when enableGlobalSkills is undefined', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [],
          }),
        );

        (readdir as jest.Mock).mockImplementation((path: unknown) => {
          if (String(path) === '/home/testuser/.agents/skills') {
            return Promise.resolve([mockDirent('hidden-skill', true)] as unknown as Dirent[]);
          }
          return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        });

        mockFileGetText(mockFileAccessService, {
          '/home/testuser/.agents/skills/hidden-skill/SKILL.md': `---
name: hidden-skill
description: Should not be discovered
---

Body`,
        });
      });

      it('should not discover global skills and use fallback message (no locations configured)', async () => {
        const result = await resolver.resolveAgentSkillsContextItem();

        expect(result.content).toBe(
          'No agent skills were discovered (no skill locations were configured).',
        );
      });
    });
  });

  describe('getSkillSlashCommands', () => {
    describe('when no skills have slash-command metadata', () => {
      beforeEach(() => {
        (mockConfigService.get as jest.Mock).mockReturnValue(
          createFakePartial<ClientConfig>({
            cwd: undefined,
            workspaceFolders: [{ uri: 'file:///workspace', name: 'ws' }],
          }),
        );

        const mockRepo = createFakePartial<StatelessRepository>({
          fsPath: '/workspace',
          getFiles: jest.fn().mockResolvedValue(['.agents/skills/my-skill/SKILL.md']),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/my-skill/SKILL.md': VALID_SKILL_CONTENT,
        });
      });

      it('should return an empty array', async () => {
        const { commands } = await resolver.getSkillSlashCommands();

        expect(commands).toEqual([]);
      });
    });

    describe('when skills have slash-command: true in metadata', () => {
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
            .mockResolvedValue([
              '.agents/skills/skill-a/SKILL.md',
              '.agents/skills/skill-b/SKILL.md',
            ]),
        });

        jest
          .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
          .mockResolvedValue([mockRepo]);

        mockFileGetText(mockFileAccessService, {
          '/workspace/.agents/skills/skill-a/SKILL.md': `---
name: skill-a
description: First skill
metadata:
  slash-command: true
---

Skill A content`,
          '/workspace/.agents/skills/skill-b/SKILL.md': `---
name: skill-b
description: Second skill
---

Skill B content`,
        });
      });

      it('should return only skills with slash-command: true', async () => {
        const { commands } = await resolver.getSkillSlashCommands();

        expect(commands).toEqual([
          {
            name: '/skill-a',
            description: 'First skill',
            skillName: 'skill-a',
          },
        ]);
      });
    });
  });

  describe('getSkills', () => {
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
          .mockResolvedValue([
            '.agents/skills/skill-a/SKILL.md',
            '.agents/skills/skill-b/SKILL.md',
          ]),
      });

      jest
        .mocked(mockRepositoryDiscoveryService.getRepositoriesForWorkspace)
        .mockResolvedValue([mockRepo]);

      mockFileGetText(mockFileAccessService, {
        '/workspace/.agents/skills/skill-a/SKILL.md': `---
name: skill-a
description: First skill
metadata:
  slash-command: true
---

Skill A content`,
        '/workspace/.agents/skills/skill-b/SKILL.md': `---
name: skill-b
description: Second skill
---

Skill B content`,
      });
    });

    it('returns all resolved skills, including those without slash-command metadata', async () => {
      const result = await resolver.getSkills();

      expect(result).toEqual([
        { name: 'skill-a', description: 'First skill' },
        { name: 'skill-b', description: 'Second skill' },
      ]);
    });
  });
});
