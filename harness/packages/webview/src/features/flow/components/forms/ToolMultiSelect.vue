<script setup lang="ts">
import { ref, computed, watch, nextTick, useId } from 'vue';
import { onClickOutside } from '@vueuse/core';
import { Search, ChevronDown, Check, X, Plus, AlertTriangle } from 'lucide-vue-next';
import type { ToolDefinition } from '../../types';
import { useFlow } from '../../composables/useFlow';
import { groupToolsByTopCategory, resolveCategoryIcon } from '../../utils/tools';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const props = defineProps<{
  modelValue?: string[];
  label: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string[]];
}>();

const { toolDefinitions } = useFlow();

const containerRef = ref<HTMLElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);

const isDropdownOpen = ref(false);
const searchQuery = ref('');
const activeIndex = ref(-1);
const collapsedTop = ref<Set<string>>(new Set());

const uid = useId();
const triggerId = `${uid}-trigger`;
const listboxId = `${uid}-listbox`;
const CUSTOM_OPTION_KEY = '__custom__';
function optionId(name: string): string {
  return `${uid}-option-${name}`;
}

const selected = computed(() => props.modelValue ?? []);
const selectedSet = computed(() => new Set(selected.value));

const toolsByName = computed(() => {
  const map = new Map<string, ToolDefinition>();
  for (const t of toolDefinitions.value) map.set(t.name, t);
  return map;
});

// ─── Filtering ─────────────────────────────────────────────────────────

const normalizedQuery = computed(() => searchQuery.value.trim().toLowerCase());

const filteredTools = computed(() => {
  const q = normalizedQuery.value;
  if (!q) return toolDefinitions.value;
  return toolDefinitions.value.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );
});

const groupedTools = computed(() => groupToolsByTopCategory(filteredTools.value));

// A top-level group is only collapsed when the user is not searching — an
// active query auto-expands everything so matches are never hidden.
function isTopCollapsed(key: string): boolean {
  if (normalizedQuery.value) return false;
  return collapsedTop.value.has(key);
}

