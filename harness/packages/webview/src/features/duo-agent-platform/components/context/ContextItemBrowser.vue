<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Search, Plus, AlertCircleIcon } from 'lucide-vue-next';
import type { AIContextItem, AIContextCategory } from '@gitlab-org/lib-duo-agent-platform/webview';
import { CategoryDisplayData } from '../../stores/aiContextStore';
import { getCategoryIcon } from './utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import Button from '@/components/ui/button/Button.vue';
import Input from '@/components/ui/input/Input.vue';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  categories?: CategoryDisplayData[] | null;
  results?: AIContextItem[];
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

interface Emits {
  search: [value: string, category: AIContextCategory | null];
  select: [item: AIContextItem];
}

const props = withDefaults(defineProps<Props>(), {
  categories: null,
  results: () => [],
  loading: false,
  error: null,
  disabled: false,
});

const emit = defineEmits<Emits>();

const open = ref(false);
const searchTerm = ref('');
const selectedCategory = ref<AIContextCategory | null>('file');

const hasCategories = computed(() => (props.categories?.length ?? 0) > 0);

watch(open, (isOpen) => {
  if (!isOpen) {
    searchTerm.value = '';
    return;
  }
  emit('search', searchTerm.value, selectedCategory.value);
});

watch([searchTerm, selectedCategory], ([q, cat]) => {
  if (!open.value) return;
  if (!q && !cat) return;
  emit('search', q, cat);
});

function toggleCategory(value: AIContextCategory) {
  selectedCategory.value = selectedCategory.value === value ? null : value;
}

function handleSelect(item: AIContextItem) {
  emit('select', item);
}

const searchPlaceholder = computed(() => {
  const active = props.categories?.find((c) => c.value === selectedCategory.value);
  return active ? `Search ${active.label.toLowerCase()}...` : 'Search all context...';
});

defineExpose({
  open: () => {
    open.value = true;
  },
});
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button
        variant="ghost"
        size="sm"
        :disabled="disabled || !hasCategories"
        class="gap-1 text-xs h-7 px-1.5 text-muted-foreground hover:text-foreground"
        aria-label="Add context"
      >
        <Plus class="size-3.5" />
        <span>Context</span>
      </Button>
    </PopoverTrigger>

    <PopoverContent align="start" side="top" class="w-80 p-0 bg-popover">
      <div class="px-3 pt-3 pb-2">
        <div class="relative">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            v-model="searchTerm"
            :placeholder="searchPlaceholder"
            class="pl-7 h-8 text-xs"
            autofocus
          />
        </div>
      </div>

      <div class="flex gap-1 px-3 pb-2 overflow-x-auto">
        <TooltipProvider :delay-duration="200">
          <Tooltip v-for="cat in categories" :key="cat.value">
            <TooltipTrigger as-child>
              <Button
                :variant="selectedCategory === cat.value ? 'default' : 'ghost'"
                size="icon-sm"
                class="size-7 shrink-0"
                :aria-label="cat.label"
                :aria-pressed="selectedCategory === cat.value"
                @click="toggleCategory(cat.value)"
              >
                <component :is="getCategoryIcon(cat.value)" class="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent class="flex">
              <p>{{ cat.label }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Separator />

      <div class="max-h-60 overflow-y-auto px-1 py-2 [scrollbar-gutter:stable]">
        <div v-if="loading" class="px-3 py-4 text-center text-xs text-muted-foreground">
          Searching...
        </div>

        <div v-else-if="error" class="px-2">
          <Alert variant="destructive">
            <AlertCircleIcon class="size-4" />
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>
        </div>

        <div
          v-else-if="results.length === 0 && searchTerm.length > 0"
          class="px-3 py-4 text-center text-xs text-muted-foreground"
        >
          No results found
        </div>

        <div
          v-else-if="results.length === 0"
          class="px-3 py-4 text-center text-xs text-muted-foreground"
        >
          Type to search for items
        </div>

        <template v-else>
          <Button
            v-for="item in results"
            :key="`${item.category}-${item.id}`"
            variant="ghost"
            :disabled="item.metadata?.enabled === false"
            class="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-dropdown h-auto focus-visible:bg-dropdown focus-visible:ring-0"
            @click="handleSelect(item)"
          >
            <component
              :is="getCategoryIcon(item.category)"
              class="size-3.5 shrink-0 mt-0.5 text-muted-foreground"
            />
            <div class="flex-1 text-left min-w-0">
              <span class="block truncate font-medium">{{ item.metadata?.title || item.id }}</span>
              <span
                v-if="item.metadata?.secondaryText"
                class="block truncate text-muted-foreground"
              >
                {{ item.metadata.secondaryText }}
              </span>
              <span
                v-if="item.metadata?.enabled === false && item.metadata?.disabledReasons?.length"
                class="block text-muted-foreground/60 italic"
              >
                {{ item.metadata.disabledReasons[0] }}
              </span>
            </div>
            <span v-if="item.metadata?.subTypeLabel" class="text-muted-foreground shrink-0">
              {{ item.metadata.subTypeLabel }}
            </span>
          </Button>
        </template>
      </div>
    </PopoverContent>
  </Popover>
</template>
