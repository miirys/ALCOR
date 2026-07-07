import { ref, computed, watch } from 'vue';
import { INCLUDE_COMMAND, type GitlabChatSlashCommand } from '../utils/slashCommands';

interface UseSlashCommandsOptions {
  prompt: () => string;
  commands: () => GitlabChatSlashCommand[];
  hasContextSupport: () => boolean;
  onSelect: (command: GitlabChatSlashCommand) => void;
}

export function useSlashCommands(options: UseSlashCommandsOptions) {
  const activeIndex = ref(0);
  const dismissed = ref(false);

  const caseInsensitivePrompt = computed(() => options.prompt().trim().toLowerCase());

  const filteredCommands = computed(() =>
    options
      .commands()
      .filter((c) => c.name.toLowerCase().startsWith(caseInsensitivePrompt.value))
      .filter((c) => (c.name === INCLUDE_COMMAND ? options.hasContextSupport() : true)),
  );

  const shouldShow = computed(() => {
    if (dismissed.value) return false;
    const all = options.commands();
    if (!all.length || !caseInsensitivePrompt.value.startsWith('/')) return false;
    const matchesExisting = all.some((c) =>
      caseInsensitivePrompt.value.startsWith(c.name.toLocaleLowerCase()),
    );
    return filteredCommands.value.length > 0 && !matchesExisting;
  });

  // Re-open the menu once the user edits the prompt after dismissing it.
  watch(caseInsensitivePrompt, () => {
    dismissed.value = false;
  });

  watch(filteredCommands, () => {
    activeIndex.value = 0;
  });

  const selectAt = (index: number) => {
    const command = filteredCommands.value[index];
    if (command) options.onSelect(command);
  };

  const handleKeyDown = (event: KeyboardEvent): boolean => {
    if (!shouldShow.value) return false;

    const { length } = filteredCommands.value;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        activeIndex.value = (activeIndex.value + 1) % length;
        return true;
      case 'ArrowUp':
        event.preventDefault();
        activeIndex.value = (activeIndex.value - 1 + length) % length;
        return true;
      case 'Tab':
        event.preventDefault();
        selectAt(activeIndex.value);
        return true;
      case 'Enter':
        if (event.shiftKey) return false;
        event.preventDefault();
        selectAt(activeIndex.value);
        return true;
      case 'Escape':
        event.preventDefault();
        dismissed.value = true;
        return true;
      default:
        return false;
    }
  };

  return { filteredCommands, shouldShow, activeIndex, selectAt, handleKeyDown };
}
