import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TextInput } from './TextInput';
import { defaultInputState } from './default_state';
import { type AppCallbacks, type TextInputState } from './types';
import type { DropdownItem } from './lib/components/DropdownItem';
import type { CursorPosition, DropdownProvider } from './lib/dropdown_provider';
import { getWordAtCursor, isWordAtLineStart } from './lib/dropdown_provider';
import { simulateInput } from './test/input_helper';
import { renderWithProviders } from './test/render_helper';
import { useInputAction } from './lib/keymap';

const RERENDER_TIMEOUT = 50;

const waitMs = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const renderTextInput = (
  input: TextInputState,
  callbacks: AppCallbacks,
  dropdownProviders: DropdownProvider[] = [],
  options: { isKittyProtocolSupported?: boolean } = {},
) => {
  const { stdinManager, ...result } = renderWithProviders(
    <TextInput input={input} callbacks={callbacks} dropdownProviders={dropdownProviders} />,
    { envInfo: { isKittyProtocolSupported: options.isKittyProtocolSupported ?? false } },
  );

  const stdin = {
    write: (data: string) => {
      stdinManager.emitData(Buffer.from(data, 'utf8'));
      result.stdin.write(data);
    },
  };

  return {
    ...result,
    stdin,
    stdinManager,
  };
};

const createDropdownItem = (
  id: string,
  label: string,
  replaceWith: string,
  opts: {
    description?: string;
    enabled?: boolean;
    disabledReason?: string;
    submitAfterSelect?: boolean;
  } = {},
): DropdownItem => ({
  id,
  label,
  replaceWith,
  enabled: opts.enabled ?? true,
  description: opts.description,
  disabledReason: opts.disabledReason,
  submitAfterSelect: opts.submitAfterSelect,
});

/**
 * Creates a DropdownProvider from a word-based callback.
 * The callback receives the word at cursor and whether it's at line start,
 * matching the pattern most tests use.
 */
const createProvider = (
  fn: (word: string, isAtLineStart: boolean) => Promise<DropdownItem[] | null>,
  onItemSelected?: DropdownProvider['onItemSelected'],
): DropdownProvider => ({
  id: 'test',
  async getItems(text: string, position: CursorPosition) {
    const word = getWordAtCursor(text, position);
    const atLineStart = isWordAtLineStart(text, position);
    return (await fn(word, atLineStart)) ?? [];
  },
  onItemSelected,
});

