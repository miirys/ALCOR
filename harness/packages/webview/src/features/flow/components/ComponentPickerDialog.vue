<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { Search, X, ArrowLeft } from 'lucide-vue-next';
import { useFlow } from '../composables/useFlow';
import { useComponentPicker } from '../composables/useComponentPicker';
import useDragAndDrop from '../composables/useDnD';
import { groupToolsByCategory, groupToolsByTopCategory, resolveCategoryIcon } from '../utils/tools';
import type { NodeId, ToolDefinition } from '../types';

const { toolDefinitions, nodeTypeDefinitions, isExecuting } = useFlow();
const picker = useComponentPicker();
const { addNodeAtPosition, addNodeAtViewportCenter } = useDragAndDrop();

const searchInput = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const activeTopLevel = ref<string | null>(null);
const activeSubcategory = ref<string | null>(null);
const activeIndex = ref(0);
const isKeyboardNavActive = ref(false);

// ── Reset state when dialog opens ───────────────────────────────────────

watch(
  () => picker.isOpen.value,
  async (isOpen) => {
    if (isOpen) {
      searchQuery.value = '';
      activeTopLevel.value = null;
      activeSubcategory.value = null;
      activeIndex.value = 0;
      isKeyboardNavActive.value = false;
      await nextTick();
      searchInput.value?.focus();
    }
  },
);

watch([searchQuery, activeTopLevel, activeSubcategory], () => {
  activeIndex.value = 0;
  isKeyboardNavActive.value = false;
});

// ── Pinned component items ──────────────────────────────────────────────

interface PinnedItem {
  id: string;
  type: string;
  label: string;
  description: string;
  icon: string;
  color: string;
}

const pinnedItems = computed((): PinnedItem[] => {
  const items: PinnedItem[] = [];

  const agent = nodeTypeDefinitions.value.find((n) => n.type === 'agent');
  if (agent) {
    items.push({
      id: 'agent',
      type: 'agent',
      label: agent.label,
      description: agent.description || 'Autonomous AI that reasons and uses tools in a loop',
      icon: agent.ui?.icon || '🤖',
      color: agent.ui?.color || '#3b82f6',
    });
  }

  const aiTask = nodeTypeDefinitions.value.find((n) => n.type === 'ai-task');
  if (aiTask) {
    items.push({
      id: 'ai-task',
      type: 'ai-task',
      label: aiTask.label,
      description: aiTask.description || 'Single-shot AI operation with tool execution',
      icon: aiTask.ui?.icon || '⚡',
      color: aiTask.ui?.color || '#8b5cf6',
    });
  }

  items.push({
    id: 'custom-tool',
    type: 'tool',
    label: 'Custom Tool',
    description: 'Execute a specific tool — configure the tool name manually',
    icon: '🔧',
    color: '#6366f1',
  });

  return items;
});

// ── View state ────────────────────────

const query = computed(() => searchQuery.value.trim().toLowerCase());
const isSearching = computed(() => query.value.length > 0);

const filteredPinnedItems = computed(() => {
  if (!query.value) return pinnedItems.value;
  return pinnedItems.value.filter(
    (item) =>
      item.label.toLowerCase().includes(query.value) ||
      item.description.toLowerCase().includes(query.value) ||
      item.type.toLowerCase().includes(query.value),
  );
});

// ── Dynamic category structure ──────────────────────────────────────────

const topLevelCategories = computed(() => groupToolsByTopCategory(toolDefinitions.value));

const activeCategoryData = computed(() => {
  if (!activeTopLevel.value) return null;
  return topLevelCategories.value.find((c) => c.key === activeTopLevel.value) ?? null;
});

const hasSubcategories = computed(() => {
  if (!activeCategoryData.value) return false;
  return activeCategoryData.value.subcategories.some((s) => s.label !== '');
});

// Whether this picker was opened to complete an edge
const isEdgeMode = computed(() => picker.hasCallback());

// ── Filtered tools ──────────────────────────────────────────────────────

const scopedTools = computed(() => {
  let tools = toolDefinitions.value;

  if (activeTopLevel.value) {
    const cat = activeCategoryData.value;
    if (cat) {
      const catKeys = new Set(cat.subcategories.map((s) => s.key));
      tools = tools.filter((t) => catKeys.has(t.category || 'Other'));
    }
  }

  if (activeSubcategory.value) {
    tools = tools.filter((t) => t.category === activeSubcategory.value);
  }

  if (query.value) {
    tools = tools.filter(
      (t) =>
        t.label.toLowerCase().includes(query.value) ||
        t.name.toLowerCase().includes(query.value) ||
        t.description.toLowerCase().includes(query.value),
    );
  }

  return tools;
});

const groupedScopedTools = computed(() => groupToolsByCategory(scopedTools.value));

