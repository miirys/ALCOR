import { describe, it, expect, vi } from 'vitest';
import { ref, nextTick } from 'vue';
import type { GitlabChatSlashCommand } from '../utils/slashCommands';
import { useSlashCommands } from './useSlashCommands';

const commands: GitlabChatSlashCommand[] = [
  { name: '/new', description: 'New chat conversation.' },
  { name: '/tests', description: 'Generate tests.' },
  { name: '/include', description: 'Include additional context.' },
  { name: '/help', description: 'Learn what Chat can do.' },
];

function setup(overrides: Partial<Parameters<typeof useSlashCommands>[0]> = {}) {
  const prompt = ref('');
  const hasContextSupport = ref(true);
  const onSelect = vi.fn();

  const api = useSlashCommands({
    prompt: () => prompt.value,
    commands: () => commands,
    hasContextSupport: () => hasContextSupport.value,
    onSelect,
    ...overrides,
  });

  return { prompt, hasContextSupport, onSelect, ...api };
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, ...init });
  vi.spyOn(event, 'preventDefault');
  return event;
}

describe('useSlashCommands', () => {
  describe('filteredCommands', () => {
    it('filters by case-insensitive prefix', () => {
      const { prompt, filteredCommands } = setup();
      prompt.value = '/TE';
      expect(filteredCommands.value.map((c) => c.name)).toEqual(['/tests']);
    });

    it('returns all commands for a bare slash', () => {
      const { prompt, filteredCommands } = setup();
      prompt.value = '/';
      expect(filteredCommands.value).toHaveLength(commands.length);
    });

    it('hides /include when context is unsupported', () => {
      const { prompt, hasContextSupport, filteredCommands } = setup();
      hasContextSupport.value = false;
      prompt.value = '/';
      expect(filteredCommands.value.map((c) => c.name)).not.toContain('/include');
    });
  });

  describe('shouldShow', () => {
    it('is false when the prompt does not start with a slash', () => {
      const { prompt, shouldShow } = setup();
      prompt.value = 'hello';
      expect(shouldShow.value).toBe(false);
    });

    it('is true when a partial command matches', () => {
      const { prompt, shouldShow } = setup();
      prompt.value = '/te';
      expect(shouldShow.value).toBe(true);
    });

    it('is false once the prompt fully matches a command', () => {
      const { prompt, shouldShow } = setup();
      prompt.value = '/tests';
      expect(shouldShow.value).toBe(false);
    });

    it('is false when nothing matches', () => {
      const { prompt, shouldShow } = setup();
      prompt.value = '/zzz';
      expect(shouldShow.value).toBe(false);
    });
  });

  describe('activeIndex', () => {
    it('resets to the first item when the filtered list changes', async () => {
      const { prompt, activeIndex } = setup();
      prompt.value = '/';
      await nextTick();
      activeIndex.value = 2;

      prompt.value = '/t';
      await nextTick();
      expect(activeIndex.value).toBe(0);
    });
  });

  describe('handleKeyDown', () => {
    it('returns false and does nothing when the menu is hidden', () => {
      const { handleKeyDown } = setup();
      const event = press('ArrowDown');
      expect(handleKeyDown(event)).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('cycles the active item with ArrowDown, wrapping at the end', () => {
      const { prompt, activeIndex, handleKeyDown } = setup();
      prompt.value = '/';
      activeIndex.value = commands.length - 1;
      expect(handleKeyDown(press('ArrowDown'))).toBe(true);
      expect(activeIndex.value).toBe(0);
    });

    it('cycles the active item with ArrowUp, wrapping at the start', () => {
      const { prompt, activeIndex, handleKeyDown } = setup();
      prompt.value = '/';
      activeIndex.value = 0;
      expect(handleKeyDown(press('ArrowUp'))).toBe(true);
      expect(activeIndex.value).toBe(commands.length - 1);
    });

    it('selects the active command on Enter', () => {
      const { prompt, activeIndex, onSelect, handleKeyDown } = setup();
      prompt.value = '/';
      activeIndex.value = 1;
      expect(handleKeyDown(press('Enter'))).toBe(true);
      expect(onSelect).toHaveBeenCalledWith(commands[1]);
    });

    it('selects the active command on Tab', () => {
      const { prompt, onSelect, handleKeyDown } = setup();
      prompt.value = '/';
      expect(handleKeyDown(press('Tab'))).toBe(true);
      expect(onSelect).toHaveBeenCalledWith(commands[0]);
    });

    it('ignores Shift+Enter so a newline can be inserted', () => {
      const { prompt, onSelect, handleKeyDown } = setup();
      prompt.value = '/';
      const event = press('Enter', { shiftKey: true });
      expect(handleKeyDown(event)).toBe(false);
      expect(onSelect).not.toHaveBeenCalled();
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('hides the menu on Escape without clearing the prompt', () => {
      const { prompt, shouldShow, handleKeyDown } = setup();
      prompt.value = '/te';
      expect(shouldShow.value).toBe(true);

      expect(handleKeyDown(press('Escape'))).toBe(true);
      expect(shouldShow.value).toBe(false);
      expect(prompt.value).toBe('/te');
    });

    it('re-opens the menu once the prompt changes after Escape', async () => {
      const { prompt, shouldShow, handleKeyDown } = setup();
      prompt.value = '/te';
      handleKeyDown(press('Escape'));
      expect(shouldShow.value).toBe(false);

      prompt.value = '/tes';
      await nextTick();
      expect(shouldShow.value).toBe(true);
    });
  });

  describe('selectAt', () => {
    it('selects the command at the given index', () => {
      const { prompt, onSelect, selectAt } = setup();
      prompt.value = '/';
      selectAt(2);
      expect(onSelect).toHaveBeenCalledWith(commands[2]);
    });

    it('does nothing for an out-of-range index', () => {
      const { prompt, onSelect, selectAt } = setup();
      prompt.value = '/';
      selectAt(99);
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
