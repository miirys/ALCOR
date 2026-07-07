<script setup lang="ts">
import { computed } from 'vue';
import { TrashIcon, AlertCircleIcon, RotateCcwIcon } from 'lucide-vue-next';
import type { DuoWorkflowEvent } from '@gitlab-org/graphql';
import { useDateFormat } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Spinner } from '@/components/ui/spinner';

interface ChatItemProps {
  id: string;
  updateAt: string;
  goal: string;
  latestCheckpoint: DuoWorkflowEvent | null;
  isDeleting?: boolean;
  hasDeleteError?: boolean;
}
const props = withDefaults(defineProps<ChatItemProps>(), {
  isDeleting: false,
  hasDeleteError: false,
});

const updatedAt = computed(() => useDateFormat(props.updateAt, 'MMMM DD, YYYY · hh:mm A'));

const firstDuoMessage = computed(() =>
  props.latestCheckpoint?.duoMessages.find((message) => message.messageType === 'agent'),
);

const emit = defineEmits<{
  delete: [id: string];
  click: [id: string];
}>();

const handleClick = () => {
  emit('click', props.id);
};
</script>
<template>
  <li class="p-2 cursor-pointer rounded" @click="handleClick">
    <Separator />
    <div class="text-muted-foreground pt-2 flex gap-2">
      {{ updatedAt }}
      <!-- Delete Error State -->
      <TooltipProvider v-if="hasDeleteError">
        <Tooltip>
          <TooltipTrigger as-child>
            <AlertCircleIcon
              class="w-5 h-5 text-destructive"
              aria-hidden="true"
              aria-label="Error icon"
              :data-testid="'delete-error'"
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>Failed to delete. Click retry to try again.</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
    <div class="flex justify-between items-center">
      <div class="font-bold line-clamp-2">
        {{ props.goal }}
      </div>
      <div class="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                :aria-label="hasDeleteError ? 'Retry deleting chat thread' : 'Delete chat thread'"
                @click.stop="emit('delete', id)"
              >
                <Spinner v-if="props.isDeleting" />
                <RotateCcwIcon v-else-if="hasDeleteError" aria-hidden="true" />
                <TrashIcon v-else aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{{ hasDeleteError ? 'Retry delete' : 'Delete chat' }}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
    <div class="font-light line-clamp-1">
      {{ firstDuoMessage?.content }}
    </div>
  </li>
</template>