function placeNode(type: string, meta?: { toolName?: string; preferredLabel?: string }) {
  const pos = picker.dropPosition.value;
  let nodeId: NodeId | null;

  if (pos) {
    nodeId = addNodeAtPosition(type, pos, meta);
  } else {
    nodeId = addNodeAtViewportCenter(type, meta);
  }

  if (nodeId) {
    // notifySelection handles closing + calling any edge callback
    picker.notifySelection(nodeId);
  } else {
    picker.close();
  }
}

function selectPinned(item: PinnedItem) {
  placeNode(item.type);
}

function selectTool(tool: ToolDefinition) {
  placeNode('tool', { toolName: tool.name, preferredLabel: tool.name });
}

const selectableItems = computed(() => {
  const items: { id: string; action: () => void }[] = [];

  if (!activeTopLevel.value) {
    for (const pinned of filteredPinnedItems.value) {
      items.push({ id: pinned.id, action: () => selectPinned(pinned) });
    }
  }

  for (const tool of scopedTools.value) {
    items.push({ id: `tool-${tool.name}`, action: () => selectTool(tool) });
  }

  return items;
});

const visibleSubcategories = computed(() => {
  if (!activeCategoryData.value) return [];

  const subs = activeCategoryData.value.subcategories.filter((s) => s.label !== '');
  if (!query.value) return subs;

  return subs.filter((sub) =>
    sub.tools.some(
      (t) =>
        t.label.toLowerCase().includes(query.value) ||
        t.name.toLowerCase().includes(query.value) ||
        t.description.toLowerCase().includes(query.value),
    ),
  );
});

const searchPlaceholder = computed(() => {
  if (activeTopLevel.value) {
    return `Search ${activeCategoryData.value?.label ?? ''} tools…`;
  }
  return 'Search all components…';
});

const totalCount = computed(() => pinnedItems.value.length + toolDefinitions.value.length);
const resultCount = computed(() => filteredPinnedItems.value.length + scopedTools.value.length);

// ── Selection helpers ───────────────────────────────────────────────────

function indexOfItem(id: string): number {
  return selectableItems.value.findIndex((item) => item.id === id);
}

function isSelected(id: string): boolean {
  return indexOfItem(id) === activeIndex.value;
}

function drillIntoCategory(key: string) {
  activeTopLevel.value = key;
  activeSubcategory.value = null;
  searchQuery.value = '';
}

function toggleSubcategory(key: string) {
  activeSubcategory.value = activeSubcategory.value === key ? null : key;
}

function navigateBack() {
  if (activeSubcategory.value) {
    activeSubcategory.value = null;
  } else if (activeTopLevel.value) {
    activeTopLevel.value = null;
    activeSubcategory.value = null;
    searchQuery.value = '';
  }
}

function close() {
  picker.close();
}

// ── Mouse ───────────────────────────────────────────────────────────────

function handlePointerEnter(id: string) {
  isKeyboardNavActive.value = false;
  const idx = indexOfItem(id);
  if (idx !== -1) activeIndex.value = idx;
}

// ── Keyboard ────────────────────────────────────────────────────────────

