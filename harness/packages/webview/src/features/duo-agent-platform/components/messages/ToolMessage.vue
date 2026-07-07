<script setup lang="ts">
import type { DuoMessage } from '@gitlab-org/graphql';
import { computed, ref, toRef } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { useToolInfo } from '../../composables/useToolInfo';
import ExecutionDetails from './tool-details/ExecutionDetails.vue';
import { Badge } from '@/components/ui/badge';

interface Props {
  message: DuoMessage;
  wasApproved?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  copyCode: [code: string];
}>();

const { toolInfo, toolLabel } = useToolInfo(toRef(() => props.message.toolInfo));

const statusBadge = computed(() => {
  const successLabel = props.wasApproved ? 'Approved' : 'Success';
  const r = toolInfo.value?.toolResponse;
  const status = r && typeof r === 'object' ? (r as Record<string, unknown>).status : null;
  switch (status) {
    case 'success':
      return { label: successLabel, variant: 'default' as const };
    case 'failure':
      return { label: 'Failed', variant: 'destructive' as const };
    case 'timed_out':
      return { label: 'Timed out', variant: 'outline' as const };
    case 'cancelled':
      return { label: 'Cancelled', variant: 'secondary' as const };
    default:
      return { label: 'Failed', variant: 'destructive' as const };
  }
});

const detailsOpen = ref(false);
</script>

<template>
  <div v-if="toolInfo" class="w-full min-w-0">
    <div class="mt-2 rounded-md border border-border">
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          type="button"
          class="inline-flex items-center justify-center size-5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Tool details"
          :aria-expanded="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        >
          <ChevronDown
            class="size-3.5 transition-transform duration-200 cursor-pointer"
            :class="{ '-rotate-90': !detailsOpen }"
          />
        </button>
        <div class="flex flex-1 items-center justify-between gap-3">
          <span class="capitalize">{{ toolLabel }}</span>
          <Badge v-if="statusBadge" :variant="statusBadge.variant" class="rounded-xl">{{
            statusBadge.label
          }}</Badge>
        </div>
      </div>
      <div v-show="detailsOpen" class="p-3">
        <ExecutionDetails :tool-info="toolInfo" @copy-code="emit('copyCode', $event)" />
      </div>
    </div>
  </div>
</template>
