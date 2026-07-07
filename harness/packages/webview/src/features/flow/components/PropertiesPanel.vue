<script setup lang="ts">
import { computed } from 'vue';
import { GitFork, Settings2, Layers, Lock, Play } from 'lucide-vue-next';
import { useFlow } from '../composables/useFlow';
import { getNodeDisplayInfo, toComponentName } from '../utils';
import PanelHeaderButtons from './PanelHeaderButtons.vue';

// Forms
import AgentNodeForm from './forms/AgentNodeForm.vue';
import ToolNodeForm from './forms/ToolNodeForm.vue';
import AiTaskNodeForm from './forms/AiTaskNodeForm.vue';
import EdgeForm from './forms/EdgeForm.vue';
import StartNodeForm from './forms/StartNodeForm.vue';

const props = defineProps<{
  maximized?: boolean;
  maximizable?: boolean;
}>();

defineEmits<{
  close: [];
  'toggle-maximize': [];
}>();

const {
  selectedElement,
  nodeTypeDefinitions,
  flow,
  nodeCount,
  edgeCount,
  currentUri,
  isExecuting,
} = useFlow();

const nodeDisplayInfo = computed(() => {
  if (selectedElement.value?.type !== 'node') return null;
  return getNodeDisplayInfo(selectedElement.value.element, nodeTypeDefinitions.value);
});

const componentNamePreview = computed(() => {
  const sel = selectedElement.value;
  if (sel?.type !== 'node') return null;
  const { id, label } = sel.element;
  const derived = toComponentName(label);
  if (derived === '') return { name: '', error: 'Name must contain at least one letter or number' };

  const hasCollision = Object.values(flow.value.nodes).some(
    (n) => n.id !== id && toComponentName(n.label) === derived,
  );
  if (hasCollision) return { name: derived, error: "Collides with another node's component name" };

  return { name: derived, error: null };
});

const ALLOWED_LABEL_CHARS = /[^a-zA-Z0-9_ ]/g;

function onLabelInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const cursorPos = input.selectionStart ?? input.value.length;
  const sanitized = input.value.replace(ALLOWED_LABEL_CHARS, '');
  if (sanitized !== input.value) {
    const removedBefore = input.value.slice(0, cursorPos).replace(ALLOWED_LABEL_CHARS, '').length;
    input.value = sanitized;
    input.setSelectionRange(removedBefore, removedBefore);
  }
  if (selectedElement.value?.type === 'node') {
    selectedElement.value.element.label = sanitized;
  }
}
</script>

