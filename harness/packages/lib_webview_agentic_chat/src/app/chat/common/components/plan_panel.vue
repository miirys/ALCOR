<script>
import { GlCollapse, GlIcon, GlSafeHtmlDirective as SafeHtml } from '@gitlab/ui';
import { isTerminated } from '@gitlab-lsp/workflow-api';
import StepStatusBadge from './step_status_badge.vue';

export default {
  name: 'PlanPanel',
  components: {
    StepStatusBadge,
    GlCollapse,
    GlIcon,
  },
  directives: {
    SafeHtml,
  },
  props: {
    workflowStatus: {
      type: String,
      required: true,
    },
    isPlanApproved: {
      required: false,
      type: Boolean,
      default: false,
    },
    isApprovingPlan: {
      required: false,
      type: Boolean,
      default: false,
    },
    planSteps: {
      type: Array,
      required: true,
      validator(steps) {
        return steps.every((step) => {
          return step.id && typeof step.description === 'string' && typeof step.status === 'string';
        });
      },
    },
  },
  data() {
    return {
      showPanel: false,
    };
  },
  computed: {
    currentStep() {
      return this.planSteps[this.currentStepIndex];
    },
    currentStepIndex() {
      const activeStep = this.planSteps.find(
        (step) => step.status !== 'Completed' && step.status !== 'Failed',
      );

      return this.planSteps.indexOf(activeStep);
    },
    currentStepNumber() {
      // Count the number of completed steps and add 1 for the currently active step
      const completedSteps = this.planSteps.filter(
        (step) => step.status === 'Completed' || step.status === 'Failed',
      ).length;
      return completedSteps === this.planSteps.length ? this.planSteps.length : completedSteps + 1;
    },
    hasSteps() {
      return this.planSteps.length > 0;
    },
    isTerminated() {
      return isTerminated(this.workflowStatus);
    },
    planState() {
      return this.showPanel
        ? { text: 'Hide plan', icon: 'chevron-down' }
        : { text: 'Show plan', icon: 'chevron-up' };
    },
    showActiveStep() {
      // Optismistic rendering of active step if isPlanApproved is true, otherwise we only
      // know the plan was approved implicitly if the step is non-0
      return !this.isTerminated && (this.isPlanApproved || this.currentStepIndex !== 0);
    },

    stepsTotalCount() {
      return this.planSteps.length;
    },
  },
  watch: {
    isPlanApproved(flag) {
      if (flag) {
        this.showPanel = false;
      }
    },
    isApprovingPlan(newValue) {
      if (newValue) {
        this.showPanel = true;
      }
    },
  },
  methods: {
    formatTestId(index) {
      return this.showActiveStep ? 'active-step' : '';
    },
    setActiveStep(index) {
      return this.showActiveStep && index === this.currentStepIndex
        ? this.$options.currentStepCss
        : '';
    },
    togglePanel() {
      this.showPanel = !this.showPanel;
    },
  },
  currentStepCss: 'gl-rounded-lg selected-item',
};
</script>
<template>
  <div v-if="hasSteps" class="gl-py-4 gl-pl-4 gl-border-b gl-relative">
    <gl-collapse v-model="showPanel" class="gl-bottom-full gl-overflow-y-auto plan-panel-max-h">
      <ul
        class="gl-flex gl-flex-col gl-gap-5 gl-list-style-none gl-p-2 gl-pt-4 gl-text-sm gl-max-w-limited checkpoint-list"
        data-testid="checkpoint-list"
      >
        <li
          class="gl-flex gl-items-baseline"
          v-for="(step, index) in planSteps"
          :class="setActiveStep(index)"
          :key="step.id"
          :data-testid="formatTestId(index)"
        >
          <div>
            <step-status-badge :status="step.status" />
          </div>
          <div class="gl-px-3 overflow-text">
            <span>{{ index + 1 }}. </span>
            <span v-safe-html="step.description" class="gl-markdown"></span>
          </div>
        </li>
      </ul>
    </gl-collapse>
    <div
      class="gl-flex gl-justify-between gl-cursor-pointer show-plan"
      @click="togglePanel"
      role="button"
      tabindex="0"
      data-testid="toggle-panel"
    >
      <div>
        <span>{{ planState.text }}</span
        ><gl-icon :name="planState.icon" />
      </div>
      <div class="gl-shrink-0" v-if="showActiveStep">
        <span class="gl-pr-2" data-testid="step-count"
          >At step {{ currentStepNumber }} / {{ stepsTotalCount }}</span
        >
      </div>
    </div>
  </div>
</template>
