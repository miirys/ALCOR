<script>
import { GlIcon } from '@gitlab/ui';

const STATUS_MAP = {
  // Legacy plan step statuses (from PlannerTool / WorkflowState.plan)
  NOT_STARTED: { status: 'Not Started', variant: 'subtle', icon: 'status-waiting' },
  IN_PROGRESS: { status: 'In Progress', variant: 'info', icon: 'status-running' },
  COMPLETED: { status: 'Completed', variant: 'success', icon: 'status-success' },
  CANCELLED: { status: 'Cancelled', variant: 'danger', icon: 'status-cancelled' },
  // todo_write statuses (from registry flows using TodoWrite tool)
  PENDING: { status: 'pending', variant: 'subtle', icon: 'status-waiting' },
  TODO_IN_PROGRESS: { status: 'in_progress', variant: 'info', icon: 'status-running' },
  TODO_COMPLETED: { status: 'completed', variant: 'success', icon: 'status-success' },
  TODO_CANCELLED: { status: 'cancelled', variant: 'danger', icon: 'status-cancelled' },
};

export default {
  name: 'StepStatusBadge',
  components: {
    GlIcon,
  },
  props: {
    isActiveStep: {
      required: false,
      type: Boolean,
      default: false,
    },
    status: {
      required: true,
      type: String,
    },
  },
  computed: {
    statusInfo() {
      if (this.isActiveStep) {
        return STATUS_MAP.IN_PROGRESS;
      }

      return (
        Object.values(STATUS_MAP).find((v) => v.status === this.status) || {
          variant: 'subtle',
          icon: 'status-waiting',
        }
      );
    },
  },
};
</script>
<template>
  <gl-icon :name="statusInfo.icon" :variant="statusInfo.variant" :size="12" />
</template>