<template>
  <div class="flex h-full flex-col relative">
    <!-- Read Only Overlay for Forms -->
    <div
      v-if="isExecuting"
      class="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 shrink-0"
    >
      <Lock class="w-3 h-3" />
      Workflow is locked during execution
    </div>

    <!-- CASE 0: START Node Selected -->
    <template v-if="selectedElement?.type === 'start'">
      <div
        class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20 min-h-[50px]"
      >
        <div
          class="flex items-center justify-center w-6 h-6 rounded-full bg-green-500/20 text-green-500"
        >
          <Play class="w-4 h-4" />
        </div>
        <h2 class="text-sm font-semibold flex-1">Workflow Inputs</h2>
        <PanelHeaderButtons
          :maximizable="props.maximizable"
          :maximized="props.maximized"
          @close="$emit('close')"
          @toggle-maximize="$emit('toggle-maximize')"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-4 [&>*]:max-w-3xl [&>*]:mx-auto">
        <fieldset :disabled="isExecuting" class="disabled:opacity-80">
          <StartNodeForm />
        </fieldset>
      </div>
    </template>

    <!-- CASE 1: Element Selected -->
    <template v-else-if="selectedElement">
      <!-- Header -->
      <div
        class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20 min-h-[50px]"
      >
        <template v-if="selectedElement.type === 'node'">
          <div
            class="flex items-center justify-center w-6 h-6 rounded text-sm shadow-sm"
            :style="{ backgroundColor: (nodeDisplayInfo?.color || '#6b7280') + '20' }"
          >
            {{ nodeDisplayInfo?.icon }}
          </div>
          <h2 class="text-sm font-semibold truncate flex-1">
            {{ nodeDisplayInfo?.label }} Properties
          </h2>
        </template>
        <template v-else>
          <div
            class="flex items-center justify-center w-6 h-6 rounded text-sm bg-amber-500/20 text-amber-600"
          >
            <GitFork class="w-4 h-4" />
          </div>
          <h2 class="text-sm font-semibold truncate flex-1">Connection Properties</h2>
        </template>
        <PanelHeaderButtons
          :maximizable="props.maximizable"
          :maximized="props.maximized"
          @close="$emit('close')"
          @toggle-maximize="$emit('toggle-maximize')"
        />
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 [&>*]:max-w-3xl [&>*]:mx-auto">
        <!-- Disable all inputs when executing -->
        <fieldset :disabled="isExecuting" class="space-y-6 min-w-0 disabled:opacity-80">
          <!-- NODE FORM -->
          <div v-if="selectedElement.type === 'node'" class="space-y-6">
            <div class="space-y-3">
              <div>
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >Name</label
                >
                <input
                  :value="selectedElement.element.label"
                  type="text"
                  maxlength="50"
                  class="w-full mt-1 px-3 py-1.5 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-1 focus:ring-ring font-mono disabled:cursor-not-allowed"
                  @input="onLabelInput"
                />
                <div v-if="componentNamePreview" class="mt-1 flex items-center gap-1.5">
                  <span
                    v-if="componentNamePreview.name"
                    class="text-[10px] font-mono text-muted-foreground truncate"
                    :title="`Component name: ${componentNamePreview.name}`"
                  >
                    {{ componentNamePreview.name }}
                  </span>
                  <span
                    v-if="componentNamePreview.error"
                    class="text-[10px] text-destructive whitespace-nowrap"
                  >
                    {{ componentNamePreview.error }}
                  </span>
                </div>
              </div>
            </div>
            <div class="h-px bg-border w-full my-2"></div>
            <div class="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <AgentNodeForm
                v-if="selectedElement.element.type === 'agent'"
                :node="selectedElement.element"
              />
              <ToolNodeForm
                v-else-if="selectedElement.element.type === 'tool'"
                :node="selectedElement.element"
              />
              <AiTaskNodeForm
                v-else-if="selectedElement.element.type === 'ai-task'"
                :node="selectedElement.element"
              />
            </div>
          </div>

          <!-- EDGE FORM -->
          <div v-else class="space-y-6">
            <div class="space-y-3">
              <div>
                <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                  >ID</label
                >
                <div
                  class="mt-1 text-[10px] font-mono text-muted-foreground bg-muted/50 p-1.5 rounded select-all break-all"
                >
                  {{ selectedElement.element.id }}
                </div>
              </div>
            </div>
            <div class="h-px bg-border w-full my-2"></div>
            <div class="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <EdgeForm :edge="selectedElement.element" />
            </div>
          </div>
        </fieldset>
      </div>
    </template>

    <!-- CASE 2: Nothing Selected (Flow Overview) -->
    <template v-else>
      <div
        class="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20 min-h-[50px]"
      >
        <div
          class="flex items-center justify-center w-6 h-6 rounded text-sm bg-primary/10 text-primary"
        >
          <Settings2 class="w-4 h-4" />
        </div>
        <h2 class="text-sm font-semibold flex-1">Flow Settings</h2>
        <PanelHeaderButtons
          :maximizable="props.maximizable"
          :maximized="props.maximized"
          @close="$emit('close')"
          @toggle-maximize="$emit('toggle-maximize')"
        />
      </div>

      <div class="flex-1 overflow-y-auto p-4 [&>*]:max-w-3xl [&>*]:mx-auto">
        <div class="space-y-6">
          <!-- Stats -->
          <div class="grid grid-cols-2 gap-3">
            <div
              class="bg-muted/30 rounded-lg p-3 border border-border/50 flex flex-col items-center justify-center gap-1"
            >
              <Layers class="w-4 h-4 text-muted-foreground" />
              <span class="text-2xl font-bold">{{ nodeCount }}</span>
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Nodes</span>
            </div>
            <div
              class="bg-muted/30 rounded-lg p-3 border border-border/50 flex flex-col items-center justify-center gap-1"
            >
              <GitFork class="w-4 h-4 text-muted-foreground" />
              <span class="text-2xl font-bold">{{ edgeCount }}</span>
              <span class="text-[10px] uppercase tracking-wider text-muted-foreground">Edges</span>
            </div>
          </div>
          <div class="h-px bg-border w-full"></div>

          <!-- Info -->
          <div class="space-y-2">
            <label class="text-xs font-medium text-muted-foreground uppercase tracking-wider"
              >Source</label
            >
            <div
              class="flex items-center gap-2 bg-muted/50 p-2 rounded border border-border/50 overflow-hidden"
            >
              <div class="text-xs font-mono select-all truncate" :title="currentUri">
                {{ currentUri }}
              </div>
            </div>
          </div>

          <div
            class="rounded-lg border border-dashed border-muted-foreground/25 p-4 text-center bg-muted/5"
          >
            <p class="text-xs text-muted-foreground">Select a node or connection to edit.</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
