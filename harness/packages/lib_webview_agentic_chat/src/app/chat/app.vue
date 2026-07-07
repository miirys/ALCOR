<script>
import { mapActions, mapState } from 'pinia';
import {
  GlBadge,
  GlDisclosureDropdown,
  GlDisclosureDropdownItem,
  GlIcon,
  GlLink,
  GlLoadingIcon,
} from '@gitlab/ui';
import { DuoNavigationBar } from '@gitlab/duo-ui';
import { useMainStore } from './stores/main';
import { useWorkflowStore } from './stores/workflow';
import { useHistoryStore } from './stores/history';
import { useUserStore } from './stores/user';
import { useAgentStore } from './stores/agents';
import { useRepositoriesStore } from './stores/repositories';
import WorkflowHealthCheck from './common/workflow_health_check.vue';
import DuoChatHeaderAgentItem from './common/duo_chat_header_agent_item.vue';
import ProjectSelector from './common/project_selector.vue';
import { useHealthCheckStore } from './stores/health_check';
import { useUsageQuotaStore } from './stores/usage_quota';
import { CHATS_INDEX, CHATS_NEW, CHATS_SHOW } from './routes/constants';
import AgenticChat from './common/chat.vue';
import ChatHistory from './common/chat_history.vue';
import { useChatAvailableModelsStore } from './stores/chat_available_models';

const COPY_MODEL_REF = 'copy_model_ref';
const COPY_WORKFLOW_ID = 'copy_workflow_id';

