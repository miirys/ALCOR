<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Search, Link2Off, Bot, Wrench, Cpu, Workflow, Check } from 'lucide-vue-next';
import type { Component as VueComponent } from 'vue';
import type { AvailableOutput } from '../../../utils/outputCatalog';
import type { BindingStatus } from '../../../types';

const props = defineProps<{
  currentPath: string;
  availableOutputs: AvailableOutput[];
  schemaType: string;
  status: BindingStatus | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:path': [path: string];
  'highlight:node': [nodeId: string | null];
}>();

const searchQuery = ref('');
const isDropdownOpen = ref(false);
const activeIndex = ref(-1);
const containerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLDivElement | null>(null);

// ─── Icon mapping for source node types ──────────────────────────────
const NODE_TYPE_ICONS: Record<string, { icon: VueComponent; color: string }> = {
  agent: { icon: Bot, color: 'text-violet-500' },
  tool: { icon: Wrench, color: 'text-blue-500' },
  'ai-task': { icon: Cpu, color: 'text-emerald-500' },
  workflow: { icon: Workflow, color: 'text-amber-500' },
};

function getSourceIcon(nodeType: string) {
  return NODE_TYPE_ICONS[nodeType] ?? { icon: Cpu, color: 'text-muted-foreground' };
}

// ─── Grouped outputs ─────────────────────────────────────────────────
interface OutputGroup {
  key: string;
  label: string;
  nodeType: string;
  items: AvailableOutput[];
}

const filteredOutputs = computed(() => {
  const q = searchQuery.value.toLowerCase();
  if (!q) return props.availableOutputs;
  return props.availableOutputs.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      o.sourceNodeLabel.toLowerCase().includes(q) ||
      (o.description?.toLowerCase().includes(q) ?? false),
  );
});

const groupedOutputs = computed<OutputGroup[]>(() => {
  const groupMap = new Map<string, OutputGroup>();

  for (const output of filteredOutputs.value) {
    const key = output.sourceNodeId || '__workflow__';
    let group = groupMap.get(key);
    if (!group) {
      group = {
        key,
        label: output.sourceNodeLabel,
        nodeType: output.sourceNodeType,
        items: [],
      };
      groupMap.set(key, group);
    }
    group.items.push(output);
  }

  // Workflow inputs first, then nodes alphabetically
  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.nodeType === 'workflow') return -1;
    if (b.nodeType === 'workflow') return 1;
    return a.label.localeCompare(b.label);
  });
});

// Flat list for keyboard navigation (index across all groups)
const flatItems = computed(() => groupedOutputs.value.flatMap((g) => g.items));

const currentOutput = computed(() =>
  props.availableOutputs.find((o) => o.path === props.currentPath),
);

const isBroken = computed(() => props.status?.state === 'broken');

function isTypeCompatible(output: AvailableOutput): boolean {
  if (!output.schemaType || !props.schemaType) return true;
  const actual = Array.isArray(output.schemaType) ? output.schemaType[0] : output.schemaType;
  return actual === props.schemaType;
}

// Reset active index when filtered list changes
watch(filteredOutputs, () => {
  activeIndex.value = -1;
});

// Focus search input when dropdown opens
watch(isDropdownOpen, async (open) => {
  if (open) {
    await nextTick();
    searchInputRef.value?.focus();
  } else {
    searchQuery.value = '';
    activeIndex.value = -1;
    emit('highlight:node', null);
  }
});

function openDropdown() {
  if (props.disabled) return;
  isDropdownOpen.value = true;
}

function closeDropdown() {
  isDropdownOpen.value = false;
}

onClickOutside(containerRef, () => {
  if (isDropdownOpen.value) closeDropdown();
});

function selectOutput(output: AvailableOutput) {
  emit('update:path', output.path);
  closeDropdown();
}

