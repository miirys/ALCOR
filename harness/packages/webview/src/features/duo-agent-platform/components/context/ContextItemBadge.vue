<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import type { AIContextItem } from '@gitlab-org/lib-duo-agent-platform/webview';
import { HoverCardContent, HoverCardPortal, HoverCardRoot, HoverCardTrigger } from 'reka-ui';
import { getCategoryIcon } from './utils';

const props = defineProps<{
  item: AIContextItem;
}>();

defineEmits<{
  remove: [item: AIContextItem];
}>();

const typeIcon = computed(() => getCategoryIcon(props.item.category));
const displayTitle = computed(() => props.item.metadata.title || props.item.id);
const secondary = computed(() => props.item.metadata.secondaryText);
const subTypeLabel = computed(() => props.item.metadata.subTypeLabel);
const disabledReason = computed(() => {
  if (props.item.metadata.enabled !== false) return null;
  return props.item.metadata.disabledReasons?.[0] ?? null;
});
</script>

<template>
  <HoverCardRoot :open-delay="200" :close-delay="80">
    <HoverCardTrigger as-child>
      <span
        class="inline-flex items-center gap-1 h-6 pl-1.5 pr-1 rounded bg-muted text-xs text-muted-foreground max-w-48"
      >
        <component :is="typeIcon" class="size-3 shrink-0" />
        <span class="truncate">{{ displayTitle }}</span>
        <button
          class="inline-flex items-center justify-center size-4 rounded-sm hover:bg-muted-foreground/20 shrink-0"
          aria-label="Remove context item"
          @click.stop="$emit('remove', item)"
        >
          <X class="size-3" />
        </button>
      </span>
    </HoverCardTrigger>
    <HoverCardPortal>
      <HoverCardContent
        :side-offset="6"
        align="start"
        class="z-50 w-72 rounded-md border p-3 shadow-md text-xs bg-popover text-popover-foreground"
      >
        <div class="flex items-start gap-2">
          <component :is="typeIcon" class="size-4 shrink-0 mt-0.5 text-muted-foreground" />
          <div class="flex-1 min-w-0">
            <p class="font-medium break-all">{{ displayTitle }}</p>
            <p v-if="secondary" class="text-muted-foreground break-all mt-0.5">{{ secondary }}</p>
          </div>
        </div>
        <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
          <dt class="font-medium">Type</dt>
          <dd>{{ subTypeLabel }}</dd>
          <template v-if="disabledReason">
            <dt class="font-medium">Disabled</dt>
            <dd class="italic">{{ disabledReason }}</dd>
          </template>
        </dl>
      </HoverCardContent>
    </HoverCardPortal>
  </HoverCardRoot>
</template>
