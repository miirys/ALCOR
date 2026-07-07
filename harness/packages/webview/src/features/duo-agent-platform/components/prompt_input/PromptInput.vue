<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { Send, Square } from 'lucide-vue-next';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import ModelSelector from '../ModelSelector.vue';
import AgentSelector from '../AgentSelector.vue';
import ContextItemBrowser from '../context/ContextItemBrowser.vue';
import ContextItemBadge from '../context/ContextItemBadge.vue';
import { useChatStore } from '../../stores/chatStore';
import { useAIContextStore } from '../../stores/aiContextStore';
import { useSlashCommands } from '../../composables/useSlashCommands';
import { INCLUDE_COMMAND } from '../../utils/slashCommands.ts';
import SlashCommandMenu from './SlashCommandMenu.vue';
import Button from '@/components/ui/button/Button.vue';
import Textarea from '@/components/ui/textarea/Textarea.vue';

interface Props {
  modelValue: string;
  isLoading?: boolean;
  canStop?: boolean;
  disabled?: boolean;
}

interface Emits {
  'update:modelValue': [value: string];
  submit: [message: string];
  stop: [];
  selectAgent: [agentId: string];
}

const props = withDefaults(defineProps<Props>(), {
  isLoading: false,
  canStop: false,
  disabled: false,
});

const emit = defineEmits<Emits>();

const chatStore = useChatStore();
const aiContextStore = useAIContextStore();
const { slashCommands } = storeToRefs(chatStore);
const {
  contextCategories,
  contextSelections,
  contextSearchResults,
  isLoading: contextIsLoading,
  error: contextError,
} = storeToRefs(aiContextStore);

const isSubmitting = ref(false);
const contextBrowser = ref<InstanceType<typeof ContextItemBrowser> | null>(null);

const FLOW_PREFIX = /^\/flow(\s|$)/;

const hasContextSupport = computed(() => (contextCategories.value?.length ?? 0) > 0);

const {
  filteredCommands,
  shouldShow: shouldShowSlashCommands,
  activeIndex,
  selectAt,
  handleKeyDown: handleSlashCommandKey,
} = useSlashCommands({
  prompt: () => props.modelValue,
  commands: () => slashCommands.value,
  hasContextSupport: () => hasContextSupport.value,
  onSelect: (command) => {
    if (command.shouldSubmit) {
      emit('update:modelValue', '');
      emit('submit', command.name);
      return;
    }
    if (command.name === INCLUDE_COMMAND) {
      emit('update:modelValue', '');
      contextBrowser.value?.open();
      return;
    }
    // Prefill the command so the user can append a goal (e.g. "/deploy to staging") before submitting.
    emit('update:modelValue', `${command.name} `);
  },
});

watch(
  () => props.modelValue,
  (value) => {
    chatStore.setWorkflowType(
      FLOW_PREFIX.test(value) ? WorkflowType.SOFTWARE_DEVELOPMENT : WorkflowType.CHAT,
    );
  },
);

const hasText = computed(() => Boolean(props.modelValue?.trim()));

const isSubmitDisabled = computed(() => {
  return !hasText.value || props.isLoading || props.disabled || isSubmitting.value;
});

// While a run is loading the button stops it (disabled until the run is stoppable);
// otherwise it submits. Stopping interrupts the run and re-enables the input for a new message.
const isStopMode = computed(() => props.isLoading);

const isActionButtonDisabled = computed(() => {
  return isStopMode.value ? !props.canStop : isSubmitDisabled.value;
});

const actionButtonLabel = computed(() => (isStopMode.value ? 'Stop' : 'Submit'));

const handleInput = (value: string | number) => {
  emit('update:modelValue', value.toString());
};

const handleSubmit = async () => {
  if (isSubmitDisabled.value) return;

  let message = props.modelValue.trim();
  if (chatStore.workflowType === WorkflowType.SOFTWARE_DEVELOPMENT) {
    message = message.replace(FLOW_PREFIX, '').trim();
  }
  if (!message) return;

  isSubmitting.value = true;
  try {
    emit('submit', message);
    // Clear the input after submission
    emit('update:modelValue', '');
  } finally {
    isSubmitting.value = false;
  }
};

const handleButtonClick = () => {
  if (isStopMode.value) {
    emit('stop');
  } else {
    handleSubmit();
  }
};

const handleKeyDown = (event: KeyboardEvent) => {
  if (handleSlashCommandKey(event)) return;

  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    handleSubmit();
  }
};
</script>

<template>
  <div class="rounded-md border px-3 pt-2 pb-2 bg-input relative">
    <SlashCommandMenu
      v-if="shouldShowSlashCommands"
      :commands="filteredCommands"
      :active-index="activeIndex"
      @select="selectAt"
      @update:active-index="activeIndex = $event"
    />
    <!-- Context row -->
    <div v-if="hasContextSupport" class="flex items-center gap-1 mb-1 flex-wrap">
      <ContextItemBrowser
        ref="contextBrowser"
        :categories="contextCategories"
        :results="contextSearchResults"
        :loading="contextIsLoading"
        :error="contextError"
        :disabled="disabled || isLoading"
        @search="aiContextStore.searchContextItems"
        @select="aiContextStore.addContextItem"
      />
      <ContextItemBadge
        v-for="item in contextSelections"
        :key="`${item.category}-${item.id}`"
        :item="item"
        @remove="aiContextStore.removeContextItem"
      />
    </div>

    <!-- Textarea -->
    <Textarea
      :model-value="modelValue"
      :disabled="disabled || isLoading"
      placeholder="Let's work through this together..."
      class="border-0 shadow-none resize-none p-0 min-h-15 focus-visible:ring-0 focus-visible:border-0"
      @update:model-value="handleInput"
      @keydown="handleKeyDown"
    />

    <!-- TODO: Add this back when we have contexts and flow shortcuts integrated
    <p class="text-xs text-muted-foreground mt-1 mb-2">
      Type /flow to begin a flow, or @ to add context
    </p> -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-1 min-w-0">
        <AgentSelector @select="$emit('selectAgent', $event)" :disabled="disabled || isLoading" />
        <ModelSelector :disabled="disabled || isLoading" />
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        :disabled="isActionButtonDisabled"
        class="rounded-full shrink-0"
        @click="handleButtonClick"
        :aria-label="actionButtonLabel"
      >
        <Square v-if="isStopMode" />
        <Send v-else />
      </Button>
    </div>
  </div>
</template>