function scrollActiveIntoView() {
  nextTick(() => {
    const activeEl = listRef.value?.querySelector('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  });
}

function emitHighlight() {
  const item = activeIndex.value >= 0 ? flatItems.value[activeIndex.value] : undefined;
  emit('highlight:node', item?.sourceNodeId || null);
}

function handleKeydown(event: KeyboardEvent) {
  const count = flatItems.value.length;
  if (count === 0) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      activeIndex.value = (activeIndex.value + 1) % count;
      scrollActiveIntoView();
      emitHighlight();
      break;

    case 'ArrowUp':
      event.preventDefault();
      activeIndex.value = (activeIndex.value - 1 + count) % count;
      scrollActiveIntoView();
      emitHighlight();
      break;

    case 'Enter':
      event.preventDefault();
      if (activeIndex.value >= 0 && activeIndex.value < count) {
        const selected = flatItems.value[activeIndex.value];
        if (selected) selectOutput(selected);
      }
      break;

    case 'Escape':
      event.preventDefault();
      closeDropdown();
      break;

    default:
      break;
  }
}

function getFlatIndex(output: AvailableOutput): number {
  return flatItems.value.indexOf(output);
}

function handleMouseEnter(output: AvailableOutput) {
  activeIndex.value = getFlatIndex(output);
  emitHighlight();
}

function handleMouseLeave() {
  emit('highlight:node', null);
}

/** Extract the output field name from a display path (e.g. "context:analyzer.findings" → "findings") */
function getOutputFieldName(output: AvailableOutput): string {
  const parts = output.displayPath.split('.');
  return parts.length > 1 ? (parts.pop() ?? output.label) : output.label;
}
</script>

<template>
  <div ref="containerRef" class="relative" @keydown="handleKeydown">
    <!-- Current selection display -->
    <button
      type="button"
      class="flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm text-left transition-all"
      :class="[
        isBroken
          ? 'border-destructive/50 bg-destructive/5'
          : currentPath
            ? 'border-primary/30 bg-primary/5'
            : 'border-input bg-background',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-ring cursor-pointer',
      ]"
      :disabled="disabled"
      @click="isDropdownOpen ? closeDropdown() : openDropdown()"
    >
      <Link2Off v-if="isBroken" class="h-4 w-4 text-destructive shrink-0" />
      <template v-else-if="currentOutput">
        <component
          :is="getSourceIcon(currentOutput.sourceNodeType).icon"
          class="h-4 w-4 shrink-0"
          :class="getSourceIcon(currentOutput.sourceNodeType).color"
        />
      </template>
      <Search v-else class="h-4 w-4 text-muted-foreground shrink-0" />

      <span v-if="currentOutput" class="flex-1 truncate text-xs">
        <span class="text-muted-foreground">{{ currentOutput.sourceNodeLabel }}</span>
        <span class="text-muted-foreground mx-1">&rarr;</span>
        <span class="text-foreground font-medium">{{ getOutputFieldName(currentOutput) }}</span>
      </span>
      <span
        v-else-if="currentPath && isBroken"
        class="flex-1 truncate font-mono text-xs text-destructive/70 line-through"
      >
        {{ currentPath }}
      </span>
      <span v-else class="flex-1 text-muted-foreground text-xs">
        Select an upstream output...
      </span>

      <span
        v-if="currentOutput?.schemaType"
        class="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
      >
        {{ currentOutput.schemaType }}
      </span>
    </button>

    <!-- Dropdown -->
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="isDropdownOpen && !disabled"
        class="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden"
      >
        <!-- Search -->
        <div class="p-2 border-b border-border">
          <div class="relative">
            <Search
              class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            />
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              placeholder="Search outputs..."
              class="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
              @click.stop
            />
          </div>
        </div>

        <!-- Grouped options -->
        <div ref="listRef" class="overflow-y-auto max-h-64" @mouseleave="handleMouseLeave">
          <div
            v-if="groupedOutputs.length === 0"
            class="p-6 text-center text-xs text-muted-foreground"
          >
            No upstream outputs available
          </div>

          <div v-for="group in groupedOutputs" :key="group.key">
            <!-- Group header -->
            <div
              class="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 backdrop-blur-sm border-b border-border/50"
            >
              <component
                :is="getSourceIcon(group.nodeType).icon"
                class="h-3 w-3"
                :class="getSourceIcon(group.nodeType).color"
              />
              <span
                class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {{ group.label }}
              </span>
              <span class="text-[9px] text-muted-foreground/60">
                {{ group.items.length }}
              </span>
            </div>

            <!-- Group items -->
            <button
              v-for="output in group.items"
              :key="output.path"
              :data-active="getFlatIndex(output) === activeIndex"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              :class="[
                getFlatIndex(output) === activeIndex ? 'bg-accent' : 'hover:bg-accent/50',
                output.path === currentPath ? 'bg-primary/5' : '',
              ]"
              @click="selectOutput(output)"
              @mouseenter="handleMouseEnter(output)"
            >
              <!-- Output field name -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <span class="text-xs font-medium text-foreground truncate">
                    {{ getOutputFieldName(output) }}
                  </span>
                  <Check v-if="output.path === currentPath" class="h-3 w-3 text-primary shrink-0" />
                </div>
                <p
                  v-if="output.description"
                  class="text-[10px] text-muted-foreground truncate mt-0.5 leading-tight"
                >
                  {{ output.description }}
                </p>
              </div>

              <!-- Type badge -->
              <span
                v-if="output.schemaType"
                class="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded"
                :class="
                  isTypeCompatible(output)
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                "
              >
                {{ output.schemaType }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
