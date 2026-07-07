<script>
import { GlCollapsibleListbox, GlIcon, GlTooltipDirective } from '@gitlab/ui';
import { mapActions, mapState } from 'pinia';
import { useRepositoriesStore } from '../stores/repositories';

export default {
  components: {
    GlCollapsibleListbox,
    GlIcon,
  },
  directives: {
    GlTooltip: GlTooltipDirective,
  },
  computed: {
    ...mapState(useRepositoriesStore, [
      'repositories',
      'hasMultipleProjects',
      'currentProject',
      'selectedProjectPath',
      'workflowProjectPath',
    ]),

    toggleText() {
      if (!this.currentProject) {
        return 'Select project';
      }
      const remoteName = this.currentProject.remoteName;
      return remoteName ? `${this.currentProject.name} (${remoteName})` : this.currentProject.name;
    },

    isProjectSelectorDisabled() {
      return this.workflowProjectPath !== null;
    },

    lockedProjectDisplayText() {
      if (!this.workflowProjectPath) {
        return '';
      }

      // Try to find the workflow project in current repositories to show remote name
      const project = this.repositories
        .flatMap((repo) => repo.projects || [])
        .find((p) => p.namespaceWithPath === this.workflowProjectPath);

      if (project) {
        return project.remoteName ? `${project.name} (${project.remoteName})` : project.name;
      }

      // Project not in current workspace, just show the path
      return this.workflowProjectPath;
    },

    listboxGroups() {
      return this.repositories.map((repo) => ({
        text: repo.folderName,
        options: (repo.projects || []).map((project) => {
          const duoAgenticChatAvailable = project.duoAgenticChatAvailable === true;

          return {
            value: project.namespaceWithPath,
            text: project.namespaceWithPath,
            secondaryText: project.remoteName,
            disabled: !duoAgenticChatAvailable,
            extraAttrs: {
              noDapAccess: !duoAgenticChatAvailable,
            },
          };
        }),
      }));
    },
  },
  methods: {
    ...mapActions(useRepositoriesStore, ['selectProject']),

    handleProjectSelect(projectPath) {
      // Find the project to check if it has DAP access
      const project = this.repositories
        .flatMap((repo) => repo.projects || [])
        .find((p) => p.namespaceWithPath === projectPath);

      // Prevent selection of projects without DAP access
      if (project && project.duoAgenticChatAvailable !== true) {
        return;
      }

      this.selectProject(projectPath);
    },

    handleItemClick(event, item) {
      // Prevent click on disabled items
      if (item.extraAttrs?.noDapAccess) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  },
};
</script>

<template>
  <div
    v-if="isProjectSelectorDisabled && lockedProjectDisplayText"
    data-testid="locked-project"
    class="gl-flex gl-items-center gl-gap-2 gl-px-2 gl-py-1 gl-max-w-26"
  >
    <gl-icon name="project" class="gl-text-secondary" />
    <span
      v-gl-tooltip
      data-testid="locked-project-text"
      class="gl-text-sm gl-truncate"
      :title="lockedProjectDisplayText"
      >{{ lockedProjectDisplayText }}</span
    >
  </div>
  <gl-collapsible-listbox
    v-else
    data-testid="project-selector-dropdown"
    :items="listboxGroups"
    :selected="selectedProjectPath"
    :toggle-text="toggleText"
    category="tertiary"
    icon="project"
    toggle-class="nav-bar-link gl-max-w-26"
    @select="handleProjectSelect"
  >
    <template #group-label="{ group }">
      <div class="gl-flex gl-items-center">
        <gl-icon name="folder-o" class="gl-mr-2" />
        <span class="gl-font-weight-bold">{{ group.text }}</span>
      </div>
    </template>
    <template #list-item="{ item }">
      <div
        class="gl-flex gl-flex-col"
        :class="{ 'gl-cursor-not-allowed gl-opacity-60': item.extraAttrs?.noDapAccess }"
        @click="handleItemClick($event, item)"
      >
        <div class="gl-flex gl-items-center gl-gap-2">
          <span :class="{ 'gl-text-secondary': item.extraAttrs?.noDapAccess }">
            {{ item.text }}
          </span>
          <gl-icon
            v-if="item.extraAttrs?.noDapAccess"
            v-gl-tooltip="'This project does not have GitLab Duo Agent Platform access'"
            name="information-o"
            class="gl-text-orange-500"
          />
        </div>
        <span class="gl-text-secondary gl-text-sm">{{ item.secondaryText }}</span>
      </div>
    </template>
  </gl-collapsible-listbox>
</template>
