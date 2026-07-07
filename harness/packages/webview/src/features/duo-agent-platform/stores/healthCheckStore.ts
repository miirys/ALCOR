import { defineStore, storeToRefs } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { EnablementCheckType } from '@gitlab-lsp/workflow-api';
import {
  getDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';
import {
  AUTHENTICATION_ERROR,
  AGENTIC_FEATURES_DISABLED,
  INVALID_GITLAB_PROJECT,
  DEVELOPER_ACCESS_CHECK,
  PERMISSIONS_ERROR,
  USER_PERMISSIONS_ERROR,
  UNKNOWN_ERROR,
  LOADING,
  READY,
  type HealthCheckState,
} from '../components/health-check/constants';
import { useRepositoriesStore } from './repositoriesStore';

export const useHealthCheckStore = defineStore('healthCheck', () => {
  const {
    isDuoEnabledForWorkspaceProjects,
    isLoading: isRepositoriesLoading,
    selectedProjectPath,
  } = storeToRefs(useRepositoriesStore());

  const healthChecks = ref<EnablementCheckType[] | null>(null);
  const isValidProject = ref(true);
  const isWorkflowEnabledForProject = ref(true);
  // Assume authenticated until the backend tells us otherwise.
  const isAuthenticated = ref(true);
  // True while a check for the active project is in flight, so the state machine reports
  // loading instead of flashing a stale error before the real result arrives.
  const isCheckingHealth = ref(false);

  const messageBus: DuoAgentPlatformMessageBus = getDuoAgentPlatformMessageBus();

  messageBus.onNotification('setAuthenticationStatus', (authenticated) => {
    isAuthenticated.value = authenticated;
  });

  const isHealthLoading = computed(() => isRepositoriesLoading.value || isCheckingHealth.value);

  const currentState = computed<HealthCheckState>(() => {
    if (isHealthLoading.value) return LOADING;
    if (!isAuthenticated.value) return AUTHENTICATION_ERROR;
    if (!isDuoEnabledForWorkspaceProjects.value) return AGENTIC_FEATURES_DISABLED;
    if (!isValidProject.value) return INVALID_GITLAB_PROJECT;

    if (!isWorkflowEnabledForProject.value) {
      const userCheck = healthChecks.value?.find((check) => check.name === DEVELOPER_ACCESS_CHECK);
      if (!userCheck) return UNKNOWN_ERROR;
      return userCheck.value ? PERMISSIONS_ERROR : USER_PERMISSIONS_ERROR;
    }

    return READY;
  });

  const showHealthCheckError = computed(
    () => currentState.value !== LOADING && currentState.value !== READY,
  );

  async function checkHealth(projectPath: string | null) {
    isCheckingHealth.value = true;
    try {
      if (!projectPath) {
        isValidProject.value = false;
        isWorkflowEnabledForProject.value = false;
        return;
      }
      const data = await messageBus.sendRequest('checkHealth', { projectPath });
      // Stop checking as project selection changed while it was in flight
      if (selectedProjectPath.value !== projectPath) return;
      healthChecks.value = data.checks;
      isWorkflowEnabledForProject.value = data.enabled;
      isValidProject.value = true;
    } catch {
      if (selectedProjectPath.value === projectPath) isValidProject.value = false;
    } finally {
      // Only the latest selection's check owns the flag; a stale one leaves it for the live one.
      if (selectedProjectPath.value === projectPath) isCheckingHealth.value = false;
    }
  }

  watch(selectedProjectPath, (path) => checkHealth(path), { immediate: true });

  return {
    healthChecks,
    currentState,
    isHealthLoading,
    showHealthCheckError,
  };
});
