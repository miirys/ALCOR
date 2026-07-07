<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useVueFlow } from '@vue-flow/core';
import {
  Plus,
  Save,
  RotateCw,
  Play,
  CheckCircle,
  AlertCircle,
  BookOpen,
  CloudUpload,
} from 'lucide-vue-next';
import { useFlow } from '../composables/useFlow';
import { useComponentPicker } from '../composables/useComponentPicker';
import { FLOW_ID } from '../constants';
import { isTextInputTarget, hasModKey } from '../utils/keyboard';
import type { CatalogFlowSummary } from '../types';
import CatalogFlowPickerDialog from './CatalogFlowPickerDialog.vue';
import CreateCatalogFlowDialog from './CreateCatalogFlowDialog.vue';
import DiscardChangesDialog from './dialogs/DiscardChangesDialog.vue';
import FlowDestinationIndicator from './FlowDestinationIndicator.vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const picker = useComponentPicker();
const flow = useFlow();
const { zoomIn, zoomOut, fitView } = useVueFlow(FLOW_ID);

const saving = ref(false);
const loading = ref(false);
const openDialogVisible = ref(false);
const createDialogVisible = ref(false);
const discardDialogOpen = ref(false);
const message = ref<{ type: 'success' | 'error'; text: string } | null>(null);

function showMessage(type: 'success' | 'error', text: string) {
  message.value = { type, text };
  setTimeout(() => {
    message.value = null;
  }, 3000);
}

const hasValidationIssues = computed(() => {
  return (
    flow.validationErrors.value.length > 0 ||
    (flow.nodeCount.value > 0 && !flow.flow.value.entryPoint)
  );
});

const isCatalogFlow = computed(() => flow.isCatalogFlow.value);
const isEmptyCanvas = computed(() => flow.nodeCount.value === 0);

const catalogCreateDenied = computed(
  () => flow.sessionInfo.value?.project?.canCreateCatalogItem === false,
);

const saveToFileTooltip = computed(() => {
  return isEmptyCanvas.value ? 'Add a component to save this flow' : 'Save to file';
});

const cloudButtonDisabled = computed(() => {
  if (hasValidationIssues.value || saving.value || isEmptyCanvas.value) return true;
  if (isCatalogFlow.value) return !flow.isDirty.value;
  return catalogCreateDenied.value;
});

const catalogTooltip = computed(() => {
  if (isEmptyCanvas.value) return 'Add a component to save this flow';
  if (isCatalogFlow.value) return 'Update in AI Catalog';
  if (catalogCreateDenied.value) {
    const path = flow.sessionInfo.value?.project?.path;
    return path
      ? `Cannot create catalog items in ${path} — your role on this project doesn't allow it`
      : "Cannot create catalog items — your role on this project doesn't allow it";
  }
  return 'Save to AI Catalog';
});

const cloudButtonLabel = computed(() => (isCatalogFlow.value ? 'Update' : 'Upload'));

async function handleSave() {
  saving.value = true;
  const result = await flow.saveToBackend();
  saving.value = false;

  if (result.success) {
    const successMessage = isCatalogFlow.value ? 'Updated in AI Catalog' : 'Saved successfully';
    showMessage('success', successMessage);
    return;
  }

  // Phase 1: surface the first issue's message. Phase 4 will render the full
  // list (with node-link affordances) in a richer toast / Issues drawer.
  const first = result.issues[0]?.message ?? 'Save failed';
  showMessage('error', first);
}

function handleCloudButtonClick() {
  if (isCatalogFlow.value) {
    handleSave();
  } else {
    createDialogVisible.value = true;
  }
}

async function executeLoad() {
  loading.value = true;
  const result = await flow.loadFromBackend();
  loading.value = false;
  showMessage(
    result.success ? 'success' : 'error',
    result.success ? 'Loaded successfully' : result.error || 'Load failed',
  );
}

async function handleLoad() {
  if (flow.isDirty.value) {
    discardDialogOpen.value = true;
    return;
  }
  await executeLoad();
}

async function handleDiscardConfirm() {
  discardDialogOpen.value = false;
  await executeLoad();
}

function handleOpenCatalog() {
  // eslint-disable-next-line no-restricted-globals, no-alert
  if (flow.isDirty.value && !confirm('Discard unsaved changes?')) return;
  openDialogVisible.value = true;
}

async function handleCatalogFlowSelected(summary: CatalogFlowSummary) {
  loading.value = true;
  const result = await flow.setCurrentUri(summary.uri, summary);
  loading.value = false;
  showMessage(
    result.success ? 'success' : 'error',
    result.success ? `Loaded "${summary.name}"` : result.error || 'Load failed',
  );
}

async function handleCatalogFlowCreated(payload: { uri: string; summary: CatalogFlowSummary }) {
  const result = await flow.setCurrentUri(payload.uri, payload.summary);
  showMessage(
    result.success ? 'success' : 'error',
    result.success ? 'Saved to AI Catalog' : result.error || 'Saved, but failed to reload',
  );
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (isTextInputTarget(event)) return;

  // Zoom in: ⌘+ or ⌘=
  if (hasModKey(event) && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    zoomIn();
    return;
  }

  // Zoom out: ⌘-
  if (hasModKey(event) && event.key === '-') {
    event.preventDefault();
    zoomOut();
    return;
  }

  // Fit to screen: Shift+1
  if (event.shiftKey && event.key === '!') {
    event.preventDefault();
    fitView({ padding: 0.25 });
    return;
  }

  if (picker.isOpen.value || flow.isExecuting.value) return;

  // Add component: /
  if (event.key === '/') {
    event.preventDefault();
    event.stopPropagation();
    picker.open();
  }
}

