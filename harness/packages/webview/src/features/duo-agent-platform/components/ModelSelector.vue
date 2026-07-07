<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { ChevronDown, Check, Search, AlertCircleIcon } from 'lucide-vue-next';
import { useModelsStore } from '../stores/modelsStore';
import { useChat } from '../composables/useChat';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import Separator from '@/components/ui/separator/Separator.vue';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Props {
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const modelsStore = useModelsStore();
const { setSelectedModel } = useChat();
const {
  availableModels,
  hasAvailableModels,
  groupedModels,
  isPinned,
  selectedModelRef,
  isLoading,
  error,
  userModelSwitchingEnabled,
} = storeToRefs(modelsStore);

const open = ref(false);
const search = ref('');

const selectedModel = computed(() =>
  availableModels.value.find((m) => m.ref === selectedModelRef.value),
);

const placeholderText = computed(() => {
  if (isLoading.value) return 'Loading models...';
  if (hasAvailableModels.value) return 'Select model';
  return 'No models available';
});

type ModelList = typeof availableModels.value;

const filteredGroupedModels = computed(() => {
  const query = search.value.trim().toLowerCase();
  if (!query) return groupedModels.value;
  const filtered = new Map<string, ModelList>();
  for (const [provider, models] of groupedModels.value) {
    const match = models.filter((m) => m.name.toLowerCase().includes(query));
    if (match.length) filtered.set(provider, match);
  }
  return filtered;
});

const hasResults = computed(() => filteredGroupedModels.value.size > 0);

const groupedModelsEntries = computed(() => Array.from(filteredGroupedModels.value.entries()));

watch(open, (isOpen) => {
  if (!isOpen) search.value = '';
});

const selectModel = (modelRef: string) => {
  setSelectedModel(modelRef);
  open.value = false;
};
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :disabled="isPinned || isLoading || !userModelSwitchingEnabled || props.disabled"
        class="gap-1 text-xs h-7 px-0"
      >
        <AlertCircleIcon v-if="error" class="size-3 text-destructive-foreground" />
        {{ selectedModel?.name ?? placeholderText }}
        <ChevronDown class="size-3 opacity-60" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="top">
      <div class="relative mb-2">
        <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input v-model="search" placeholder="Search models..." class="pl-7 h-8 text-xs" autofocus />
      </div>
      <div class="max-h-48 overflow-y-auto" v-if="!error">
        <template v-for="([provider, models], index) in groupedModelsEntries" :key="provider">
          <Button
            variant="ghost"
            v-for="model in models"
            :key="model.ref"
            class="flex w-full items-center gap-2 rounded-sm py-1.5 text-xs cursor-pointer hover:bg-dropdown focus-visible:bg-dropdown focus-visible:ring-0"
            @click="selectModel(model.ref)"
          >
            <span class="flex-1 text-left">{{ model.name }}</span>
            <span v-if="model.isPinned" class="text-muted-foreground">Pinned</span>
            <span v-else-if="model.isDefault" class="text-muted-foreground">Default</span>
            <Check class="size-3.5 shrink-0" v-if="model.ref === selectedModelRef" />
          </Button>
          <Separator v-if="index < groupedModelsEntries.length - 1" />
        </template>
        <p v-if="!hasResults" class="py-2 text-center text-xs text-muted-foreground">
          No models found
        </p>
      </div>
      <Alert variant="destructive" v-else-if="error">
        <AlertCircleIcon />
        <AlertDescription>{{ error }}</AlertDescription>
      </Alert>
    </PopoverContent>
  </Popover>
</template>
