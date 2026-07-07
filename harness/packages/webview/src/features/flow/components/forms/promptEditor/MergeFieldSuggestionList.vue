<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import type { MergeFieldSuggestionItem } from './extensions';

const props = defineProps<{
  items: MergeFieldSuggestionItem[];
  // eslint-disable-next-line no-unused-vars
  command: (item: MergeFieldSuggestionItem) => void;
  /** When set, renders a "Wire {{varName}}" header for configure mode. */
  editingContext?: { varName: string; instanceCount: number } | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

interface ItemGroup {
  key: string;
  label: string;
  nodeType: string;
  items: MergeFieldSuggestionItem[];
}

const groups = computed<ItemGroup[]>(() => {
  const groupMap = new Map<string, ItemGroup>();
  for (const item of props.items) {
    const key = `${item.sourceNodeType}:${item.sourceNodeLabel}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { key, label: item.sourceNodeLabel, nodeType: item.sourceNodeType, items: [] };
      groupMap.set(key, group);
    }
    group.items.push(item);
  }
  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.nodeType === 'workflow') return -1;
    if (b.nodeType === 'workflow') return 1;
    return a.label.localeCompare(b.label);
  });
});

const flatItems = computed(() => groups.value.flatMap((g) => g.items));

const activeIndex = ref(0);
const listRef = ref<HTMLElement | null>(null);

watch(
  () => props.items,
  () => {
    activeIndex.value = 0;
  },
);

function scrollActiveIntoView() {
  nextTick(() => {
    listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  });
}

function onKeyDown(event: KeyboardEvent): boolean {
  if (flatItems.value.length === 0) return false;

  if (event.key === 'ArrowDown') {
    activeIndex.value = (activeIndex.value + 1) % flatItems.value.length;
    scrollActiveIntoView();
    return true;
  }
  if (event.key === 'ArrowUp') {
    activeIndex.value = (activeIndex.value - 1 + flatItems.value.length) % flatItems.value.length;
    scrollActiveIntoView();
    return true;
  }
  if (event.key === 'Enter') {
    const item = flatItems.value[activeIndex.value];
    if (item) props.command(item);
    return true;
  }
  if (event.key === 'Escape') {
    emit('close');
    return true;
  }

  return false;
}

onMounted(() => scrollActiveIntoView());
defineExpose({ onKeyDown });

const DOT_COLORS: Record<string, string> = {
  agent: 'bg-purple-400',
  tool: 'bg-blue-400',
  'ai-task': 'bg-emerald-400',
  workflow: 'bg-amber-400',
};

function dotColor(nodeType: string): string {
  return DOT_COLORS[nodeType] ?? 'bg-muted-foreground/50';
}

function flatIndex(item: MergeFieldSuggestionItem): number {
  return flatItems.value.indexOf(item);
}
</script>

<template>
  <div
    ref="listRef"
    role="listbox"
    class="w-64 max-h-[280px] overflow-y-auto rounded-xl border border-border bg-popover shadow-xl"
  >
    <!-- Configure mode header -->
    <div v-if="editingContext" class="px-3 py-2 border-b border-border bg-muted/30">
      <div class="text-xs font-medium text-foreground">
        Wire
        <code class="font-mono bg-muted px-1 rounded"
          >&#123;&#123;{{ editingContext.varName }}&#125;&#125;</code
        >
      </div>
      <div v-if="editingContext.instanceCount > 1" class="text-[10px] text-muted-foreground mt-0.5">
        Applies to all {{ editingContext.instanceCount }} instances
      </div>
    </div>

    <div v-if="items.length === 0" class="px-3 py-4 text-center text-xs text-muted-foreground">
      No matching outputs
    </div>

    <template v-for="group in groups" :key="group.key">
      <div
        class="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 backdrop-blur-sm border-b border-border/50"
      >
        <span :class="['inline-block size-2 shrink-0 rounded-full', dotColor(group.nodeType)]" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {{ group.label }}
        </span>
      </div>

      <button
        v-for="item in group.items"
        :key="item.path"
        role="option"
        :aria-selected="flatIndex(item) === activeIndex"
        :data-active="flatIndex(item) === activeIndex"
        class="flex w-full items-center gap-2 py-1.5 text-left text-xs transition-colors hover:bg-accent border-l-2 border-transparent pl-2.5 pr-3"
        :class="flatIndex(item) === activeIndex && 'bg-accent border-primary pl-2.5'"
        @click="command(item)"
        @mouseenter="activeIndex = flatIndex(item)"
      >
        <div class="flex-1 min-w-0">
          <div class="truncate font-medium text-foreground">{{ item.fieldName }}</div>
          <div v-if="item.description" class="truncate text-[10px] text-muted-foreground">
            {{ item.description }}
          </div>
        </div>
        <span
          v-if="item.schemaType"
          class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground"
        >
          {{ item.schemaType }}
        </span>
        <kbd
          v-if="flatIndex(item) === activeIndex"
          class="shrink-0 px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground/50"
          >↵</kbd
        >
      </button>
    </template>
  </div>
</template>
