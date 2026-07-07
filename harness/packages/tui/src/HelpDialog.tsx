import React from 'react';
import { Box, Text } from 'ink';
import type { HelpDialogInputState } from './types';
import { Link } from './lib/components/Link';
import { useKeyHandler } from './lib/key_handler';
import { isGlab } from './lib/environment_context';

export interface HelpDialogCallbacks {
  onCloseHelp: () => void;
}

interface HelpDialogProps {
  input: HelpDialogInputState;
  callbacks: HelpDialogCallbacks;
}

interface ShortcutItem {
  action: string;
  description: string;
}

const shortcuts: ShortcutItem[] = [
  { action: '@', description: 'Search and attach files to your prompt' },
  { action: '/', description: 'Execute slash commands' },
  { action: 'Ctrl + R', description: 'Search prompt history' },
  { action: 'Ctrl + C', description: 'Exit ALCOR' },
  { action: 'Up/Down', description: 'Navigate input history' },
];

export const helpFooterHint = (): string | null => 'Esc to close';

export const HelpDialog: React.FC<HelpDialogProps> = ({ input, callbacks }) => {
  useKeyHandler(async (event) => {
    if (event.name === 'escape') {
      callbacks.onCloseHelp();
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="cyan">
            ALCOR{isGlab() ? ' (glab)' : ''}
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text>
            An AI-powered terminal assistant that understands your codebase, helps with development
            tasks, and executes commands with your permission.
          </Text>
        </Box>

        <Box marginBottom={1}>
          <Text bold color="yellow">
            Shortcuts
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {shortcuts.map((shortcut) => (
            <Box key={shortcut.action}>
              <Box width={16}>
                <Text bold color="green">
                  {shortcut.action}
                </Text>
              </Box>
              <Text>{shortcut.description}</Text>
            </Box>
          ))}
        </Box>

        <Box marginBottom={1}>
          <Text bold color="yellow">
            Slash Commands
          </Text>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          {input.slashCommands && input.slashCommands.length > 0 ? (
            input.slashCommands.map((command) => (
              <Box key={command.name}>
                <Box width={16}>
                  <Text bold color="green">
                    {command.name}
                  </Text>
                </Box>
                <Text>{command.description}</Text>
              </Box>
            ))
          ) : (
            <>
              <Box>
                <Box width={16}>
                  <Text bold color="green">
                    /help
                  </Text>
                </Box>
                <Text>Show this help dialog</Text>
              </Box>
              <Box>
                <Box width={16}>
                  <Text bold color="green">
                    /new
                  </Text>
                </Box>
                <Text>Start a new chat session</Text>
              </Box>
            </>
          )}
        </Box>

        <Box>
          <Text color="dim">For more information: </Text>
          <Link url="https://docs.gitlab.com/user/gitlab_duo_cli/" color="dim">
            https://docs.gitlab.com/user/gitlab_duo_cli/
          </Link>
        </Box>
      </Box>
    </Box>
  );
};
