<script setup lang="ts">
import type { DuoMessage } from '@gitlab-org/graphql';
import { computed, ref, toRef } from 'vue';
import { LoaderCircle } from 'lucide-vue-next';
import { useToolInfo } from '../../composables/useToolInfo';
import ApprovalDetails from './tool-details/ApprovalDetails.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const ProcessingState = {
  APPROVING: 'approving',
  DENYING: 'denying',
  NONE: null,
} as const;

type ProcessingStateValue = (typeof ProcessingState)[keyof typeof ProcessingState];

interface Props {
  message: DuoMessage;
  awaitingApproval?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  approveOnce: [];
  reject: [reason: string];
  copyCode: [code: string];
}>();

const { toolInfo, toolLabel } = useToolInfo(toRef(() => props.message.toolInfo));

const processingState = ref<ProcessingStateValue>(ProcessingState.NONE);
const buttonsDisabled = computed(() => processingState.value !== ProcessingState.NONE);

const showRejectInput = ref(false);
const rejectReason = ref('');

const handleApproveOnce = () => {
  if (buttonsDisabled.value) return;
  processingState.value = ProcessingState.APPROVING;
  emit('approveOnce');
};

const handleRejectClick = () => {
  showRejectInput.value = true;
};

const handleRejectConfirm = () => {
  if (buttonsDisabled.value) return;
  processingState.value = ProcessingState.DENYING;
  emit('reject', rejectReason.value);
  rejectReason.value = '';
};

const handleRejectCancel = () => {
  showRejectInput.value = false;
  rejectReason.value = '';
};
</script>

<template>
  <div class="w-full min-w-0">
    <div class="wrap-break-word flex-1 mb-2">
      {{ message.content }}
    </div>
    <div v-if="awaitingApproval && toolInfo" class="mt-2 rounded-md border border-border">
      <div class="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <span class="capitalize">{{ toolLabel }}</span>
        <Badge class="rounded-xl" variant="default">Pending</Badge>
      </div>
      <div class="p-3">
        <ApprovalDetails :tool-info="toolInfo" @copy-code="emit('copyCode', $event)" />
      </div>
      <div v-if="showRejectInput" class="px-4 pb-4 flex flex-col gap-2 border-t border-border pt-3">
        <Textarea
          v-model="rejectReason"
          placeholder="Tell Duo why you're rejecting this tool execution (optional)"
          class="resize-none max-h-32 overflow-y-auto"
          :rows="3"
          :disabled="buttonsDisabled"
        />
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="primary"
            :disabled="buttonsDisabled"
            @click="handleRejectConfirm"
          >
            <LoaderCircle
              v-if="processingState === ProcessingState.DENYING"
              class="size-3.5 animate-spin mr-1"
            />
            Deny
          </Button>
          <Button size="sm" variant="ghost" :disabled="buttonsDisabled" @click="handleRejectCancel">
            Cancel
          </Button>
        </div>
      </div>
      <div v-else class="flex gap-2 px-4 pb-4 pt-3 border-t border-border">
        <div class="flex">
          <Button
            size="sm"
            variant="primary"
            class="rounded-r-none"
            :disabled="buttonsDisabled"
            @click="handleApproveOnce"
          >
            <LoaderCircle
              v-if="processingState === ProcessingState.APPROVING"
              class="size-3.5 animate-spin mr-1"
            />
            Approve
          </Button>
        </div>
        <Button size="sm" variant="default" :disabled="buttonsDisabled" @click="handleRejectClick">
          Deny
        </Button>
      </div>
    </div>
  </div>
</template>