function toggleTopCollapsed(key: string) {
  const next = new Set(collapsedTop.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsedTop.value = next;
}

// Flat list of tool names for keyboard nav, in render order (top → subcategory → tool).
// Only includes rows inside expanded top-level groups so arrow keys track visible rows.
const flatToolNames = computed(() =>
  groupedTools.value
    .filter((top) => !isTopCollapsed(top.key))
    .flatMap((top) => top.subcategories.flatMap((sub) => sub.tools.map((t) => t.name))),
);

// ─── Custom-tool affordance ────────────────────────────────────────────

const trimmedQuery = computed(() => searchQuery.value.trim());

const showAddCustomRow = computed(() => {
  const q = trimmedQuery.value;
  if (!q) return false;
  if (selectedSet.value.has(q)) return false;
  return !toolsByName.value.has(q);
});

// Total navigable entries (tool rows + optional custom row)
const totalNavigable = computed(
  () => flatToolNames.value.length + (showAddCustomRow.value ? 1 : 0),
);

const isCustomRowActive = computed(
  () => showAddCustomRow.value && activeIndex.value === flatToolNames.value.length,
);

// ─── Stale detection for pills ─────────────────────────────────────────

function isStale(name: string): boolean {
  return !toolsByName.value.has(name);
}

function labelFor(name: string): string {
  return toolsByName.value.get(name)?.label ?? name;
}

// ─── Open / close ──────────────────────────────────────────────────────

function openDropdown() {
  isDropdownOpen.value = true;
}

function closeDropdown() {
  isDropdownOpen.value = false;
}

watch(isDropdownOpen, async (open) => {
  if (open) {
    await nextTick();
    searchInputRef.value?.focus();
    activeIndex.value = totalNavigable.value > 0 ? 0 : -1;
  } else {
    searchQuery.value = '';
    activeIndex.value = -1;
  }
});

// Reset to the first navigable row whenever the visible list changes
// (search edits, category collapses, custom-row appears/disappears). Snapping
// to index 0 means Enter selects the top match without an extra ArrowDown.
watch([flatToolNames, showAddCustomRow], () => {
  if (!isDropdownOpen.value) return;
  activeIndex.value = totalNavigable.value > 0 ? 0 : -1;
});

onClickOutside(containerRef, () => {
  if (isDropdownOpen.value) closeDropdown();
});

// ─── Selection ────────────────────────────────────────────────────────

function toggleTool(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const current = selected.value;
  if (selectedSet.value.has(trimmed)) {
    emit(
      'update:modelValue',
      current.filter((n) => n !== trimmed),
    );
  } else {
    emit('update:modelValue', [...current, trimmed]);
  }
}

function removePill(name: string) {
  emit(
    'update:modelValue',
    selected.value.filter((n) => n !== name),
  );
}

function addCustomTool() {
  const q = trimmedQuery.value;
  if (!q || selectedSet.value.has(q) || toolsByName.value.has(q)) return;
  emit('update:modelValue', [...selected.value, q]);
  searchQuery.value = '';
  activeIndex.value = -1;
}

// ─── Keyboard nav ─────────────────────────────────────────────────────

function scrollActiveIntoView() {
  nextTick(() => {
    const el = listRef.value?.querySelector('[data-active="true"]');
    // Runtime guard: jsdom doesn't implement scrollIntoView.
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  });
}

function handleKeydown(event: KeyboardEvent) {
  if (!isDropdownOpen.value) {
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      openDropdown();
    }
    return;
  }

  const count = totalNavigable.value;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      if (count === 0) return;
      activeIndex.value = (activeIndex.value + 1) % count;
      scrollActiveIntoView();
      break;

    case 'ArrowUp':
      event.preventDefault();
      if (count === 0) return;
      activeIndex.value = (activeIndex.value - 1 + count) % count;
      scrollActiveIntoView();
      break;

    case 'Enter':
      event.preventDefault();
      if (activeIndex.value < 0) return;
      if (isCustomRowActive.value) {
        addCustomTool();
      } else {
        const name = flatToolNames.value[activeIndex.value];
        if (name) toggleTool(name);
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

function flatIndexOf(name: string): number {
  return flatToolNames.value.indexOf(name);
}

const activeOptionId = computed(() => {
  if (activeIndex.value < 0) return undefined;
  if (isCustomRowActive.value) return optionId(CUSTOM_OPTION_KEY);
  const name = flatToolNames.value[activeIndex.value];
  return name ? optionId(name) : undefined;
});

const triggerLabel = computed(() => {
  const n = selected.value.length;
  if (n === 0) return props.placeholder ?? 'Add tools';
  const noun = n === 1 ? 'tool' : 'tools';
  return `${n} ${noun} · Add more`;
});
</script>

<template>
  <div class="space-y-2">
    <Label :for="triggerId" class="text-xs uppercase tracking-wider text-muted-foreground">
      {{ label }}
    </Label>

    <!-- Selected pills -->
    <TooltipProvider>
      <div class="flex flex-wrap gap-2">
        <template v-for="name in selected" :key="name">
          <Tooltip v-if="isStale(name)">
            <TooltipTrigger as-child>
              <Badge
                variant="outline"
                class="gap-1 max-w-[180px] font-mono font-normal text-amber-600 border-amber-500/40"
              >
                <AlertTriangle class="w-3 h-3 shrink-0" />
                <span class="truncate">{{ name }}</span>
                <button
                  type="button"
                  class="shrink-0 ml-1 rounded-sm ring-offset-background transition-colors hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  :aria-label="`Remove ${labelFor(name)}`"
                  @click="removePill(name)"
                >
                  <X class="w-3 h-3" />
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{{ name }} · Tool not available on this instance</TooltipContent>
          </Tooltip>
          <Tooltip v-else>
            <TooltipTrigger as-child>
              <Badge variant="secondary" class="gap-1 max-w-[180px] font-normal">
                <span class="truncate">{{ labelFor(name) }}</span>
                <button
                  type="button"
                  class="shrink-0 ml-1 rounded-sm ring-offset-background transition-colors hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  :aria-label="`Remove ${labelFor(name)}`"
                  @click="removePill(name)"
                >
                  <X class="w-3 h-3" />
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{{ labelFor(name) }} · {{ name }}</TooltipContent>
          </Tooltip>
        </template>
      </div>
    </TooltipProvider>

    <!-- Picker -->
    <div ref="containerRef" class="relative" @keydown="handleKeydown">
      <button
        :id="triggerId"
        type="button"
        class="flex items-center gap-2 w-full px-3 py-2 rounded-md border text-sm text-left transition-all border-input bg-background hover:border-ring"
        :aria-expanded="isDropdownOpen"
        :aria-controls="listboxId"
        aria-haspopup="listbox"
        @click="isDropdownOpen ? closeDropdown() : openDropdown()"
      >
        <Plus class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span class="flex-1 text-muted-foreground text-xs">
          {{ triggerLabel }}
        </span>
        <ChevronDown class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>

      <Transition
        enter-active-class="transition duration-100 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-75 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="isDropdownOpen"
          class="absolute z-50 top-full left-0 right-0 mt-1 bg-[color-mix(in_srgb,var(--color-popover)_95%,var(--color-foreground))] border border-border rounded-lg shadow-2xl overflow-hidden"
        >
          <div class="p-2 border-b border-border">
            <div class="relative">
              <Search
                class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
              />
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                role="combobox"
                placeholder="Search tools..."
                aria-autocomplete="list"
                :aria-expanded="isDropdownOpen"
                :aria-controls="listboxId"
                :aria-activedescendant="activeOptionId"
                class="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                @click.stop
              />
            </div>
          </div>

          <div
            :id="listboxId"
            ref="listRef"
            role="listbox"
            aria-multiselectable="true"
            class="overflow-y-auto max-h-72"
          >
            <div
              v-if="groupedTools.length === 0 && !showAddCustomRow"
              class="p-6 text-center text-xs text-muted-foreground"
            >
              No tools match "{{ searchQuery }}"
            </div>

            <div v-for="top in groupedTools" :key="top.key">
              <button
                type="button"
                class="sticky top-0 z-10 w-full flex items-center gap-1.5 px-3 py-1.5 bg-muted/80 backdrop-blur-sm border-b border-border/50 hover:bg-muted transition-colors"
                :aria-expanded="!isTopCollapsed(top.key)"
                :aria-controls="`tool-group-${top.key}`"
                @click="toggleTopCollapsed(top.key)"
              >
                <ChevronDown
                  class="h-3 w-3 text-muted-foreground/60 transition-transform"
                  :class="isTopCollapsed(top.key) ? '-rotate-90' : ''"
                />
                <component
                  :is="resolveCategoryIcon(top.label).icon"
                  class="h-3.5 w-3.5"
                  :class="resolveCategoryIcon(top.label).color"
                />
                <span
                  class="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  {{ top.label }}
                </span>
                <span class="text-[9px] text-muted-foreground/60 ml-auto">
                  {{ top.count }}
                </span>
              </button>

              <template v-if="!isTopCollapsed(top.key)">
                <template v-for="sub in top.subcategories" :key="sub.key">
                  <div
                    v-if="sub.label"
                    class="px-3 pt-2 pb-1 text-[10px] font-medium text-muted-foreground/70"
                  >
                    {{ sub.label }}
                  </div>

                  <div
                    v-for="tool in sub.tools"
                    :key="tool.name"
                    :id="optionId(tool.name)"
                    role="option"
                    :data-active="flatIndexOf(tool.name) === activeIndex"
                    :data-selected="selectedSet.has(tool.name)"
                    :aria-selected="selectedSet.has(tool.name)"
                    class="cursor-pointer w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors border-l-2"
                    :class="[
                      flatIndexOf(tool.name) === activeIndex
                        ? 'bg-accent border-l-primary'
                        : selectedSet.has(tool.name)
                          ? 'bg-primary/5 border-l-transparent hover:bg-accent/50'
                          : 'border-l-transparent hover:bg-accent/50',
                    ]"
                    @click="toggleTool(tool.name)"
                    @mouseenter="activeIndex = flatIndexOf(tool.name)"
                  >
                    <div
                      class="mt-0.5 w-4 h-4 shrink-0 rounded border border-input flex items-center justify-center"
                      :class="selectedSet.has(tool.name) ? 'bg-primary border-primary' : ''"
                    >
                      <Check
                        v-if="selectedSet.has(tool.name)"
                        class="w-3 h-3 text-primary-foreground"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-baseline gap-1.5">
                        <span class="text-xs font-medium truncate">{{ tool.label }}</span>
                        <span class="text-[10px] font-mono text-muted-foreground/70 truncate">
                          {{ tool.name }}
                        </span>
                      </div>
                      <p
                        v-if="tool.description"
                        class="text-[11px] text-muted-foreground line-clamp-2"
                      >
                        {{ tool.description }}
                      </p>
                    </div>
                  </div>
                </template>
              </template>
            </div>

            <div
              v-if="showAddCustomRow"
              :id="optionId(CUSTOM_OPTION_KEY)"
              role="option"
              :aria-selected="false"
              :data-active="isCustomRowActive"
              class="cursor-pointer w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-t border-border/50 border-l-2"
              :class="[
                isCustomRowActive
                  ? 'bg-accent border-l-primary'
                  : 'border-l-transparent hover:bg-accent/50',
              ]"
              @click="addCustomTool"
              @mouseenter="activeIndex = flatToolNames.length"
            >
              <div
                class="w-4 h-4 shrink-0 rounded border border-dashed border-muted-foreground/60 flex items-center justify-center"
              >
                <Plus class="w-3 h-3 text-muted-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-xs">
                  Add <span class="font-mono">"{{ trimmedQuery }}"</span> as custom tool
                </div>
                <p class="text-[11px] text-muted-foreground">
                  Use when the tool name isn't in the catalog
                </p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
