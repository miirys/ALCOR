import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ControllerApi } from '../commands/tui/controller_api';
import { DefaultSlashCommandService, SlashCommandService } from './slash_command_service';
import { SlashCommandAction, type SlashCommandHandler } from './slash_command_handler';

describe('SlashCommandService', () => {
  let service: SlashCommandService;
  let logger: TestLogger;
  let mockHandler: SlashCommandHandler;

  beforeEach(() => {
    logger = new TestLogger();
    mockHandler = createFakePartial<SlashCommandHandler>({
      command: {
        name: '/new',
        description: 'Start a new chat session',
        action: SlashCommandAction.NewSession,
      },
      execute: jest
        .fn<(api: ControllerApi, args?: string[]) => Promise<void>>()
        .mockResolvedValue(undefined),
    });
    service = new DefaultSlashCommandService(logger, [mockHandler]);
  });

  describe('constructor', () => {
    it('should automatically register commands from handlers', () => {
      const commands = service.getCommands();

      expect(commands).toHaveLength(1);
      expect(commands[0].name).toBe('/new');
      expect(commands[0].description).toBe('Start a new chat session');
      expect(commands[0].action).toBe(SlashCommandAction.NewSession);
    });

    it('should handle empty handler list', () => {
      const emptyService = new DefaultSlashCommandService(logger, []);
      const commands = emptyService.getCommands();

      expect(commands).toHaveLength(0);
    });

    it('should register multiple handlers', () => {
      const handler2 = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/test',
          description: 'Test command',
          action: 'test_action' as SlashCommandAction,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const multiService = new DefaultSlashCommandService(logger, [mockHandler, handler2]);
      const commands = multiService.getCommands();

      expect(commands).toHaveLength(2);
      expect(commands.map((c) => c.name)).toContain('/new');
      expect(commands.map((c) => c.name)).toContain('/test');
    });
  });

  describe('getCommands', () => {
    it('should return built-in commands after construction', () => {
      const commands = service.getCommands();

      expect(commands.length).toBeGreaterThan(0);
    });

    it('should exclude internal commands', () => {
      const internalHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/__internal',
          description: 'Internal-only handler',
          action: 'internal_action' as SlashCommandAction,
          internal: true,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const serviceWithInternal = new DefaultSlashCommandService(logger, [
        mockHandler,
        internalHandler,
      ]);
      const commands = serviceWithInternal.getCommands();

      expect(commands.map((c) => c.name)).toContain('/new');
      expect(commands.map((c) => c.name)).not.toContain('/__internal');
    });
  });

  describe('isCommand', () => {
    it('should return true for registered command', () => {
      expect(service.isCommand('/new')).toBe(true);
    });

    it('should return false for unregistered command', () => {
      expect(service.isCommand('/nonexistent')).toBe(false);
    });

    it('should return false for regular text', () => {
      expect(service.isCommand('regular message')).toBe(false);
    });

    it('should return false for text with slash in middle', () => {
      expect(service.isCommand('this is a /test message')).toBe(false);
    });

    it('should handle leading whitespace', () => {
      expect(service.isCommand('   /new')).toBe(true);
    });

    it('should be case-sensitive', () => {
      expect(service.isCommand('/NEW')).toBe(false);
    });

    describe('with aliases', () => {
      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['/quit', '/bye'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      it('should return true when typed input matches an alias', () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
        expect(aliasService.isCommand('/quit')).toBe(true);
        expect(aliasService.isCommand('/bye')).toBe(true);
      });

      it('should return true for an alias with trailing args', () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
        expect(aliasService.isCommand('/quit now')).toBe(true);
      });

      it('should still return false for an unknown alias', () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
        expect(aliasService.isCommand('/q')).toBe(false);
      });
    });
  });

  describe('searchCommands', () => {
    it('should return all commands when query is empty', () => {
      const results = service.searchCommands('');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        name: '/new',
        displayName: '/new',
        description: 'Start a new chat session',
      });
    });

    it('should return all commands sorted alphabetically when query is empty', () => {
      const handlers = [
        createFakePartial<SlashCommandHandler>({
          command: {
            name: '/zebra',
            description: 'Zebra command',
            action: 'zebra' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        }),
        createFakePartial<SlashCommandHandler>({
          command: {
            name: '/apple',
            description: 'Apple command',
            action: 'apple' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        }),
        createFakePartial<SlashCommandHandler>({
          command: {
            name: '/mango',
            description: 'Mango command',
            action: 'mango' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        }),
      ];

      const testService = new DefaultSlashCommandService(logger, handlers);
      const results = testService.searchCommands('');

      expect(results.map((r) => r.name)).toEqual(['/apple', '/mango', '/zebra']);
    });

    it('should filter commands by name', () => {
      const handler2 = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/test',
          description: 'Test command',
          action: 'test_action' as SlashCommandAction,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const multiService = new DefaultSlashCommandService(logger, [mockHandler, handler2]);
      const results = multiService.searchCommands('new');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('/new');
      expect(results[0].displayName).toBe('/new');
    });

    it('should filter commands by description', () => {
      const handler2 = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/test',
          description: 'Test command',
          action: 'test_action' as SlashCommandAction,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const multiService = new DefaultSlashCommandService(logger, [mockHandler, handler2]);
      const results = multiService.searchCommands('chat');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('/new');
      expect(results[0].displayName).toBe('/new');
    });

    it('should be case-insensitive', () => {
      const results = service.searchCommands('NEW');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('/new');
      expect(results[0].displayName).toBe('/new');
    });

    it('should return multiple matches', () => {
      const handler2 = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/new-session',
          description: 'Create a new session',
          action: 'new_session_action' as SlashCommandAction,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const multiService = new DefaultSlashCommandService(logger, [mockHandler, handler2]);
      const results = multiService.searchCommands('new');

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.name)).toContain('/new');
      expect(results.map((r) => r.name)).toContain('/new-session');
    });

    it('should return empty array when no matches found', () => {
      const results = service.searchCommands('nonexistent');

      expect(results).toHaveLength(0);
    });

    describe('single-character query', () => {
      it('should not match mid-word description text for single-character queries', () => {
        // 'q' appears mid-word in "requests" (/feedback description) but should NOT match
        const feedbackHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/feedback',
            description: 'Submit bug reports or feature requests',
            action: 'feedback' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [feedbackHandler]);
        const results = testService.searchCommands('q');

        expect(results).toHaveLength(0);
      });

      it('should still match command names for single-character queries', () => {
        const nHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/new',
            description: 'Start a new chat session',
            action: 'new' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [nHandler]);
        const results = testService.searchCommands('n');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('/new');
      });
    });

    describe('description word-boundary matching', () => {
      let feedbackHandler: SlashCommandHandler;

      beforeEach(() => {
        feedbackHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/feedback',
            description: 'Submit bug reports or feature requests',
            action: 'feedback' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });
      });

      it('should match description when query matches start of a word', () => {
        const testService = new DefaultSlashCommandService(logger, [feedbackHandler]);
        // "req" matches the start of "requests"
        const results = testService.searchCommands('req');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('/feedback');
      });

      it('should not match description when query matches mid-word', () => {
        const testService = new DefaultSlashCommandService(logger, [feedbackHandler]);
        // "equ" appears mid-word in "requests" but should NOT match
        const results = testService.searchCommands('equ');

        expect(results).toHaveLength(0);
      });

      it('should match description when query matches start of first word', () => {
        const testService = new DefaultSlashCommandService(logger, [feedbackHandler]);
        // "sub" matches the start of "Submit"
        const results = testService.searchCommands('sub');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('/feedback');
      });
    });

    describe('alias matching', () => {
      const exitHandlerWithAliases = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: 'exit' as SlashCommandAction,
          aliases: ['/quit'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      it.each(['q', 'qu', 'quit'])('should match a command by alias for query %s', (query) => {
        const testService = new DefaultSlashCommandService(logger, [exitHandlerWithAliases]);
        const results = testService.searchCommands(query);

        expect(results).toEqual([
          expect.objectContaining({
            name: '/exit',
            displayName: '/exit (quit)',
            description: 'Exit the application',
          }),
        ]);
      });

      it('should give alias matches the same priority as name prefix matches (score 0)', () => {
        // A second command whose NAME prefix-matches the same query as /exit's alias.
        // Both should land at score 0 and tie-break alphabetically.
        const quoteHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/quote',
            description: 'Insert a quote',
            action: 'quote' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });
        // A third command that only matches via substring on a longer name —
        // should land at score 1, below both score-0 matches.
        const inquireHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/inquire',
            description: 'Ask a question',
            action: 'inquire' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [
          exitHandlerWithAliases,
          quoteHandler,
          inquireHandler,
        ]);
        // 'qu' matches: /exit via alias (score 0), /quote via name prefix (score 0),
        // /inquire via name substring (score 1). Score-0 results sort alphabetically.
        const results = testService.searchCommands('qu');

        expect(results.map((r) => r.name)).toEqual(['/exit', '/quote', '/inquire']);
        expect(results[0].displayName).toBe('/exit (quit)');
        expect(results[1].displayName).toBe('/quote');
      });

      it('should not show alias suffix when the query also prefix-matches the canonical name', () => {
        const helpHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/help',
            description: 'Show help',
            action: 'help' as SlashCommandAction,
            aliases: ['/halt'],
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [helpHandler]);
        // 'h' prefix-matches both the name `/help` and the alias `/halt`.
        // The alias should be suppressed since the canonical name already matches.
        const results = testService.searchCommands('h');

        expect(results).toHaveLength(1);
        expect(results[0].displayName).toBe('/help');
      });

      it('should not surface a rejected alias as a display hint', () => {
        // /quit is a real command; /exit also declares /quit as an alias, which is
        // rejected at registration because it collides with the command name.
        // The dropdown must not show '/exit (quit)' for queries that hit /quit.
        const quitHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/quit',
            description: 'Quit',
            action: 'quit' as SlashCommandAction,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });
        const exitHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/exit',
            description: 'Exit the application',
            action: SlashCommandAction.Exit,
            aliases: ['/quit'],
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [quitHandler, exitHandler]);
        const results = testService.searchCommands('qu');

        // /quit matches by name prefix; /exit does NOT surface because its alias
        // was rejected during registration.
        expect(results.map((r) => r.name)).toEqual(['/quit']);
        expect(results.find((r) => r.displayName.includes('(quit)'))).toBeUndefined();
      });

      it('should not display alias when matched by command name', () => {
        const testService = new DefaultSlashCommandService(logger, [exitHandlerWithAliases]);
        const results = testService.searchCommands('exit');

        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('/exit');
        expect(results[0].displayName).toBe('/exit');
        expect(results[0].description).toBe('Exit the application');
      });

      it('should handle multiple aliases and show the matched one', () => {
        const multiAliasHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/exit',
            description: 'Exit the application',
            action: 'exit' as SlashCommandAction,
            aliases: ['/quit', '/bye', '/q'],
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        });

        const testService = new DefaultSlashCommandService(logger, [multiAliasHandler]);

        // Test matching different aliases
        const byeResults = testService.searchCommands('bye');
        expect(byeResults).toHaveLength(1);
        expect(byeResults[0].name).toBe('/exit');
        expect(byeResults[0].displayName).toBe('/exit (bye)');

        const qResults = testService.searchCommands('q');
        expect(qResults).toHaveLength(1);
        expect(qResults[0].name).toBe('/exit');
        expect(qResults[0].displayName).toBe('/exit (q)');
      });
    });

    describe('prioritization', () => {
      let multiService: SlashCommandService;

      beforeEach(() => {
        const handlers = [
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/help',
              description: 'Show help information',
              action: SlashCommandAction.Help,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/reset',
              description: 'Reset the session',
              action: 'reset' as SlashCommandAction,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/settings',
              description: 'Configure help settings',
              action: 'settings' as SlashCommandAction,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/about',
              description: 'Show helpful information about the CLI',
              action: 'about' as SlashCommandAction,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
        ];

        multiService = new DefaultSlashCommandService(logger, handlers);
      });

      it('should prioritize exact prefix matches on name', () => {
        const results = multiService.searchCommands('/he');

        expect(results[0].name).toBe('/help');
        expect(results[0].displayName).toBe('/help');
      });

      it('should prioritize name substring matches over description matches', () => {
        const results = multiService.searchCommands('set');

        // After stripping slashes:
        // 'settings' starts with 'set' (prefix match, score 0)
        // 'reset' has 'set' in name (substring match, score 1)
        // 'about' has 'set' in description (description match, score 2)
        expect(results.length).toBeGreaterThanOrEqual(2);
        expect(results[0].name).toBe('/settings'); // prefix match
        expect(results[0].displayName).toBe('/settings');
        expect(results[1].name).toBe('/reset'); // substring match
        expect(results[1].displayName).toBe('/reset');
        const aboutIndex = results.findIndex((r) => r.name === '/about');
        if (aboutIndex !== -1) {
          expect(aboutIndex).toBe(2); // description match comes last
        }
      });

      it('should prioritize description matches last', () => {
        const results = multiService.searchCommands('help');

        // /help has prefix match on name (score 0)
        // /settings and /about have 'help' in description (score 2)
        expect(results[0].name).toBe('/help');
        expect(results[0].displayName).toBe('/help');
        const descriptionMatches = results.slice(1);
        expect(descriptionMatches.map((r) => r.name)).toContain('/settings');
        expect(descriptionMatches.map((r) => r.name)).toContain('/about');
      });

      it('should sort alphabetically within same priority level', () => {
        const results = multiService.searchCommands('help');

        // Both /settings and /about match on description (same score)
        // They should be sorted alphabetically
        const descriptionMatches = results.slice(1);
        expect(descriptionMatches[0].name).toBe('/about');
        expect(descriptionMatches[1].name).toBe('/settings');
      });

      it('should handle prefix match correctly with slash', () => {
        const results = multiService.searchCommands('/hel');

        expect(results[0].name).toBe('/help');
        expect(results[0].displayName).toBe('/help');
      });

      it('should prioritize shorter prefix matches', () => {
        const handlers = [
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/new',
              description: 'Start new session',
              action: 'new' as SlashCommandAction,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
          createFakePartial<SlashCommandHandler>({
            command: {
              name: '/new-session',
              description: 'Start new session with options',
              action: SlashCommandAction.NewSession,
            },
            execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          }),
        ];

        const testService = new DefaultSlashCommandService(logger, handlers);
        const results = testService.searchCommands('/new');

        // Both match as prefix, alphabetically /new comes before /new-session
        expect(results[0].name).toBe('/new');
        expect(results[0].displayName).toBe('/new');
        expect(results[1].name).toBe('/new-session');
        expect(results[1].displayName).toBe('/new-session');
      });

      it('should strip leading slash from query for matching', () => {
        const resultsWithSlash = multiService.searchCommands('/set');
        const resultsWithoutSlash = multiService.searchCommands('set');

        // Both should return the same results
        expect(resultsWithSlash).toEqual(resultsWithoutSlash);
        expect(resultsWithSlash[0].name).toBe('/settings');
        expect(resultsWithSlash[0].displayName).toBe('/settings');
      });
    });
  });

  describe('buildComponentRegistry', () => {
    let mockApi: ControllerApi;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockComponent = () => null as any;

    beforeEach(() => {
      mockApi = createFakePartial<ControllerApi>({});
    });

    describe('when no handlers implement getComponent', () => {
      it('returns an empty map', () => {
        const result = service.buildComponentRegistry(mockApi);
        expect(result.size).toBe(0);
      });
    });

    describe('when one handler implements getComponent', () => {
      it('registers the component under its inputType', () => {
        const onCloseHelp = jest.fn();
        const handlerWithComponent = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/help',
            description: 'Show help',
            action: SlashCommandAction.Help,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          getComponent: jest
            .fn<NonNullable<SlashCommandHandler['getComponent']>>()
            .mockReturnValue({
              inputType: 'help_dialog',
              component: mockComponent,
              callbacks: { onCloseHelp },
            }),
        });

        const serviceWithComponent = new DefaultSlashCommandService(logger, [handlerWithComponent]);
        const result = serviceWithComponent.buildComponentRegistry(mockApi);

        expect(result.size).toBe(1);
        expect(result.get('help_dialog')).toMatchObject({
          component: mockComponent,
          callbacks: { onCloseHelp },
        });
      });
    });

    describe('when multiple handlers implement getComponent', () => {
      it('registers all components keyed by their inputType', () => {
        const onCloseHelp = jest.fn();
        const onCancelSessionsSearch = jest.fn();

        const helpHandler = createFakePartial<SlashCommandHandler>({
          command: { name: '/help', description: 'Show help', action: SlashCommandAction.Help },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          getComponent: jest
            .fn<NonNullable<SlashCommandHandler['getComponent']>>()
            .mockReturnValue({
              inputType: 'help_dialog',
              component: mockComponent,
              callbacks: { onCloseHelp },
            }),
        });

        const sessionsHandler = createFakePartial<SlashCommandHandler>({
          command: {
            name: '/sessions',
            description: 'Browse sessions',
            action: SlashCommandAction.Sessions,
          },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          getComponent: jest
            .fn<NonNullable<SlashCommandHandler['getComponent']>>()
            .mockReturnValue({
              inputType: 'sessions_search',
              component: mockComponent,
              callbacks: { onCancelSessionsSearch },
            }),
        });

        const multiService = new DefaultSlashCommandService(logger, [helpHandler, sessionsHandler]);
        const result = multiService.buildComponentRegistry(mockApi);

        expect(result.size).toBe(2);
        expect(result.get('help_dialog')).toMatchObject({ callbacks: { onCloseHelp } });
        expect(result.get('sessions_search')).toMatchObject({
          callbacks: { onCancelSessionsSearch },
        });
      });
    });

    describe('when some handlers do not implement getComponent', () => {
      it('only registers handlers that implement it', () => {
        const onCloseHelp = jest.fn();

        const helpHandler = createFakePartial<SlashCommandHandler>({
          command: { name: '/help', description: 'Show help', action: SlashCommandAction.Help },
          execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
          getComponent: jest
            .fn<NonNullable<SlashCommandHandler['getComponent']>>()
            .mockReturnValue({
              inputType: 'help_dialog',
              component: mockComponent,
              callbacks: { onCloseHelp },
            }),
        });

        // mockHandler (from outer beforeEach) does not implement getComponent
        const multiService = new DefaultSlashCommandService(logger, [mockHandler, helpHandler]);
        const result = multiService.buildComponentRegistry(mockApi);

        expect(result.size).toBe(1);
        expect(result.get('help_dialog')).toBeDefined();
      });
    });

    it('passes the api to each handler getComponent', () => {
      const getComponentMock = jest
        .fn<NonNullable<SlashCommandHandler['getComponent']>>()
        .mockReturnValue({ inputType: 'help_dialog', component: mockComponent, callbacks: {} });
      const handlerWithComponent = createFakePartial<SlashCommandHandler>({
        command: { name: '/help', description: 'Show help', action: SlashCommandAction.Help },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
        getComponent: getComponentMock,
      });

      const serviceWithComponent = new DefaultSlashCommandService(logger, [handlerWithComponent]);
      serviceWithComponent.buildComponentRegistry(mockApi);

      expect(getComponentMock).toHaveBeenCalledWith(mockApi);
    });
  });

  describe('execute', () => {
    let mockApi: ControllerApi;

    beforeEach(() => {
      mockApi = createFakePartial<ControllerApi>({
        mutateState: jest.fn<ControllerApi['mutateState']>(),
        showError: jest.fn<ControllerApi['showError']>(),
        sendPrompt: jest.fn<ControllerApi['sendPrompt']>(),
      });
    });

    it('should execute command without arguments', async () => {
      await service.execute('/new', mockApi);

      expect(mockHandler.execute).toHaveBeenCalledWith(mockApi, undefined);
    });

    it('should execute command with single argument', async () => {
      await service.execute('/new arg1', mockApi);

      expect(mockHandler.execute).toHaveBeenCalledWith(mockApi, ['arg1']);
    });

    it('should execute command with multiple arguments', async () => {
      await service.execute('/new arg1 arg2 arg3', mockApi);

      expect(mockHandler.execute).toHaveBeenCalledWith(mockApi, ['arg1', 'arg2', 'arg3']);
    });

    it('should handle extra whitespace', async () => {
      await service.execute('   /new   arg1    arg2   ', mockApi);

      expect(mockHandler.execute).toHaveBeenCalledWith(mockApi, ['arg1', 'arg2']);
    });

    it('should throw error for unknown command', async () => {
      await expect(service.execute('/unknown', mockApi)).rejects.toThrow(
        'Unknown command: /unknown',
      );
    });

    it('should throw error when no handler registered', async () => {
      const serviceWithoutHandler = new DefaultSlashCommandService(logger, []);

      await expect(serviceWithoutHandler.execute('/new', mockApi)).rejects.toThrow(
        'Unknown command: /new',
      );
    });

    describe('with aliases', () => {
      const exitExecute = jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined);
      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['/quit', '/bye'],
        },
        execute: exitExecute,
      });

      it('should run the canonical handler when an alias is typed', async () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
        await aliasService.execute('/quit', mockApi);

        expect(exitExecute).toHaveBeenCalledWith(mockApi, undefined);
      });

      it('should pass args through when invoked via alias', async () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
        await aliasService.execute('/bye now', mockApi);

        expect(exitExecute).toHaveBeenCalledWith(mockApi, ['now']);
      });

      it('should preserve the typed alias in the unknown-command error', async () => {
        const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);

        await expect(aliasService.execute('/nope', mockApi)).rejects.toThrow(
          'Unknown command: /nope',
        );
      });
    });
  });

  describe('isDynamicCommand', () => {
    it('should return false for built-in commands', () => {
      expect(service.isDynamicCommand('/new')).toBe(false);
    });

    it('should return false for unknown commands', () => {
      expect(service.isDynamicCommand('/unknown')).toBe(false);
    });

    it('should return true for registered dynamic commands', () => {
      service.registerDynamicCommands([
        {
          name: '/cli-development',
          description: 'CLI development skill',
          action: SlashCommandAction.Skills,
        },
      ]);
      expect(service.isDynamicCommand('/cli-development')).toBe(true);
    });

    it('should return false for regular text', () => {
      expect(service.isDynamicCommand('regular message')).toBe(false);
    });
  });

  describe('registerDynamicCommands', () => {
    let mockApi: ControllerApi;
    let skillsHandler: SlashCommandHandler;

    beforeEach(() => {
      mockApi = createFakePartial<ControllerApi>({
        mutateState: jest.fn<ControllerApi['mutateState']>(),
        showError: jest.fn<ControllerApi['showError']>(),
        sendPrompt: jest.fn<ControllerApi['sendPrompt']>(),
      });

      skillsHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/skills',
          description: 'List available agent skills',
          action: SlashCommandAction.Skills,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      service = new DefaultSlashCommandService(logger, [mockHandler, skillsHandler]);
    });

    it('should skip dynamic commands that conflict with built-in commands', () => {
      service.registerDynamicCommands([
        {
          name: '/new',
          description: 'Conflicting skill',
          action: SlashCommandAction.Skills,
        },
      ]);

      const commands = service.getCommands();
      const newCommands = commands.filter((c) => c.name === '/new');
      expect(newCommands).toHaveLength(1);
      expect(newCommands[0].description).toBe('Start a new chat session');
    });

    it('should skip dynamic commands with invalid names (no leading slash)', () => {
      service.registerDynamicCommands([
        {
          name: 'invalid-name',
          description: 'Invalid skill',
          action: SlashCommandAction.Skills,
        },
      ]);

      expect(service.isCommand('invalid-name')).toBe(false);
    });

    it('should skip dynamic commands with whitespace in name', () => {
      service.registerDynamicCommands([
        {
          name: '/invalid name',
          description: 'Invalid skill',
          action: SlashCommandAction.Skills,
        },
      ]);

      expect(service.isCommand('/invalid name')).toBe(false);
    });

    it('should include dynamic commands in getCommands', () => {
      service.registerDynamicCommands([
        {
          name: '/cli-development',
          description: 'CLI development skill',
          action: SlashCommandAction.Skills,
        },
      ]);

      const commands = service.getCommands();
      expect(commands.map((c) => c.name)).toContain('/cli-development');
    });

    it('should recognize dynamic commands in isCommand', () => {
      service.registerDynamicCommands([
        {
          name: '/di',
          description: 'Dependency injection skill',
          action: SlashCommandAction.Skills,
        },
      ]);

      expect(service.isCommand('/di')).toBe(true);
    });

    describe('when executing a dynamic command', () => {
      beforeEach(async () => {
        service.registerDynamicCommands([
          {
            name: '/cli-development',
            description: 'CLI development skill',
            action: SlashCommandAction.Skills,
          },
        ]);
      });

      it('should prepend the skill name to args', async () => {
        await service.execute('/cli-development fix tests', mockApi);

        expect(skillsHandler.execute).toHaveBeenCalledWith(mockApi, [
          'cli-development',
          'fix',
          'tests',
        ]);
      });

      it('should pass skill name as sole arg when no extra args', async () => {
        await service.execute('/cli-development', mockApi);

        expect(skillsHandler.execute).toHaveBeenCalledWith(mockApi, ['cli-development']);
      });
    });
  });

  describe('removeDynamicCommands', () => {
    beforeEach(() => {
      service.registerDynamicCommands([
        {
          name: '/cli-development',
          description: 'CLI development skill',
          action: SlashCommandAction.Skills,
        },
      ]);
    });

    it('should remove all dynamic commands', () => {
      service.removeDynamicCommands();

      expect(service.isCommand('/cli-development')).toBe(false);
    });

    it('should not remove static commands', () => {
      service.removeDynamicCommands();

      expect(service.isCommand('/new')).toBe(true);
    });

    it('should not include dynamic commands in getCommands', () => {
      service.removeDynamicCommands();

      const commands = service.getCommands();
      expect(commands.map((c) => c.name)).not.toContain('/cli-development');
    });
  });

  describe('alias registration', () => {
    it('should skip aliases that do not start with /', () => {
      const handler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['quit'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });
      const aliasService = new DefaultSlashCommandService(logger, [handler]);

      expect(aliasService.isCommand('/quit')).toBe(false);
      expect(aliasService.isCommand('quit')).toBe(false);
    });

    it('should skip aliases containing whitespace', () => {
      const handler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['/quit now'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });
      const aliasService = new DefaultSlashCommandService(logger, [handler]);

      expect(aliasService.isCommand('/quit now')).toBe(false);
    });

    it('should skip an alias that conflicts with another command name', () => {
      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['/new'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });
      // mockHandler from the outer beforeEach owns /new
      const aliasService = new DefaultSlashCommandService(logger, [mockHandler, exitHandler]);

      // /new still maps to the new-session command, not exit
      expect(aliasService.isCommand('/new')).toBe(true);
      expect(aliasService.isCommand('/exit')).toBe(true);
      // No collision execution — /new should invoke the /new handler only
      expect(aliasService.isCommand('/exit')).toBe(true);
    });

    it('should resolve to the real command when an alias collides regardless of registration order', async () => {
      const newExecute = jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined);
      const exitExecute = jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined);

      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit the application',
          action: SlashCommandAction.Exit,
          aliases: ['/new'],
        },
        execute: exitExecute,
      });
      const newHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/new',
          description: 'New session',
          action: SlashCommandAction.NewSession,
        },
        execute: newExecute,
      });

      // Order matters: the alias is registered before the colliding command exists.
      const aliasService = new DefaultSlashCommandService(logger, [exitHandler, newHandler]);
      const api = createFakePartial<ControllerApi>({});

      await aliasService.execute('/new', api);

      expect(newExecute).toHaveBeenCalled();
      expect(exitExecute).not.toHaveBeenCalled();
    });

    it('should evict a shadowed alias from autocomplete and log a warning when a later command collides', () => {
      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit',
          action: SlashCommandAction.Exit,
          aliases: ['/new'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });
      const newHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/new',
          description: 'New session',
          action: SlashCommandAction.NewSession,
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const aliasService = new DefaultSlashCommandService(logger, [exitHandler, newHandler]);

      const results = aliasService.searchCommands('new');
      expect(results).toEqual([expect.objectContaining({ name: '/new', displayName: '/new' })]);
      expect(logger.warnLogs.map((entry) => entry.message)).toContainEqual(
        expect.stringContaining('Dropping alias "/new" of /exit'),
      );
    });

    it('should evict a built-in alias when a later dynamic command collides', () => {
      const exitHandler = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit',
          action: SlashCommandAction.Exit,
          aliases: ['/foo'],
        },
        execute: jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined),
      });

      const aliasService = new DefaultSlashCommandService(logger, [exitHandler]);
      aliasService.registerDynamicCommands([
        { name: '/foo', description: 'Foo dynamic', action: 'foo' as SlashCommandAction },
      ]);

      const results = aliasService.searchCommands('foo');
      expect(results).toEqual([expect.objectContaining({ name: '/foo', displayName: '/foo' })]);
      expect(logger.warnLogs.map((entry) => entry.message)).toContainEqual(
        expect.stringContaining('Dropping alias "/foo" of /exit'),
      );
    });

    it('should skip a duplicate alias declared by two commands', async () => {
      const firstExecute = jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined);
      const secondExecute = jest.fn<SlashCommandHandler['execute']>().mockResolvedValue(undefined);

      const first = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/exit',
          description: 'Exit',
          action: SlashCommandAction.Exit,
          aliases: ['/q'],
        },
        execute: firstExecute,
      });
      const second = createFakePartial<SlashCommandHandler>({
        command: {
          name: '/quit-other',
          description: 'Other',
          action: 'other' as SlashCommandAction,
          aliases: ['/q'],
        },
        execute: secondExecute,
      });

      const aliasService = new DefaultSlashCommandService(logger, [first, second]);
      const api = createFakePartial<ControllerApi>({});

      // First registration wins; second is skipped
      await aliasService.execute('/q', api);

      expect(firstExecute).toHaveBeenCalled();
      expect(secondExecute).not.toHaveBeenCalled();
    });
  });
});
