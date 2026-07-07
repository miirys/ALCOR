import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { CursorPosition } from '@gitlab-org/tui';
import type { SlashCommandService } from '../slash_commands';
import { SlashCommandDropdownProvider } from './slash_command_dropdown_provider';

describe('SlashCommandDropdownProvider', () => {
  let provider: SlashCommandDropdownProvider;
  let mockSlashCommandService: SlashCommandService;
  let searchCommandsMock: jest.Mock<SlashCommandService['searchCommands']>;

  beforeEach(() => {
    searchCommandsMock = jest.fn<SlashCommandService['searchCommands']>();
    mockSlashCommandService = createFakePartial<SlashCommandService>({
      searchCommands: searchCommandsMock,
    });
    provider = new SlashCommandDropdownProvider(mockSlashCommandService);
  });

  describe('getItems', () => {
    describe('when input is not a slash command', () => {
      it('should return empty array when word does not start with /', async () => {
        const text = 'hello world';
        const position: CursorPosition = { line: 0, column: 5 };

        const result = await provider.getItems(text, position);

        expect(result).toEqual([]);
        expect(searchCommandsMock).not.toHaveBeenCalled();
      });

      it('should return empty array when slash is not at line start', async () => {
        const text = 'hello /exit';
        const position: CursorPosition = { line: 0, column: 11 };

        const result = await provider.getItems(text, position);

        expect(result).toEqual([]);
        expect(searchCommandsMock).not.toHaveBeenCalled();
      });
    });

    describe('when input is a valid slash command', () => {
      it('should search commands and return dropdown items', async () => {
        const text = '/exit';
        const position: CursorPosition = { line: 0, column: 5 };
        const mockSearchResults = [
          { name: '/exit', displayName: '/exit', description: 'Exit the application' },
          { name: '/new', displayName: '/new', description: 'Start a new session' },
        ];

        searchCommandsMock.mockReturnValue(mockSearchResults);

        const result = await provider.getItems(text, position);

        expect(searchCommandsMock).toHaveBeenCalledWith('exit');
        expect(result).toEqual([
          {
            id: '/exit',
            label: '/exit',
            description: 'Exit the application',
            enabled: true,
            replaceWith: '/exit ',
            submitAfterSelect: true,
          },
          {
            id: '/new',
            label: '/new',
            description: 'Start a new session',
            enabled: true,
            replaceWith: '/new ',
            submitAfterSelect: true,
          },
        ]);
      });

      it('should strip leading slash from query when calling searchCommands', async () => {
        const text = '/help';
        const position: CursorPosition = { line: 0, column: 5 };
        searchCommandsMock.mockReturnValue([]);

        await provider.getItems(text, position);

        expect(searchCommandsMock).toHaveBeenCalledWith('help');
      });

      it('should handle empty search results', async () => {
        const text = '/unknown';
        const position: CursorPosition = { line: 0, column: 8 };
        searchCommandsMock.mockReturnValue([]);

        const result = await provider.getItems(text, position);

        expect(searchCommandsMock).toHaveBeenCalledWith('unknown');
        expect(result).toEqual([]);
      });
    });
  });
});