function scrollActiveIntoView() {
  nextTick(() => {
    const el = document.querySelector('[data-picker-selected]');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

function handleKeydown(event: KeyboardEvent) {
  const items = selectableItems.value;
  if (items.length === 0 && event.key !== 'Escape') return;

  switch (event.key) {
    case 'Escape':
      event.preventDefault();
      event.stopPropagation();
      if (activeSubcategory.value || activeTopLevel.value) {
        navigateBack();
      } else {
        close();
      }
      break;

    case 'ArrowDown': {
      event.preventDefault();
      event.stopPropagation();
      isKeyboardNavActive.value = true;
      const next = activeIndex.value + 1;
      activeIndex.value = next >= items.length ? 0 : next;
      scrollActiveIntoView();
      break;
    }

    case 'ArrowUp': {
      event.preventDefault();
      event.stopPropagation();
      isKeyboardNavActive.value = true;
      const prev = activeIndex.value - 1;
      activeIndex.value = prev < 0 ? items.length - 1 : prev;
      scrollActiveIntoView();
      break;
    }

    case 'Enter':
      event.preventDefault();
      event.stopPropagation();
      if (activeIndex.value >= 0 && activeIndex.value < items.length) {
        items[activeIndex.value]?.action();
      }
      break;

    default:
      break;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="picker">
      <div
        v-if="picker.isOpen.value"
        class="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]"
        @keydown="handleKeydown"
      >
        <div class="absolute inset-0 bg-background/60 backdrop-blur-sm" @click="close" />

        <div
          class="relative w-full max-w-2xl max-h-[72vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
        >
          <!-- ── Search Header ─────────────────────────────────────── -->
          <div class="flex items-center gap-3 px-5 border-b border-border">
            <button
              v-if="activeTopLevel"
              class="flex items-center justify-center w-8 h-8 -ml-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              @click="navigateBack"
            >
              <ArrowLeft class="h-4 w-4" />
            </button>

            <Search class="h-5 w-5 text-muted-foreground shrink-0" />

            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              :placeholder="searchPlaceholder"
              class="flex-1 bg-transparent py-4 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            <div class="flex items-center gap-2 shrink-0">
              <!-- Edge-mode hint -->
              <span
                v-if="isEdgeMode"
                class="text-xs text-primary font-medium px-2 py-0.5 rounded-full bg-primary/10"
              >
                Connect to…
              </span>
              <kbd
                class="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                ESC
              </kbd>
              <button
                class="sm:hidden flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                @click="close"
              >
                <X class="h-4 w-4" />
              </button>
            </div>
          </div>

          <!-- ── Breadcrumb ────────────────────────────────────────── -->
          <div
            v-if="activeTopLevel && !isSearching"
            class="flex items-center gap-2 px-5 pt-3 text-xs text-muted-foreground"
          >
            <button class="hover:text-foreground transition-colors" @click="activeTopLevel = null">
              All
            </button>
            <span class="text-muted-foreground/40">/</span>
            <span class="flex items-center gap-1.5 text-foreground font-medium">
              <component
                v-if="activeCategoryData"
                :is="resolveCategoryIcon(activeCategoryData.label).icon"
                class="h-3.5 w-3.5"
                :class="resolveCategoryIcon(activeCategoryData.label).color"
              />
              {{ activeCategoryData?.label }}
            </span>
            <template v-if="activeSubcategory">
              <span class="text-muted-foreground/40">/</span>
              <span class="text-foreground font-medium">
                {{
                  activeCategoryData?.subcategories.find((s) => s.key === activeSubcategory)?.label
                }}
              </span>
            </template>
          </div>

          <!-- ── Subcategory Pills ─────────────────────────────────── -->
          <div
            v-if="activeTopLevel && hasSubcategories && visibleSubcategories.length > 0"
            class="flex items-center gap-2 px-5 py-3 overflow-x-auto scrollbar-none"
          >
            <button
              class="inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150"
              :class="[
                !activeSubcategory
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              ]"
              @click="activeSubcategory = null"
            >
              All
              <span
                class="rounded-full px-1.5 text-[11px] tabular-nums"
                :class="[!activeSubcategory ? 'bg-primary-foreground/20' : 'bg-background/60']"
              >
                {{ activeCategoryData?.count }}
              </span>
            </button>

            <button
              v-for="sub in visibleSubcategories"
              :key="sub.key"
              class="inline-flex items-center gap-1 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150"
              :class="[
                activeSubcategory === sub.key
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              ]"
              @click="toggleSubcategory(sub.key)"
            >
              {{ sub.label }}
              <span
                class="rounded-full px-1.5 text-[11px] tabular-nums"
                :class="[
                  activeSubcategory === sub.key ? 'bg-primary-foreground/20' : 'bg-background/60',
                ]"
              >
                {{ sub.tools.length }}
              </span>
            </button>
          </div>

          <!-- ── Content ───────────────────────────────────────────── -->
          <div class="flex-1 overflow-y-auto p-2">
            <div
              v-if="isSearching && resultCount === 0"
              class="flex flex-col items-center justify-center py-16 text-center"
            >
              <div class="text-4xl mb-3 opacity-30">🔍</div>
              <p class="text-sm text-muted-foreground">
                No results for "<span class="font-medium text-foreground">{{ searchQuery }}</span
                >"
                <template v-if="activeTopLevel"> in {{ activeCategoryData?.label }} </template>
              </p>
              <button
                v-if="activeTopLevel"
                class="mt-3 text-sm text-primary hover:underline"
                @click="activeTopLevel = null"
              >
                Search all components instead
              </button>
            </div>

            <template v-else>
              <!-- Pinned items -->
              <template v-if="!activeTopLevel && filteredPinnedItems.length > 0">
                <div
                  class="px-3 pt-2 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50"
                >
                  Components
                </div>

                <button
                  v-for="item in filteredPinnedItems"
                  :key="item.id"
                  class="picker-item w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors duration-75"
                  :class="[
                    isSelected(item.id) ? 'is-selected bg-primary/10 ring-1 ring-primary/25' : '',
                  ]"
                  :data-picker-selected="isSelected(item.id) || undefined"
                  :disabled="isExecuting"
                  @click="selectPinned(item)"
                  @pointerenter="handlePointerEnter(item.id)"
                >
                  <div
                    class="flex shrink-0 items-center justify-center h-10 w-10 rounded-lg text-lg"
                    :style="{ backgroundColor: item.color + '15' }"
                  >
                    {{ item.icon }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-sm font-medium text-foreground">{{ item.label }}</div>
                    <div class="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {{ item.description }}
                    </div>
                  </div>
                  <kbd
                    v-if="isSelected(item.id)"
                    class="shrink-0 px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground/50"
                    >↵</kbd
                  >
                </button>
              </template>

              <!-- Category cards (home, not searching) -->
              <template v-if="!activeTopLevel && !isSearching">
                <div
                  class="px-3 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50"
                >
                  Tools
                </div>

                <div class="grid grid-cols-2 gap-2 px-2">
                  <button
                    v-for="cat in topLevelCategories"
                    :key="cat.key"
                    class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all duration-150 hover:shadow-md hover:border-primary/30 hover:-translate-y-px active:scale-[0.98]"
                    @click="drillIntoCategory(cat.key)"
                  >
                    <component
                      :is="resolveCategoryIcon(cat.label).icon"
                      class="h-5 w-5 shrink-0"
                      :class="resolveCategoryIcon(cat.label).color"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium text-foreground">{{ cat.label }}</div>
                      <div class="text-xs text-muted-foreground mt-0.5">
                        {{ cat.count }} {{ cat.count === 1 ? 'tool' : 'tools' }}
                      </div>
                    </div>
                  </button>
                </div>
              </template>

              <!-- Tool list -->
              <template v-if="activeTopLevel || isSearching">
                <template v-for="group in groupedScopedTools" :key="group.key">
                  <div
                    v-if="!activeTopLevel || (isSearching && groupedScopedTools.length > 1)"
                    class="flex items-center gap-1.5 px-3 pt-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/50"
                  >
                    <component
                      :is="resolveCategoryIcon(group.topLabel).icon"
                      class="h-3.5 w-3.5"
                      :class="resolveCategoryIcon(group.topLabel).color"
                    />
                    {{ group.topLabel }}
                    <template v-if="group.subLabel"> › {{ group.subLabel }}</template>
                  </div>

                  <div
                    v-else-if="
                      activeTopLevel && !activeSubcategory && group.subLabel && !isSearching
                    "
                    class="px-3 pt-3 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground/60"
                  >
                    {{ group.subLabel }}
                  </div>

                  <button
                    v-for="tool in group.tools"
                    :key="tool.name"
                    class="picker-item w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-75"
                    :class="[
                      isSelected(`tool-${tool.name}`)
                        ? 'is-selected bg-primary/10 ring-1 ring-primary/25'
                        : '',
                    ]"
                    :data-picker-selected="isSelected(`tool-${tool.name}`) || undefined"
                    :disabled="isExecuting"
                    @click="selectTool(tool)"
                    @pointerenter="handlePointerEnter(`tool-${tool.name}`)"
                  >
                    <div
                      class="flex shrink-0 items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-base"
                    >
                      ⚙️
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-sm font-medium text-foreground leading-snug">
                        {{ tool.label }}
                      </div>
                      <div class="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {{ tool.description }}
                      </div>
                    </div>
                    <div class="shrink-0 flex items-center gap-2">
                      <span class="text-[11px] font-mono text-muted-foreground/30">{{
                        tool.name
                      }}</span>
                      <kbd
                        v-if="isSelected(`tool-${tool.name}`)"
                        class="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono text-muted-foreground/50"
                        >↵</kbd
                      >
                    </div>
                  </button>
                </template>
              </template>
            </template>
          </div>

          <!-- ── Footer ────────────────────────────────────────────── -->
          <div
            class="flex items-center justify-between px-5 py-2.5 border-t border-border bg-muted/30 text-xs text-muted-foreground"
          >
            <span>
              <template v-if="isSearching"
                >{{ resultCount }} of {{ totalCount }} components</template
              >
              <template v-else-if="activeTopLevel">{{ scopedTools.length }} tools</template>
              <template v-else>{{ totalCount }} components available</template>
            </span>
            <span class="hidden sm:flex items-center gap-3">
              <span
                ><kbd
                  class="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono"
                  >↑↓</kbd
                >
                navigate</span
              >
              <span
                ><kbd
                  class="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono"
                  >↵</kbd
                >
                select</span
              >
              <span v-if="activeTopLevel"
                ><kbd
                  class="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono"
                  >esc</kbd
                >
                back</span
              >
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.picker-enter-active,
.picker-leave-active {
  transition: opacity 150ms ease;
}
.picker-enter-from,
.picker-leave-to {
  opacity: 0;
}

.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}

.picker-item:not([data-picker-selected]):hover {
  background-color: color-mix(in srgb, var(--color-accent) 60%, transparent);
}
</style>
