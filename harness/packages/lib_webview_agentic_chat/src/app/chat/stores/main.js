import { defineStore } from 'pinia';
import { WorkflowFilter, WorkflowType } from '@gitlab-lsp/workflow-api';
import { defaultSlashCommands } from '../common/slash_commands.ts';
import { ALLOWED_MODES, CHAT_MODE } from '../constants.ts';
import { useHealthCheckStore } from './health_check';

export const useMainStore = defineStore('main', {
  state: () => ({
    mode: CHAT_MODE,
    isLoadingMinimumTime: false,
    projectPath: null,
    projectId: null,
    namespaceId: null,
    namespacePath: null,
    slashCommands: defaultSlashCommands,
    softwareDevelopmentFlowRegistryEnabled: false,
  }),
  getters: {
    isFlowTab: (state) => {
      return state.mode !== CHAT_MODE;
    },
    workflowType: (state) => {
      return state.mode === CHAT_MODE ? WorkflowType.CHAT : WorkflowType.SOFTWARE_DEVELOPMENT;
    },
    // getter for workflowFilter based on mode for fetching workflows
    // WorkflowType.CHAT only include `GitLab Duo` agent
    // When the FF is enabled, use software_development/v1 to fetch the new flow registry workflows
    workflowFilter: (state) => {
      if (state.mode === CHAT_MODE) {
        return WorkflowFilter.FOUNDATIONAL_CHAT_AGENTS;
      }
      return state.softwareDevelopmentFlowRegistryEnabled
        ? WorkflowType.SOFTWARE_DEVELOPMENT_V1
        : WorkflowType.SOFTWARE_DEVELOPMENT;
    },
  },
  actions: {
    log({ level, message }) {
      this.logToOutputChannel({ level, message });
    },
    setSkillSlashCommands(skillCommands) {
      const skillSlashCommands = skillCommands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description,
        shouldSubmit: true,
        isSkill: true,
        skillName: cmd.skillName,
      }));
      this.slashCommands = [...defaultSlashCommands, ...skillSlashCommands];
    },
    getNamespacePath() {
      this.sendNotification('getNamespacePath');
    },
    notifyAppReady() {
      this.sendNotification('appReady');
      this.sendNotification('webviewReady');
    },
    openUrl(url) {
      this.sendNotification('openUrl', { url });
    },
    copyCodeSnippet(snippet) {
      this.sendNotification('copyCodeSnippet', { snippet });
    },
    insertCodeSnippet(snippet) {
      this.sendNotification('insertCodeSnippet', { snippet });
    },
    copyMessage(message) {
      this.sendNotification('copyMessage', { message });
    },
    copyText(text) {
      this.sendNotification('copyText', { text });
    },
    openFile(path) {
      this.sendNotification('openFile', { filePath: path });
    },
    enableMinimumLoadTime() {
      this.isLoadingMinimumTime = true;

      window.setTimeout(() => {
        this.isLoadingMinimumTime = false;
      }, 500);
    },
    setProjectPath(projectPath) {
      this.projectPath = projectPath;

      if (!projectPath) {
        const healthCheckStore = useHealthCheckStore();
        healthCheckStore.setProjectValid(false);
      }
    },
    setMode(mode) {
      if (ALLOWED_MODES.includes(mode)) {
        this.mode = mode;
      } else {
        this.logToOutputChannel({
          message: `Passed unsupported mode of ${mode}. Action has been ignored`,
          level: 'warning',
        });
      }
    },
    setNamespacePath(namespacePath) {
      this.namespacePath = namespacePath;

      if (!namespacePath) {
        const healthCheckStore = useHealthCheckStore();
        healthCheckStore.setNamespaceValid(false);
      }
    },
    startSubscriptions(workflowId) {
      this.sendNotification('startSubscriptions', { workflowId });
    },
    trackFeedback({ improveWhat, didWhat, feedbackChoices }) {
      this.sendNotification('trackFeedback', {
        improveWhat,
        didWhat,
        feedbackChoices,
      });
    },
    trackEvent({ event, context }) {
      this.sendNotification('trackEvent', { event, context });
    },
    setFeatureFlags({ softwareDevelopmentFlowRegistry }) {
      this.softwareDevelopmentFlowRegistryEnabled = softwareDevelopmentFlowRegistry;
    },
  },
  events: {
    setNamespacePath: 'setNamespacePath',
    workflowType: 'setWorkflowType',
    setSkillSlashCommands: 'setSkillSlashCommands',
    setFeatureFlags: 'setFeatureFlags',
  },
});
