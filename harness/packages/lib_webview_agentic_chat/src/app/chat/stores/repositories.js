import { defineStore } from 'pinia';
import { useMainStore } from './main';
import { useAgentStore } from './agents';
import { useChatAvailableModelsStore } from './chat_available_models';

export const useRepositoriesStore = defineStore('repositories', {
  state: () => ({
    repositories: [],
    isLoadingRepositories: false,
    selectedProjectPath: null,
    repoToProjectPathMap: {}, // Map of repositoryPath -> projectPath
    workflowProjectPath: null,
  }),

  getters: {
    /**
     * Get all projects from all repositories (flattened)
     */
    allProjects(state) {
      return state.repositories.flatMap((repo) => repo.projects || []);
    },

    /**
     * Get the currently selected project
     */
    currentProject(state) {
      const mainStore = useMainStore();
      // When locked to a workflow, use workflow's project; otherwise use user's selection
      const currentPath =
        state.workflowProjectPath || state.selectedProjectPath || mainStore.projectPath;

      return this.allProjects.find((project) => project.namespaceWithPath === currentPath);
    },

    currentRepository(state) {
      const { currentProject } = this;
      return currentProject
        ? state.repositories.find((repo) =>
            repo.projects?.some((p) => p.namespaceWithPath === currentProject.namespaceWithPath),
          )
        : undefined;
    },

    /**
     * Get the projectId for the currently selected project
     */
    currentProjectId() {
      return this.currentProject?.id || null;
    },

    /**
     * Get the namespaceId for the currently selected project
     */
    currentNamespaceId() {
      return this.currentProject?.namespaceId || null;
    },

    currentRootNamespaceId() {
      return this.currentProject?.rootNamespaceId || null;
    },

    /**
     * Check if there are multiple projects available
     */
    hasMultipleProjects() {
      return this.allProjects.length > 1;
    },

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
    isDuoEnabledForWorkspaceProjects() {
      if (this.allProjects.some((p) => p.duoFeaturesEnabled === true)) {
        return true;
      }

      return !this.allProjects.some((p) => p.duoFeaturesEnabled === false);
    },
  },

  actions: {
    /**
     * Fetch all repositories from the backend
     */
    getRepositories() {
      this.isLoadingRepositories = true;
      this.sendNotification('getRepositories');
    },

    /**
     * Set repositories data received from backend
     */
    setRepositories(data) {
      this.isLoadingRepositories = false;
      this.repositories = data.repositories || [];
    },

    /**
     * Fetch agents and models for a project
     * @param {Object} project - Project object with id, namespaceId, and rootNamespaceId (GraphQL GIDs)
     */
    fetchAgentsAndModels(project) {
      if (!project) return;

      const agentStore = useAgentStore();
      const chatAvailableModelsStore = useChatAvailableModelsStore();

      if (project.id) {
        agentStore.fetchCatalogAgents(project.id);
      }

      if (project.id && project.namespaceId) {
        agentStore.fetchFoundationalAgents(project.id, project.namespaceId);
      }

      const namespaceIdForModels = project.rootNamespaceId || project.namespaceId;
      if (namespaceIdForModels) {
        chatAvailableModelsStore.fetchChatAvailableModels(namespaceIdForModels);
      }
    },

    /**
     * Set repository to project path map
     */
    setRepoToProjectPathMap(repoToProjectPathMap) {
      this.repoToProjectPathMap = repoToProjectPathMap || {};

      const projectToSelect = this.determineProjectToSelect(repoToProjectPathMap);

      if (projectToSelect) {
        this.applyProjectSelection(projectToSelect);
      }
    },

    /**
     * Determine which project should be selected based on persisted or default selection
     */
    determineProjectToSelect(repoToProjectPathMap) {
      // Try to find a persisted selection first
      const persistedProject = this.findPersistedProject(repoToProjectPathMap);
      if (persistedProject) return persistedProject;

      // Fall back to auto-selecting first available project
      return this.findDefaultProject();
    },

    /**
     * Find a project that was previously selected and persisted
     */
    findPersistedProject(repoToProjectPathMap) {
      const firstSelectedRepo = this.repositories.find(
        (repo) => repoToProjectPathMap[repo.rootFsPath],
      );

      if (firstSelectedRepo) {
        return repoToProjectPathMap[firstSelectedRepo.rootFsPath];
      }

      return null;
    },

    /**
     * Find the first available project with DAP access to auto-select
     */
    findDefaultProject() {
      const mainStore = useMainStore();

      // Only auto-select if no project is currently set
      if (this.selectedProjectPath || mainStore.projectPath) {
        return null;
      }

      // Only proceed if we have projects available
      if (this.allProjects.length === 0) {
        return null;
      }

      const firstAvailableProject = this.allProjects.find(
        (p) => p.duoAgenticChatAvailable === true,
      );

      return firstAvailableProject?.namespaceWithPath || null;
    },

    /**
     * Apply the selected project to state and main store
     */
    applyProjectSelection(projectPath) {
      this.selectedProjectPath = projectPath;

      const mainStore = useMainStore();
      mainStore.setProjectPath(projectPath);

      // Find the selected project and fetch agents/models
      const selectedProject = this.allProjects.find((p) => p.namespaceWithPath === projectPath);
      this.fetchAgentsAndModels(selectedProject);
    },

    /**
     * Select a project by its namespace path
     */
    selectProject(projectPath) {
      this.selectedProjectPath = projectPath;

      const mainStore = useMainStore();
      mainStore.setProjectPath(projectPath);

      // Find the selected project and fetch agents/models
      const selectedProject = this.allProjects.find((p) => p.namespaceWithPath === projectPath);
      this.fetchAgentsAndModels(selectedProject);

      // Find the repository that contains this project
      const repository = this.repositories.find((repo) =>
        repo.projects?.some((p) => p.namespaceWithPath === projectPath),
      );

      if (repository) {
        // Update local map
        this.repoToProjectPathMap[repository.rootFsPath] = projectPath;

        // Persist selection with repository path
        this.sendNotification('selectProjectForWorkflow', {
          repositoryPath: repository.rootFsPath,
          projectPath,
        });
      }
    },

    /**
     * Set the project from an active workflow (locks the selector)
     */
    setWorkflowProject(projectPath) {
      // Only set workflowProjectPath for locking - don't change user's selection
      this.workflowProjectPath = projectPath;

      // Update mainStore projectPath for the workflow context
      if (projectPath) {
        const mainStore = useMainStore();
        mainStore.setProjectPath(projectPath);

        // Find the workflow project and fetch agents/models
        const workflowProject = this.allProjects.find((p) => p.namespaceWithPath === projectPath);
        this.fetchAgentsAndModels(workflowProject);
      }
    },

    /**
     * Clear the workflow project lock (when navigating away)
     */
    clearWorkflowProject() {
      this.workflowProjectPath = null;

      // Restore user's selected project
      if (this.selectedProjectPath) {
        const mainStore = useMainStore();
        mainStore.setProjectPath(this.selectedProjectPath);
      }
    },
  },

  events: {
    setRepositories: 'setRepositories',
    setRepoToProjectPathMap: 'setRepoToProjectPathMap',
    setWorkflowProject: 'setWorkflowProject',
  },
});
