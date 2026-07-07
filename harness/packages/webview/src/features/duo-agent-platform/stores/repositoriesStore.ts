import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AgentPlatformRepository } from '@gitlab-lsp/workflow-api';
import {
  getDuoAgentPlatformMessageBus,
  disposeDuoAgentPlatformMessageBus,
  DuoAgentPlatformMessageBus,
} from '../services/DuoAgentPlatformMessageBus';

export const useRepositoriesStore = defineStore('repositories', () => {
  const repositories = ref<AgentPlatformRepository[]>([]);
  // Starts true: the app fetches repositories on init, so the UI shows a loading
  // state on first paint (not a transient error) until `initialState` arrives.
  const isLoading = ref(true);
  const error = ref<string | null>(null);
  const selectedProjectPath = ref<string | null>(null);
  const selectedRootFsPath = ref<string | null>(null);

  let messageBus: DuoAgentPlatformMessageBus | null = null;

  // Computed properties

  const allProjects = computed(() => {
    return repositories.value.flatMap((repo) => repo.projects || []);
  });

  /**
   * Whether DAP should be treated as available for the workspace's projects.
   *
   * Gates on the project-level GitLab Duo features toggle (`duoFeaturesEnabled`)
   * — the same setting the "enable Duo Features in your project settings"
   * message points the user to. A project with the toggle on means DAP is
   * available (it wins even if another project has it off); the UI is blocked
   * only when a project has the toggle explicitly off and none have it on.
   *
   * Workspaces with no project (no git repo / no GitLab remote) report no
   * disabled project, so they stay available and fall back to the user's
   * default namespace (see MR !3001).
   */
  const isDuoEnabledForWorkspaceProjects = computed(() => {
    if (allProjects.value.some((p) => p.duoFeaturesEnabled === true)) {
      return true;
    }

    return !allProjects.value.some((p) => p.duoFeaturesEnabled === false);
  });

  // Actions

  function initialize(injectedMessageBus?: DuoAgentPlatformMessageBus) {
    if (messageBus) {
      return;
    }

    messageBus = injectedMessageBus ?? getDuoAgentPlatformMessageBus();

    messageBus.onNotification('initialState', ({ repositories: repos }) => {
      repositories.value = repos;
      autoSelectProject();
      isLoading.value = false;
    });

    messageBus.onNotification('setRepositories', ({ repositories: repos }) => {
      repositories.value = repos;
      autoSelectProject();
    });
    messageBus.sendNotification('appReady', undefined);
  }

  function dispose() {
    disposeDuoAgentPlatformMessageBus();
    messageBus = null;
  }

  function $reset() {
    repositories.value = [];
    isLoading.value = false;
    error.value = null;
    selectedProjectPath.value = null;
    selectedRootFsPath.value = null;
  }

  // Picks the first DAP-enabled project as soon as repositories arrive, synchronously,
  // so the active selection is set before anything renders. Done here rather than in the
  // selector component to avoid a frame where repositories have settled but no project is
  // selected yet — which surfaces a transient "invalid project" state downstream.
  function autoSelectProject() {
    if (selectedProjectPath.value) return;
    const firstAvailable = allProjects.value.find((p) => p.duoAgenticChatAvailable === true);
    if (firstAvailable) selectProject(firstAvailable.namespaceWithPath);
  }

  function selectProject(projectPath: string) {
    selectedProjectPath.value = projectPath;

    const repository = repositories.value.find((repo) =>
      repo.projects?.some((p) => p.namespaceWithPath === projectPath),
    );

    selectedRootFsPath.value = repository?.rootFsPath ?? null;
    if (repository) {
      messageBus?.sendNotification('selectProjectForWorkflow', {
        repositoryPath: repository.rootFsPath,
        projectPath,
      });
    }
  }

  return {
    // State
    repositories,
    isLoading,
    error,
    selectedProjectPath,
    selectedRootFsPath,

    // Computed
    allProjects,
    isDuoEnabledForWorkspaceProjects,

    // Actions
    initialize,
    dispose,
    $reset,
    selectProject,
  };
});
