<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { Hammer } from 'lucide-vue-next';
import type { GitlabChatSlashCommand } from '../../utils/slashCommands';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  commands: GitlabChatSlashCommand[];
  activeIndex: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  select: [index: number];
  'update:activeIndex': [index: number];
}>();

const listRef = ref<HTMLElement | null>(null);

watch(
  () => props.activeIndex,
  () => {
    nextTick(() => {
      listRef.value
        ?.querySelector<HTMLElement>('[data-active="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  },
);
</script>

<template>
  <div
    class="absolute left-0 right-0 bottom-full mb-2 rounded-md border shadow-md z-10 bg-popover text-popover-foreground overflow-hidden"
    data-testid="slash-commands-menu"
    role="listbox"
  >
    <TooltipProvider>
      <div ref="listRef" class="max-h-60 overflow-y-auto p-1">
        <div
          v-for="(command, index) in commands"
          :key="command.name"
          role="option"
          :aria-selected="index === activeIndex"
          :data-active="index === activeIndex"
          :data-testid="`slash-command-${command.name.slice(1)}`"
          class="flex flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-xs cursor-default select-none data-[active=true]:bg-primary data-[active=true]:text-primary-foreground"
          @click="emit('select', index)"
          @mouseenter="emit('update:activeIndex', index)"
          @mousedown.prevent
        >
          <div class="flex items-center gap-1">
            <span class="font-medium">{{ command.name }}</span>
            <Tooltip v-if="command.isSkill">
              <TooltipTrigger as-child>
                <Hammer class="h-3 w-3" aria-label="Agent skill" />
              </TooltipTrigger>
              <TooltipContent
                :collision-padding="8"
                class="max-w-(--reka-tooltip-content-available-width)"
              >
                <p class="font-medium">Agent skill</p>
                <p class="text-primary-foreground/70">
                  Optional: add a goal after the command to steer it, e.g. “{{ command.name }}
                  to summarize the changes”.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span
            class="text-muted-foreground"
            :class="{ 'text-primary-foreground/80': index === activeIndex }"
            >{{ command.description }}</span
          >
        </div>
      </div>
    </TooltipProvider>
  </div>
</template>