onMounted(() => window.addEventListener('keydown', handleGlobalKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleGlobalKeydown));

/* Stacked icon + label button (~60px wide, ~62px tall) */
const btnClass =
  'flex flex-col items-center justify-center gap-1 w-[60px] py-2.5 rounded-xl transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:pointer-events-none disabled:cursor-default';
</script>

<template>
  <FlowDestinationIndicator />

  <div
    class="flex items-center bg-card/95 backdrop-blur-sm border border-border rounded-2xl shadow-lg px-2 py-1.5 gap-0.5"
  >
    <!-- Open from AI Catalog -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          aria-label="Open from AI Catalog"
          :class="btnClass"
          @click="handleOpenCatalog"
        >
          <BookOpen class="h-5 w-5" />
          <span class="text-[11px] font-medium leading-none">Open</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Open from AI Catalog</TooltipContent>
    </Tooltip>

    <!-- Save to file (file-backed flows only) -->
    <Tooltip v-if="!isCatalogFlow">
      <!--
        Wrapping span receives hover so the tooltip fires even while the button
        is disabled (native disabled buttons swallow pointer events in Chrome/FF).
      -->
      <TooltipTrigger as-child>
        <span class="relative inline-flex w-[60px]">
          <button
            type="button"
            aria-label="Save to file"
            :disabled="!flow.isDirty.value || saving || hasValidationIssues || isEmptyCanvas"
            :class="btnClass"
            @click="handleSave"
          >
            <Save class="h-5 w-5" />
            <span class="text-[11px] font-medium leading-none">Save</span>
            <span
              v-if="flow.isDirty.value && !hasValidationIssues && !isEmptyCanvas"
              class="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500"
            />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{{ saveToFileTooltip }}</TooltipContent>
    </Tooltip>

    <!-- Save to / update in AI Catalog -->
    <Tooltip>
      <TooltipTrigger as-child>
        <span class="relative inline-flex w-[60px]">
          <button
            type="button"
            :aria-label="catalogTooltip"
            :disabled="cloudButtonDisabled"
            :class="btnClass"
            @click="handleCloudButtonClick"
          >
            <CloudUpload class="h-5 w-5" />
            <span class="text-[11px] font-medium leading-none">{{ cloudButtonLabel }}</span>
            <span
              v-if="isCatalogFlow && flow.isDirty.value && !hasValidationIssues && !isEmptyCanvas"
              class="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-500"
            />
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{{ catalogTooltip }}</TooltipContent>
    </Tooltip>

    <!-- Reload -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          aria-label="Reload"
          :disabled="loading"
          :class="btnClass"
          @click="handleLoad"
        >
          <RotateCw class="h-5 w-5" :class="{ 'animate-spin': loading }" />
          <span class="text-[11px] font-medium leading-none">Reload</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Reload</TooltipContent>
    </Tooltip>

    <!-- Run -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          aria-label="Run workflow"
          class="flex flex-col items-center justify-center gap-1 w-[60px] py-2.5 rounded-xl transition-colors cursor-pointer text-green-500 hover:text-green-400 hover:bg-green-500/10"
          @click="flow.toggleExecutionPanel()"
        >
          <Play class="h-5 w-5" />
          <span class="text-[11px] font-medium leading-none">Run</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Run workflow</TooltipContent>
    </Tooltip>

    <!-- Divider -->
    <div class="w-px h-10 bg-border mx-1" />

    <!-- Add Component -->
    <Tooltip>
      <TooltipTrigger as-child>
        <button
          type="button"
          aria-label="Add component"
          :disabled="flow.isExecuting.value"
          :class="btnClass"
          @click="picker.open()"
        >
          <Plus class="h-5 w-5" />
          <span class="text-[11px] font-medium leading-none">Add</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Add component (/)</TooltipContent>
    </Tooltip>
  </div>

  <CatalogFlowPickerDialog v-model:open="openDialogVisible" @select="handleCatalogFlowSelected" />
  <CreateCatalogFlowDialog
    v-model:open="createDialogVisible"
    :flow="flow.flow.value"
    @created="handleCatalogFlowCreated"
  />

  <!-- Discard confirmation dialog -->
  <DiscardChangesDialog v-model:open="discardDialogOpen" @confirm="handleDiscardConfirm" />

  <!-- Toast -->
  <Transition name="toast">
    <div
      v-if="message"
      :class="[
        'mt-2 flex items-center gap-2 px-4 py-2.5 backdrop-blur-sm border rounded-lg shadow-lg',
        message.type === 'success'
          ? 'bg-green-500/10 border-green-500/20 text-green-600'
          : 'bg-destructive/10 border-destructive/20 text-destructive',
      ]"
    >
      <component
        :is="message.type === 'success' ? CheckCircle : AlertCircle"
        class="h-4 w-4 shrink-0"
      />
      <p class="text-sm font-medium">{{ message.text }}</p>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-to {
  opacity: 0;
}
</style>