export default {
  components: {
    GlBadge,
    GlLoadingIcon,
    GlLink,
    GlIcon,
    GlDisclosureDropdown,
    GlDisclosureDropdownItem,
    WorkflowHealthCheck,
    AgenticChat,
    ChatHistory,
    DuoNavigationBar,
    DuoChatHeaderAgentItem,
    ProjectSelector,
  },
  created() {
    this.enableMinimumLoadTime();
    this.notifyAppReady();
    this.getRepositories();
    this.getNamespacePath();
    this.getUserInfo();
    this.getUserWorkflows();
    this.loadPersistedSelectedModel();

    // Watch for active project or workflow definition changes, then check usage quota
    this.$watch(
      () => ({
        rootNamespaceId: useRepositoriesStore().currentProject?.rootNamespaceId,
        flowDefinition: useWorkflowStore().flowDefinition,
      }),
      (current, previous) => {
        const rootNamespaceChanged = current.rootNamespaceId !== previous.rootNamespaceId;
        const flowDefinitionChanged = current.flowDefinition !== previous.flowDefinition;

        if (rootNamespaceChanged || flowDefinitionChanged) {
          this.checkUsageQuota();
        }
      },
    );

    useWorkflowStore().$onAction(({ name, store, args, after }) => {
      if (name === 'setWorkflowId') {
        const [workflowId] = args;
        after((result) => {
          if (this.$route.params.workflowId !== workflowId) {
            this.$router.push({ name: CHATS_SHOW, params: { workflowId } });
          }
        });
      }
    });
  },
  computed: {
    ...mapState(useHealthCheckStore, ['isDuoWorkflowEnabled', 'isLoadingHealthCheck']),
    ...mapState(useMainStore, ['isFlowTab', 'projectPath', 'isLoadingMinimumTime', 'namespaceId']),
    ...mapState(useRepositoriesStore, [
      'isLoadingRepositories',
      'isDuoEnabledForWorkspaceProjects',
    ]),
    ...mapState(useWorkflowStore, ['workflowId']),
    ...mapState(useAgentStore, ['agents']),
    ...mapState(useChatAvailableModelsStore, ['chatAvailableModels', 'userModelSwitchingEnabled']),
    isLoading() {
      return this.isLoadingMinimumTime || this.isLoadingHealthCheck || this.isLoadingRepositories;
    },
    dropdownItems() {
      return this.workflowId
        ? [
            {
              id: COPY_WORKFLOW_ID,
              text: `Copy session ID: ${this.workflowId}`,
            },
          ]
        : [];
    },
    hasDropdownItems() {
      return this.dropdownItems.length > 0;
    },
    hasChatAvailableModels() {
      return Boolean(this.chatAvailableModels?.length) && this.userModelSwitchingEnabled;
    },
    hasChatModelPinned() {
      return Boolean(this.chatAvailableModels?.find((model) => model.isPinned));
    },
    hasManyAgents() {
      // TODO: Once we have a query to get a list of Flows, we can avoid this hard
      // conditional and instead just have different graphql queries for Agents and Flows.
      return !this.isFlowTab && this.agents.length > 1;
    },
  },
  watch: {
    $route: {
      handler(route, previousRoute) {
        const repositoriesStore = useRepositoriesStore();

        // Clear workflow project lock when:
        // 1. Navigating away from the workflow show route, OR
        // 2. Navigating to a different workflow (different workflowId) - but NOT when transitioning from null/undefined to a new one
        const isShowRoute = route.name === CHATS_SHOW;
        const previousWorkflowId = previousRoute?.params?.workflowId;
        const currentWorkflowId = route.params?.workflowId;

        // Only clear if we're leaving the show route OR switching between two defined workflows
        const isLeavingShowRoute = !isShowRoute;
        const isSwitchingBetweenWorkflows =
          isShowRoute && previousWorkflowId && currentWorkflowId !== previousWorkflowId;

        if (isLeavingShowRoute || isSwitchingBetweenWorkflows) {
          repositoriesStore.clearWorkflowProject();
        }
      },
    },
  },
  methods: {
    ...mapActions(useMainStore, [
      'getNamespacePath',
      'notifyAppReady',
      'enableMinimumLoadTime',
      'copyText',
    ]),
    ...mapActions(useRepositoriesStore, ['getRepositories']),
    ...mapActions(useHistoryStore, ['getUserWorkflows']),
    ...mapActions(useUserStore, ['getUserInfo']),
    ...mapActions(useAgentStore, ['setAgentByReference']),
    ...mapActions(useChatAvailableModelsStore, ['setSelectedModel', 'loadPersistedSelectedModel']),
    ...mapActions(useUsageQuotaStore, ['checkUsageQuota']),
    startNewChatWithAgent(agent) {
      if (agent.foundational) {
        this.setAgentByReference('', agent.referenceWithVersion);
      } else {
        this.setAgentByReference(agent.pinnedItemVersionId || '', '');
      }
      this.$router.push({
        ...this.$options.newChatRoute,
        query: { agent, timestamp: Date.now() },
      });
    },
    startNewChatWithModel(model) {
      this.setSelectedModel(model?.ref);

      this.$router.push({
        ...this.$options.newChatRoute,
        query: { model, timestamp: Date.now() },
      });
    },
    onDropdownItemSelected(item) {
      switch (item.id) {
        case COPY_WORKFLOW_ID:
          this.copyText(this.workflowId);
          break;
        default:
          break;
      }
    },
    newChatRouteWithTimestamp() {
      return {
        ...this.$options.newChatRoute,
        query: { timestamp: Date.now() },
      };
    },
  },
  newChatRoute: { name: CHATS_NEW },
  chatHistoryRoute: { name: CHATS_INDEX },
  navigationItems: [],
};
</script>
<template>
  <div
    class="gl-h-full gl-flex gl-flex-col"
    :class="{ 'workflow-container': !isDuoWorkflowEnabled }"
  >
    <gl-loading-icon
      v-if="isLoading"
      size="lg"
      class="gl-absolute gl-top-8 gl-left-1/2 gl-translate-x--50"
    />
    <workflow-health-check v-else-if="!isDuoWorkflowEnabled || !isDuoEnabledForWorkspaceProjects" />
    <template v-else>
      <duo-navigation-bar
        :show-dropdown="hasDropdownItems"
        :navigation-items="$options.navigationItems"
        :dropdown-items="dropdownItems"
        @dropdown-item-selected="onDropdownItemSelected"
        class="!gl-gap-3 gl-py-2 gl-px-3 chat-nav-bar gl-flex-wrap"
      >
        <template #custom-content>
          <span
            data-testid="navigation-bar-filler"
            class="gl-flex-shrink-0 gl-flex-grow gl-w-15"
          ></span>
          <gl-disclosure-dropdown
            v-if="hasManyAgents"
            toggle-text="New chat"
            :items="agents"
            category="tertiary"
            icon="duo-chat-new"
            text-sr-only
            no-caret
            toggle-class="nav-bar-link"
            @action="startNewChatWithAgent"
          >
            <template #list-item="{ item }">
              <duo-chat-header-agent-item :agent="item" />
            </template>
          </gl-disclosure-dropdown>
          <gl-link
            v-else
            :to="newChatRouteWithTimestamp()"
            class="navigation-link nav-bar-link gl-p-2 !gl-text-inherit"
          >
            <gl-icon name="duo-chat-new" />
          </gl-link>
          <gl-disclosure-dropdown
            v-if="hasChatAvailableModels"
            toggle-text="Create new chat with model"
            category="tertiary"
            icon="preferences"
            text-sr-only
            toggle-class="nav-bar-link"
            no-caret
            fluidWidth
          >
            <gl-disclosure-dropdown-item
              v-for="model in chatAvailableModels"
              :key="model.ref"
              :item="model"
              disabled="hasChatModelPinned"
              @action="startNewChatWithModel"
            >
              <template #list-item>
                <div class="gl-flex" :class="{ 'gl-cursor-not-allowed': hasChatModelPinned }">
                  <gl-icon
                    v-if="model.isSelected"
                    name="check"
                    class="gl-new-dropdown-item-check-icon"
                  />
                  {{ model.name }}
                  <gl-badge
                    v-if="model.isPinned"
                    v-gl-tooltip
                    title="Pinned model"
                    variant="info"
                    icon="lock"
                    class="!gl-ml-2"
                  />
                  <gl-badge
                    v-else-if="model.isDefault"
                    v-gl-tooltip
                    title="GitLab default model"
                    variant="info"
                    icon="tanuki"
                    class="!gl-ml-2"
                  />
                </div>
              </template>
            </gl-disclosure-dropdown-item>
          </gl-disclosure-dropdown>
          <gl-link
            :to="$options.chatHistoryRoute"
            class="navigation-link nav-bar-link gl-p-2 !gl-text-inherit"
          >
            <gl-icon name="history" />
          </gl-link>
          <project-selector />
        </template>
      </duo-navigation-bar>
      <router-view />
    </template>
  </div>
</template>
<style lang="scss">
@import '../chat_styles.scss';
</style>
