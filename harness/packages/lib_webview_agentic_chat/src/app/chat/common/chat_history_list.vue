<script>
import {
  GlIcon,
  GlLink,
  GlButton,
  GlAlert,
  GlSearchBoxByType,
  GlTooltipDirective,
} from '@gitlab/ui';
import { mapActions, mapState } from 'pinia';
import { getIDfromGraphqlId } from '../../../common/utils.ts';
import { useWorkflowStore } from '../stores/workflow';
import { useHistoryStore } from '../stores/history';
import { useAgentStore } from '../stores/agents';
import { formatTimeAgo } from '@gitlab-org/core';
import { truncateToNCharacters } from '../utils/text_utils';
import { CHATS_SHOW } from '../routes/constants';
import { useMainStore } from '../stores/main.js';

export const i18n = {
  ARCHIVED_LABEL: 'Archived',
};

export default {
  components: {
    GlIcon,
    GlLink,
    GlButton,
    GlAlert,
    GlSearchBoxByType,
  },
  directives: {
    GlTooltip: GlTooltipDirective,
  },
  props: {
    workflowItems: {
      type: Array,
      required: true,
    },
    enableSearch: {
      type: Boolean,
      default: false,
      required: false,
    },
  },
  data() {
    return {
      searchTerm: '',
    };
  },
  computed: {
    ...mapState(useMainStore, ['isFlowTab']),
    ...mapState(useHistoryStore, ['workflowErrors']),
    filteredWorkflowItems() {
      if (!this.searchTerm) return this.workflowItems;
      const searchTermLowerCase = this.searchTerm.toLowerCase();
      return this.workflowItems.filter((item) => {
        return item.goal.toLowerCase().includes(searchTermLowerCase);
      });
    },
    placeholder() {
      return this.isFlowTab ? 'Search sessions' : 'Search chats';
    },
  },
  methods: {
    ...mapActions(useWorkflowStore, ['getWorkflowById']),
    ...mapActions(useHistoryStore, ['removeWorkflow', 'clearRemoveError']),
    ...mapActions(useAgentStore, ['setAgentByReference']),
    isArchived(workflowItem) {
      return workflowItem.archived || workflowItem.stalled;
    },
    formatDate(date) {
      return formatTimeAgo(date, true);
    },
    showChatThread(workflowItem) {
      if (this.isArchived(workflowItem)) {
        return;
      }
      this.setAgentByReference(
        workflowItem.workflowDefinition,
        workflowItem.aiCatalogItemVersionId,
      );

      const workflowId = getIDfromGraphqlId(workflowItem.id);
      this.getWorkflowById(workflowId);
      this.$router.push({ name: CHATS_SHOW, params: { workflowId } });
    },
    truncateGoal(goal) {
      return truncateToNCharacters(goal, 100);
    },
    removeWorkflowItem(workflowId) {
      this.removeWorkflow(workflowId);
    },
  },
  i18n,
};
</script>
<template>
  <div>
    <div class="gl-p-5" v-if="enableSearch">
      <gl-search-box-by-type
        v-model="searchTerm"
        :placeholder="placeholder"
        class="gl-w-full"
        aria-label="Search chat history"
      />
    </div>
    <gl-alert
      v-if="workflowErrors"
      class="gl-my-3"
      variant="danger"
      :dismissible="true"
      @dismiss="clearRemoveError"
      >{{ workflowErrors }}</gl-alert
    >
    <ul class="gl-pl-0 border-0 gl-mb-0 chat-history-list">
      <li
        v-for="workflowItem in filteredWorkflowItems"
        :key="workflowItem.id"
        class="gl-list-none gl-my-0"
      >
        <component
          :is="isArchived(workflowItem) ? 'span' : 'gl-link'"
          v-gl-tooltip.hover
          :title="isArchived(workflowItem) ? $options.i18n.ARCHIVED_LABEL : null"
          class="navigation-link gl-flex gl-break-words gl-min-w-0 gl-text-sm gl-text-blue-900 text-decoration-none gl-relative"
          :class="{ 'text-muted': isArchived(workflowItem) }"
          @click="showChatThread(workflowItem)"
        >
          <span
            class="workflow-row-goal gl-flex-1 gl-mr-2 gl-py-2 gl-pl-6"
            :title="workflowItem.goal"
          >
            <gl-icon v-if="isArchived(workflowItem)" name="archive" class="gl-mr-2" size="12" />
            {{ truncateGoal(workflowItem.goal) }}
          </span>
          <div class="row-actions gl-relative gl-py-2 gl-pr-3">
            <gl-button
              category="tertiary"
              icon="remove"
              size="small"
              data-testid="remove-button"
              class="gl-absolute gl-hidden !gl-bg-transparent gl-top-0 gl-mr-3"
              title="Delete chat"
              @click.stop.prevent="removeWorkflowItem(workflowItem.id)"
            />
            <time :datetime="workflowItem.updatedAt" class="gl-text-secondary">
              {{ formatDate(workflowItem.updatedAt) }}
            </time>
          </div>
        </component>
      </li>
    </ul>
  </div>
</template>
