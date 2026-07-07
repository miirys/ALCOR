<script setup lang="ts">
import { watch } from 'vue';
import { Search, BookOpen, RefreshCw, AlertTriangle } from 'lucide-vue-next';
import type { CatalogFlowSummary } from '../types';
import { useCatalogFlowSearch } from '../composables/useCatalogFlowSearch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Spinner } from '@/components/ui/spinner';

const open = defineModel<boolean>('open', { required: true });

const emit = defineEmits<{
  select: [flow: CatalogFlowSummary];
}>();

const search = useCatalogFlowSearch();

watch(open, async (isOpen) => {
  if (isOpen) {
    search.reset();
    await search.refresh();
  }
});

function handleSelect(flow: CatalogFlowSummary) {
  emit('select', flow);
  open.value = false;
}

function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader class="min-w-0">
        <DialogTitle class="flex items-center gap-2">
          <BookOpen class="h-5 w-5" />
          Open from AI Catalog
        </DialogTitle>
        <DialogDescription>
          Browse flows you have access to in the AI Catalog. Selecting a flow loads it into the
          editor.
        </DialogDescription>
      </DialogHeader>

      <div class="relative min-w-0">
        <Search
          class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"
        />
        <Input
          :model-value="search.query.value"
          placeholder="Search by name or description"
          class="pl-8"
          @update:model-value="(v) => search.setQuery(String(v))"
        />
      </div>

      <ScrollArea class="h-80 -mr-6 pr-4 min-w-0">
        <div v-if="search.error.value" class="flex items-start gap-2 py-2 text-sm text-destructive">
          <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
          <span>{{ search.error.value }}</span>
        </div>

        <div
          v-if="search.flows.value.length === 0 && !search.loading.value"
          class="py-12 text-center text-sm text-muted-foreground"
        >
          <span v-if="search.query.value">No flows match "{{ search.query.value }}".</span>
          <span v-else>No catalog flows available.</span>
        </div>

        <ul class="divide-y divide-border">
          <li v-for="flow in search.flows.value" :key="flow.uri">
            <button
              type="button"
              class="w-full min-w-0 text-left py-3 px-2 hover:bg-muted rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring overflow-hidden"
              @click="handleSelect(flow)"
            >
              <div class="flex items-baseline justify-between gap-3 min-w-0">
                <span class="font-medium text-sm text-foreground truncate min-w-0">
                  {{ flow.name }}
                </span>
                <span
                  v-if="flow.latestVersionName"
                  class="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0"
                >
                  v{{ flow.latestVersionName }}
                </span>
              </div>
              <p
                v-if="flow.description"
                class="mt-1 text-xs text-muted-foreground line-clamp-2 break-words"
              >
                {{ flow.description }}
              </p>
              <div class="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground min-w-0">
                <span v-if="flow.projectFullPath" class="truncate min-w-0 flex-1">
                  {{ flow.projectFullPath }}
                </span>
                <span class="shrink-0">{{ formatUpdatedAt(flow.updatedAt) }}</span>
                <span v-if="flow.public" class="text-emerald-600 shrink-0">public</span>
              </div>
            </button>
          </li>
        </ul>

        <div v-if="search.loading.value" class="flex items-center justify-center py-4">
          <Spinner class="h-4 w-4" />
        </div>

        <div v-if="search.hasMore.value && !search.loading.value" class="flex justify-center py-3">
          <Button variant="outline" size="sm" @click="search.loadMore()">Load more</Button>
        </div>
      </ScrollArea>

      <div class="flex justify-between items-center pt-2 min-w-0">
        <Button
          variant="ghost"
          size="sm"
          :disabled="search.loading.value"
          @click="search.refresh()"
        >
          <RefreshCw class="h-4 w-4 mr-1.5" :class="{ 'animate-spin': search.loading.value }" />
          Refresh
        </Button>
        <Button variant="outline" size="sm" @click="open = false">Cancel</Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
