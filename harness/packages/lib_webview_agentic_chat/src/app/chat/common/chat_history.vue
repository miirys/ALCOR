<script>
import { mapActions, mapState } from 'pinia';
import ChatHistoryList from './chat_history_list.vue';
import { useHistoryStore } from '../stores/history.js';
import { useUsageQuotaStore } from '../stores/usage_quota';
import { DuoRecentContent } from '@gitlab/duo-ui';
import UsageQuotaAlert from './components/usage_quota_alert.vue';

export default {
  components: {
    DuoRecentContent,
    ChatHistoryList,
    UsageQuotaAlert,
  },
  created() {
    this.getUserWorkflows();
  },
  props: {
    maxItemsNumber: {
      type: [Number, null],
      default: null,
      required: false,
    },
    enableSearch: {
      type: Boolean,
      default: false,
      required: false,
    },
    showUsageQuotaAlert: {
      type: Boolean,
      default: true,
      required: false,
    },
  },
  computed: {
    ...mapState(useHistoryStore, ['areWorkflowsLoading', 'workflows']),
    ...mapState(useUsageQuotaStore, ['usageQuotaExceeded']),
    hasWorkflows() {
      return this.workflows.length > 0;
    },
    workflowsToDisplay() {
      return this.maxItemsNumber ? this.workflows.slice(0, this.maxItemsNumber) : this.workflows;
    },
  },
  methods: {
    ...mapActions(useHistoryStore, ['getUserWorkflows']),
  },
};
</script>

<template>
  <div class="gl-border-t">
    <usage-quota-alert v-if="showUsageQuotaAlert" :usage-quota-exceeded="usageQuotaExceeded" />
    <duo-recent-content
      :is-loading="areWorkflowsLoading"
      :has-items="hasWorkflows"
      empty-state-message="You haven't created a conversation yet."
    >
      <template #content>
        <chat-history-list :workflow-items="workflowsToDisplay" :enable-search="enableSearch" />
      </template>
    </duo-recent-content>
  </div>
</template>
