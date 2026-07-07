<script>
import { mapActions, mapState } from 'pinia';
import { DuoRecentCollapsible } from '@gitlab/duo-ui';
import { CHATS_INDEX } from '../routes/constants';
import { useWorkflowStore } from '../stores/workflow';
import { useHistoryStore } from '../stores/history';
import { useMainStore } from '../stores/main';
import ChatHistory from './chat_history.vue';
import { CHAT_MODE } from '../constants';

export default {
  name: 'RecentChats',
  components: {
    DuoRecentCollapsible,
    ChatHistory,
  },
  props: {
    historyDepth: {
      type: Number,
      default: 5,
      required: false,
    },
  },
  computed: {
    ...mapState(useMainStore, ['mode']),
    ...mapState(useWorkflowStore, ['workflowId']),
    ...mapState(useHistoryStore, ['workflows']),
    title() {
      return this.mode === CHAT_MODE ? 'Chats' : 'Sessions';
    },
  },
  methods: {
    switchToHistoryView() {
      this.$router.push({ name: CHATS_INDEX });
    },
  },
};
</script>

<template>
  <div>
    <duo-recent-collapsible
      :display-depth="historyDepth"
      :collapsible-title="title"
      :list-length="workflows.length"
      :is-expanded="false"
      header-styles="chat-history-wrapper"
      @view-all-clicked="switchToHistoryView"
    >
      <chat-history :max-items-number="historyDepth" :show-usage-quota-alert="false" />
    </duo-recent-collapsible>
  </div>
</template>