describe('TextInput', () => {
  const createDefaultCallbacks = (): AppCallbacks => {
    return createFakePartial<AppCallbacks>({
      onSubmit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      onExit: jest.fn(),
      onTextChange: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      toggleExpanded: jest.fn(),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render input with value and cursor', () => {
      const input = { ...defaultInputState, lines: ['Hello world'], cursorColumn: 11 };
      const callbacks = createDefaultCallbacks();

      const { lastFrame } = renderTextInput(input, callbacks);
      const output = lastFrame();

      expect(output).toContain('❯ ');
      expect(output).toContain('Hello world');
    });

    it('should render empty input with placeholder', () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { lastFrame } = renderTextInput(input, callbacks);
      const output = lastFrame();

      expect(output).toContain('❯ ');
      expect(output).toContain('Ask ALCOR anything');
      expect(output).toContain('Ctrl+C to exit');
    });

    it('should render multiline input', () => {
      const input = { ...defaultInputState, lines: ['Line 1', 'Line 2', 'Line 3'] };
      const callbacks = createDefaultCallbacks();

      const { lastFrame } = renderTextInput(input, callbacks);
      const output = lastFrame();

      expect(output).toContain('Line 1');
      expect(output).toContain('Line 2');
      expect(output).toContain('Line 3');
    });
  });

  describe('text input', () => {
    it('should update message when typing', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'h');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'o');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('hello');
    });

    it('should handle backspace to delete characters', async () => {
      const input = { ...defaultInputState, lines: ['hello'] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, '', { backspace: true });
      simulateInput(stdin, '', { backspace: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('hel');
      expect(output).not.toContain('hello');
    });

    it('should handle multiline input with Shift+Enter', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'f');
      simulateInput(stdin, 'i');
      simulateInput(stdin, 'r');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');
      simulateInput(stdin, '', { return: true, shift: true });
      simulateInput(stdin, 's');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'c');
      simulateInput(stdin, 'o');
      simulateInput(stdin, 'n');
      simulateInput(stdin, 'd');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('first');
      expect(output).toContain('second');
    });

    it('should call onTextChange on text change', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'h');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'l');

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onTextChange).toHaveBeenCalled();
    });
  });

  describe('submit behavior', () => {
    it('should submit message on Enter', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onSubmit).toHaveBeenCalledWith('test');
    });

    it('should clear message after submit', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'h');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'o');
      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).not.toContain('hello');
    });

    it('should clear input immediately on submit', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      // Simulate a slow onSubmit handler (e.g. the full workflow streaming response)
      let resolveSubmit: () => void = () => {};
      const submitPromise = new Promise<void>((resolve) => {
        resolveSubmit = resolve;
      });
      callbacks.onSubmit = jest.fn<() => Promise<void>>().mockReturnValue(submitPromise);

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'T');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');
      simulateInput(stdin, ' ');
      simulateInput(stdin, '1');
      simulateInput(stdin, '2');
      simulateInput(stdin, '3');

      await waitMs(RERENDER_TIMEOUT);
      expect(lastFrame()).toContain('Test 123');

      // Submit — but the handler is still pending
      simulateInput(stdin, '', { return: true });
      await waitMs(RERENDER_TIMEOUT);

      // The input should be cleared immediately, not after onSubmit resolves
      const output = lastFrame();
      expect(output).not.toContain('Test 123');

      // Clean up: resolve the pending submit
      resolveSubmit();
      await submitPromise;
    });

    it('should not submit when Enter alone is pressed without Shift', () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Ctrl+C behavior', () => {
    it('should not call onExit when Ctrl+C is pressed with empty message', () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, 'c', { ctrl: true });

      expect(callbacks.onExit).not.toHaveBeenCalled();
    });

    it('should clear message when Ctrl+C is pressed with non-empty message', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, 'c', { ctrl: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).not.toContain('test');
      expect(callbacks.onExit).not.toHaveBeenCalled();
    });

    it('should clear message on first Ctrl+C but not exit on second Ctrl+C', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, 'c', { ctrl: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onExit).not.toHaveBeenCalled();

      const output = lastFrame();
      expect(output).not.toContain('test');

      simulateInput(stdin, 'c', { ctrl: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onExit).not.toHaveBeenCalled();
    });

    it('should not call onExit when message has only whitespace', () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, ' ');
      simulateInput(stdin, ' ');
      simulateInput(stdin, 'c', { ctrl: true });

      expect(callbacks.onExit).not.toHaveBeenCalled();
    });

    it('should cancel dropdown when Ctrl+C is pressed with active dropdown', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'a');
      simulateInput(stdin, 'b');
      simulateInput(stdin, 'c');

      await waitMs(RERENDER_TIMEOUT);

      let output = lastFrame();
      expect(output).toContain('file1.ts');

      simulateInput(stdin, 'c', { ctrl: true });

      await waitMs(RERENDER_TIMEOUT);

      output = lastFrame();
      expect(output).not.toContain('file1.ts');
      expect(output).toContain('@abc');
      expect(callbacks.onExit).not.toHaveBeenCalled();
    });
  });

  describe('trigger-based dropdown', () => {
    it('should display dropdown results', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
              createDropdownItem('file3.ts', 'file3.ts', '@file3.ts '),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 's');
      simulateInput(stdin, 'r');
      simulateInput(stdin, 'c');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('file1.ts');
      expect(output).toContain('file2.ts');
      expect(output).toContain('file3.ts');
    });

    it('should limit dropdown results to 10 items', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const manyItems = Array.from({ length: 20 }, (_, i) =>
        createDropdownItem(`file${i}.ts`, `file${i}.ts`, `@file${i}.ts `),
      );
      const provider = createProvider(async (word) => (word.startsWith('@') ? manyItems : null));

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('file0.ts');
      expect(output).toContain('file9.ts');
      expect(output).not.toContain('file10.ts');
    });

    it('should hide dropdown when trigger is deactivated', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      let output = lastFrame();
      expect(output).toContain('file1.ts');

      // Space deactivates the trigger (word becomes empty)
      simulateInput(stdin, ' ');

      await waitMs(RERENDER_TIMEOUT);

      output = lastFrame();
      expect(output).not.toContain('file1.ts');
    });

    it('should query provider when trigger is typed', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const getItemsFn = jest
        .fn<(word: string, isAtLineStart: boolean) => Promise<DropdownItem[] | null>>()
        .mockResolvedValue(null);
      const provider = createProvider(getItemsFn);

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');

      await waitMs(RERENDER_TIMEOUT);

      expect(getItemsFn).toHaveBeenCalledWith('@', expect.any(Boolean));
    });

    it('should display disabled items with reason', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('binary.png', 'binary.png', '@binary.png ', {
                enabled: false,
                disabledReason: 'Binary file',
              }),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'b');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('binary.png');
      expect(output).toContain('Binary file');
    });

    it('should show dropdown when provider returns items', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('/')
          ? [createDropdownItem('/help', '/help', '/help ', { description: 'Show help' })]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('/help');
    });

    it('should not show dropdown when no provider matches', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      // No providers — no dropdown

      const { stdin, lastFrame } = renderTextInput(input, callbacks, []);

      simulateInput(stdin, 'h');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'o');
      simulateInput(stdin, ' ');
      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).not.toContain('Show help');
    });
  });

  describe('dropdown selection', () => {
    it('should navigate through results with arrow keys', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
              createDropdownItem('file3.ts', 'file3.ts', '@file3.ts '),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { downArrow: true });

      const output = lastFrame();
      expect(output).toContain('file2.ts');
    });

    it('should not go below last item when pressing down arrow', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
            ]
          : null,
      );

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { downArrow: true });
      simulateInput(stdin, '', { downArrow: true });
      simulateInput(stdin, '', { downArrow: true });
    });

    it('should not go above first item when pressing up arrow', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('file1.ts', 'file1.ts', '@file1.ts '),
              createDropdownItem('file2.ts', 'file2.ts', '@file2.ts '),
            ]
          : null,
      );

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { upArrow: true });
      simulateInput(stdin, '', { upArrow: true });
    });

    it('should insert selected item with Tab key', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [
              createDropdownItem('src/file1.ts', 'file1.ts', '@src/file1.ts '),
              createDropdownItem('src/file2.ts', 'file2.ts', '@src/file2.ts '),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { downArrow: true });

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { tab: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@src/file2.ts');
    });

    it('should insert selected item with Enter key', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [createDropdownItem('src/file1.ts', 'file1.ts', '@src/file1.ts ')]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@src/file1.ts');
      expect(callbacks.onSubmit).not.toHaveBeenCalled();
    });

    it('should call onItemSelected when item is selected', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const item = createDropdownItem('file1.ts', 'file1.ts', '@file1.ts ');
      const onItemSelected = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const provider = createProvider(
        async (word) => (word.startsWith('@') ? [item] : null),
        onItemSelected,
      );

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(onItemSelected).toHaveBeenCalledWith(item);
    });

    it('should clear results after selecting item', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@') ? [createDropdownItem('file1.ts', 'file1.ts', '@file1.ts ')] : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@file1.ts');
    });

    it('should replace word at cursor using replaceWith from item', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [createDropdownItem('replacement.ts', 'replacement.ts', '@replacement.ts ')]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'o');
      simulateInput(stdin, 'l');
      simulateInput(stdin, 'd');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@replacement.ts');
      expect(output).not.toContain('@old');
    });

    it('should not select disabled items', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const onItemSelected = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const provider = createProvider(
        async (word) =>
          word.startsWith('@')
            ? [
                createDropdownItem('binary.png', 'binary.png', '@binary.png ', {
                  enabled: false,
                  disabledReason: 'Binary file',
                }),
              ]
            : null,
        onItemSelected,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'b');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@b');
      expect(output).not.toContain('@binary.png');
      expect(onItemSelected).not.toHaveBeenCalled();
    });

    it('should not select disabled items with Tab key', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const onItemSelected = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const provider = createProvider(
        async (word) =>
          word.startsWith('@')
            ? [
                createDropdownItem('binary.png', 'binary.png', '@binary.png ', {
                  enabled: false,
                  disabledReason: 'Binary file',
                }),
              ]
            : null,
        onItemSelected,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'b');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { tab: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@b');
      expect(output).not.toContain('@binary.png');
      expect(onItemSelected).not.toHaveBeenCalled();
    });
  });

  describe('when a global Tab handler is registered by an ancestor', () => {
    // Mirrors production: ChatInterface owns the global Tab behavior
    // (cycle agent mode) via the `agent.cycle` keymap action. The centralized
    // dispatcher resolves Tab to `dropdown.apply` when the dropdown is open and
    // to `agent.cycle` when it is closed, independent of mount order.
    // Regression test for switching mode when completing a slash command.
    const renderWithGlobalTabHandler = (
      input: TextInputState,
      callbacks: AppCallbacks,
      onGlobalTab: () => void,
      dropdownProviders: DropdownProvider[] = [],
    ) => {
      const Wrapper = () => {
        useInputAction('agent.cycle', onGlobalTab);

        return (
          <TextInput input={input} callbacks={callbacks} dropdownProviders={dropdownProviders} />
        );
      };

      const { stdinManager, ...result } = renderWithProviders(<Wrapper />);
      const stdin = {
        write: (data: string) => {
          stdinManager.emitData(Buffer.from(data, 'utf8'));
          result.stdin.write(data);
        },
      };

      return { ...result, stdin };
    };

    describe('when the dropdown is open', () => {
      it('should select the item with Tab without triggering the global handler', async () => {
        const input = { ...defaultInputState, lines: [''] };
        const callbacks = createDefaultCallbacks();
        const onGlobalTab = jest.fn();
        const provider = createProvider(async (word) =>
          word.startsWith('/') ? [createDropdownItem('explain', 'explain', '/explain ')] : null,
        );

        const { stdin, lastFrame } = renderWithGlobalTabHandler(input, callbacks, onGlobalTab, [
          provider,
        ]);

        simulateInput(stdin, '/');
        simulateInput(stdin, 'e');
        simulateInput(stdin, 'x');

        await waitMs(RERENDER_TIMEOUT);

        simulateInput(stdin, '', { tab: true });

        await waitMs(RERENDER_TIMEOUT);

        expect(lastFrame()).toContain('/explain');
        expect(onGlobalTab).not.toHaveBeenCalled();
      });
    });

    describe('when the dropdown is closed', () => {
      it('should let Tab reach the global handler', async () => {
        const input = { ...defaultInputState, lines: [''] };
        const callbacks = createDefaultCallbacks();
        const onGlobalTab = jest.fn();

        const { stdin } = renderWithGlobalTabHandler(input, callbacks, onGlobalTab);

        simulateInput(stdin, '', { tab: true });

        await waitMs(RERENDER_TIMEOUT);

        expect(onGlobalTab).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('onboarding arrow gating', () => {
    const renderWithOnboarding = (
      onboardingActive: boolean,
      callbacks: AppCallbacks,
      input: TextInputState = { ...defaultInputState, lines: [''] },
    ) => {
      const { stdinManager, ...result } = renderWithProviders(
        <TextInput input={input} callbacks={callbacks} onboardingActive={onboardingActive} />,
      );
      const stdin = {
        write: (data: string) => {
          stdinManager.emitData(Buffer.from(data, 'utf8'));
          result.stdin.write(data);
        },
      };
      return { ...result, stdin };
    };

    it('ignores ↑/↓ (no history navigation) while onboarding is active and the message is empty', async () => {
      const callbacks = createDefaultCallbacks();
      callbacks.onHistoryPrevious = jest.fn();
      callbacks.onHistoryNext = jest.fn();

      const { stdin } = renderWithOnboarding(true, callbacks);

      simulateInput(stdin, '', { upArrow: true });
      simulateInput(stdin, '', { downArrow: true });
      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onHistoryPrevious).not.toHaveBeenCalled();
      expect(callbacks.onHistoryNext).not.toHaveBeenCalled();
    });

    it('resumes history navigation once the user starts typing', async () => {
      const callbacks = createDefaultCallbacks();
      callbacks.onHistoryPrevious = jest.fn();

      const { stdin } = renderWithOnboarding(true, callbacks);

      simulateInput(stdin, 'h');
      simulateInput(stdin, 'i');
      await waitMs(RERENDER_TIMEOUT);
      simulateInput(stdin, '', { upArrow: true });
      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onHistoryPrevious).toHaveBeenCalled();
    });

    it('navigates history normally when onboarding is not active', async () => {
      const callbacks = createDefaultCallbacks();
      callbacks.onHistoryPrevious = jest.fn();

      const { stdin } = renderWithOnboarding(false, callbacks);

      simulateInput(stdin, '', { upArrow: true });
      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onHistoryPrevious).toHaveBeenCalled();
    });
  });

  describe('arrow key behavior without results', () => {
    it('should not affect message when arrow keys pressed without results', () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      simulateInput(stdin, '', { upArrow: true });
      simulateInput(stdin, '', { downArrow: true });
      simulateInput(stdin, '', { tab: true });
    });
  });

  describe('dropdown state transitions', () => {
    it('should handle multiple triggers in sequence', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const getItemsFn = jest
        .fn<(word: string, isAtLineStart: boolean) => Promise<DropdownItem[] | null>>()
        .mockImplementation(async (word) =>
          word.startsWith('@') ? [createDropdownItem('file1.ts', 'file1.ts', '@file1.ts ')] : null,
        );
      const provider = createProvider(getItemsFn);

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      // First trigger
      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');
      simulateInput(stdin, 'i');
      simulateInput(stdin, 'r');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      await waitMs(RERENDER_TIMEOUT);

      // Deactivate with space
      simulateInput(stdin, ' ');

      // Second trigger
      simulateInput(stdin, '@');
      simulateInput(stdin, 's');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'c');

      await waitMs(RERENDER_TIMEOUT);

      expect(getItemsFn).toHaveBeenCalledWith('@sec', expect.any(Boolean));
    });

    it('should hide dropdown when trigger text is deleted', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word === '/'
          ? [createDropdownItem('/help', '/help', '/help ', { description: 'Show help' })]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      let output = lastFrame();
      expect(output).toContain('/help');

      // Backspace to remove the /
      simulateInput(stdin, '', { backspace: true });
      simulateInput(stdin, 'h');

      await waitMs(RERENDER_TIMEOUT);

      output = lastFrame();
      expect(output).not.toContain('Show help');
    });
  });

  describe('edge cases', () => {
    it('should handle rapid typing', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      'hello world'.split('').forEach((char) => {
        simulateInput(stdin, char);
      });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('hello world');
    });

    it('should handle initial multiline value', () => {
      const input = {
        ...defaultInputState,
        lines: ['First line', 'Second line', 'Third line'],
      };
      const callbacks = createDefaultCallbacks();

      const { lastFrame } = renderTextInput(input, callbacks);

      const output = lastFrame();
      expect(output).toContain('First line');
      expect(output).toContain('Second line');
      expect(output).toContain('Third line');
    });

    it('should handle empty search results', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) => (word.startsWith('@') ? [] : null));

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'n');
      simulateInput(stdin, 'o');
      simulateInput(stdin, 'n');
      simulateInput(stdin, 'e');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@none');
    });

    it('should query provider on text change', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const getItemsFn = jest
        .fn<(word: string, isAtLineStart: boolean) => Promise<DropdownItem[] | null>>()
        .mockResolvedValue([]);
      const provider = createProvider(getItemsFn);

      const { stdin } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 'r');
      simulateInput(stdin, 'r');

      await waitMs(RERENDER_TIMEOUT);

      expect(getItemsFn).toHaveBeenCalled();
    });

    it('should maintain text buffer reference across renders', async () => {
      const input = { ...defaultInputState, lines: ['initial'] };
      const callbacks = createDefaultCallbacks();

      const { stdin, lastFrame } = renderTextInput(input, callbacks);

      simulateInput(stdin, 't');
      simulateInput(stdin, 'e');
      simulateInput(stdin, 's');
      simulateInput(stdin, 't');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('test');
    });
  });

  describe('item insertion', () => {
    it('should use replaceWith from the item', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@')
          ? [createDropdownItem('my file.ts', 'my file.ts', '@"src/my file.ts" ')]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 's');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('@"src/my file.ts"');
    });
  });

  describe('slash command dropdown', () => {
    it('should display slash command results with description', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word, isAtLineStart) =>
        word.startsWith('/') && isAtLineStart
          ? [
              createDropdownItem('/help', '/help', '/help ', { description: 'Show help' }),
              createDropdownItem('/new', '/new', '/new ', {
                description: 'Create new session',
              }),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('/help');
      expect(output).toContain('Show help');
      expect(output).toContain('/new');
      expect(output).toContain('Create new session');
    });

    it('should limit slash command results to 10 items', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const manyCommands = Array.from({ length: 20 }, (_, i) =>
        createDropdownItem(`/cmd${i}`, `/cmd${i}`, `/cmd${i} `, { description: `Command ${i}` }),
      );
      const provider = createProvider(async (word) => (word.startsWith('/') ? manyCommands : null));

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('/cmd0');
      expect(output).toContain('/cmd9');
      expect(output).not.toContain('/cmd10');
    });

    describe('when the item has submitAfterSelect', () => {
      it('should submit immediately when Enter is pressed', async () => {
        const input = { ...defaultInputState, lines: [''] };
        const callbacks = createDefaultCallbacks();
        const provider = createProvider(async (word) =>
          word.startsWith('/')
            ? [
                createDropdownItem('/help', '/help', '/help ', {
                  description: 'Show help',
                  submitAfterSelect: true,
                }),
              ]
            : null,
        );

        const { stdin } = renderTextInput(input, callbacks, [provider]);

        simulateInput(stdin, '/');

        await waitMs(RERENDER_TIMEOUT);

        simulateInput(stdin, '', { return: true });

        await waitMs(RERENDER_TIMEOUT);

        expect(callbacks.onSubmit).toHaveBeenCalledWith('/help ');
      });

      it('should fill but not submit when Tab is pressed', async () => {
        const input = { ...defaultInputState, lines: [''] };
        const callbacks = createDefaultCallbacks();
        const provider = createProvider(async (word) =>
          word.startsWith('/')
            ? [
                createDropdownItem('/help', '/help', '/help ', {
                  description: 'Show help',
                  submitAfterSelect: true,
                }),
                createDropdownItem('/new', '/new', '/new ', {
                  description: 'Create new session',
                  submitAfterSelect: true,
                }),
              ]
            : null,
        );

        const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

        simulateInput(stdin, '/');

        await waitMs(RERENDER_TIMEOUT);

        simulateInput(stdin, '', { downArrow: true });

        await waitMs(RERENDER_TIMEOUT);

        simulateInput(stdin, '', { tab: true });

        await waitMs(RERENDER_TIMEOUT);

        expect(callbacks.onSubmit).not.toHaveBeenCalled();
        const output = lastFrame();
        expect(output).toContain('/new');
      });

      describe('when on a Kitty protocol terminal', () => {
        it('should not double-submit when Enter emits both press and release events', async () => {
          const input = { ...defaultInputState, lines: [''] };
          const callbacks = createDefaultCallbacks();
          const provider = createProvider(async (word) =>
            word.startsWith('/')
              ? [
                  createDropdownItem('/help', '/help', '/help ', {
                    description: 'Show help',
                    submitAfterSelect: true,
                  }),
                ]
              : null,
          );

          const { stdin } = renderTextInput(input, callbacks, [provider], {
            isKittyProtocolSupported: true,
          });

          simulateInput(stdin, '/');

          await waitMs(RERENDER_TIMEOUT);

          // Kitty protocol emits both press (\r = 0x0d) and release (\x1b[13;1:3u) for each Enter keypress
          stdin.write('\r'); // Enter press — should select and submit

          // Wait for re-render: the dropdown closes
          await waitMs(RERENDER_TIMEOUT);

          stdin.write('\x1b[13;1:3u'); // Enter release — should NOT submit again

          await waitMs(RERENDER_TIMEOUT);

          expect(callbacks.onSubmit).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('when the item does not have submitAfterSelect', () => {
      it('should fill but not submit when Enter is pressed', async () => {
        const input = { ...defaultInputState, lines: [''] };
        const callbacks = createDefaultCallbacks();
        const provider = createProvider(async (word) =>
          word.startsWith('/')
            ? [createDropdownItem('/help', '/help', '/help ', { description: 'Show help' })]
            : null,
        );

        const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

        simulateInput(stdin, '/');

        await waitMs(RERENDER_TIMEOUT);

        simulateInput(stdin, '', { return: true });

        await waitMs(RERENDER_TIMEOUT);

        expect(callbacks.onSubmit).not.toHaveBeenCalled();
        const output = lastFrame();
        expect(output).toContain('/help');
      });
    });

    it('should insert selected slash command with Tab key', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('/')
          ? [
              createDropdownItem('/help', '/help', '/help ', { description: 'Show help' }),
              createDropdownItem('/new', '/new', '/new ', {
                description: 'Create new session',
              }),
            ]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { downArrow: true });

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { tab: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
      const output = lastFrame();
      expect(output).toContain('/new');
    });

    it('should pass ignoreKeys to MultilineTextInput when dropdown is active', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('/')
          ? [createDropdownItem('/help', '/help', '/help ', { description: 'Show help' })]
          : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '/');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { upArrow: true });
      simulateInput(stdin, '', { downArrow: true });

      await waitMs(RERENDER_TIMEOUT);

      const output = lastFrame();
      expect(output).toContain('/');
    });
  });

  describe('file context (@) dropdown', () => {
    it('should fill the filename but not submit when Enter is pressed', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      // Items without submitAfterSelect — simulates the file context provider
      const provider = createProvider(async (word) =>
        word.startsWith('@') ? [createDropdownItem('file1.ts', 'file1.ts', '@file1.ts ')] : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { return: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
      const output = lastFrame();
      expect(output).toContain('@file1.ts');
    });

    it('should fill the filename but not submit when Tab is pressed', async () => {
      const input = { ...defaultInputState, lines: [''] };
      const callbacks = createDefaultCallbacks();
      const provider = createProvider(async (word) =>
        word.startsWith('@') ? [createDropdownItem('file1.ts', 'file1.ts', '@file1.ts ')] : null,
      );

      const { stdin, lastFrame } = renderTextInput(input, callbacks, [provider]);

      simulateInput(stdin, '@');
      simulateInput(stdin, 'f');

      await waitMs(RERENDER_TIMEOUT);

      simulateInput(stdin, '', { tab: true });

      await waitMs(RERENDER_TIMEOUT);

      expect(callbacks.onSubmit).not.toHaveBeenCalled();
      const output = lastFrame();
      expect(output).toContain('@file1.ts');
    });
  });
});
