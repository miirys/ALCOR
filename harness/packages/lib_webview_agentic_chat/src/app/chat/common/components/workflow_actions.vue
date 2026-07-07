<script>
import { GlButton, GlModal, GlModalDirective } from '@gitlab/ui';

export default {
  name: 'WorkflowActions',
  components: {
    GlButton,
    GlModal,
  },
  directives: {
    GlModalDirective,
  },
  props: {
    isSendingEvent: {
      type: Boolean,
      required: true,
    },
    isApprovingPlan: {
      type: Boolean,
      required: true,
    },
  },
};
</script>
<template>
  <div class="gl-flex gl-gap-x-4">
    <template v-if="isApprovingPlan && !isSendingEvent">
      <gl-button
        size="small"
        icon="play"
        variant="confirm"
        data-testid="approve-plan"
        @click="$emit('accept-action')"
      >
        Approve plan
      </gl-button>
    </template>
  </div>
</template>
