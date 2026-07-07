<script>
import { mapActions, mapState } from 'pinia';
import { GlEmptyState, GlModal, GlSprintf, GlButton, GlIcon } from '@gitlab/ui';

import { useHealthCheckStore } from '../stores/health_check';
import { useRepositoriesStore } from '../stores/repositories';
import { useMainStore } from '../stores/main';
import { useDockerStore } from '../stores/docker';
import { useUserStore } from '../stores/user';
import {
  INVALID_GITLAB_PROJECT,
  PERMISSIONS_ERROR,
  USER_PERMISSIONS_ERROR,
  AUTHENTICATION_ERROR,
  DOCKER_CONFIGURATION_ERROR,
  AGENTIC_FEATURES_DISABLED,
  DEVELOPER_ACCESS_CHECK,
  UNKNOWN_ERROR,
} from '../constants';
import ProjectPath from '../common/project_path.vue';
import DockerHealthChecks from './docker_health_checks.vue';
import HealthCheckItem from './health_check_item.vue';

import EmptyProjectSvg from '../common/svgs/empty_project.vue';
import StatusSettingsSvgSm from '../common/svgs/status_settings_sm.vue';
import UserPermissionsSvg from '../common/svgs/user_permissions.vue';
import StatusSettingsSvgMd from '../common/svgs/status_settings_md.vue';
import StatusFailSvg from '../common/svgs/status_fail.vue';

export default {
  components: {
    GlEmptyState,
    GlModal,
    GlSprintf,
    GlButton,
    GlIcon,
    ProjectPath,
    DockerHealthChecks,
    HealthCheckItem,
  },
  computed: {
    ...mapState(useHealthCheckStore, [
      'healthChecks',
      'isValidProject',
      'isWorkflowEnabledForProject',
    ]),
    ...mapState(useRepositoriesStore, ['isDuoEnabledForWorkspaceProjects']),
    ...mapState(useDockerStore, { isDockerReady: 'isReady', dockerStatus: 'status' }),
    ...mapState(useUserStore, ['isAuthenticated']),
    currentState() {
      if (!this.isAuthenticated) {
        return AUTHENTICATION_ERROR;
      }

      // Block only when a group-namespace project has Duo features turned off
      // Personal/no namespace falls back to the default namespace
      if (!this.isDuoEnabledForWorkspaceProjects) {
        return AGENTIC_FEATURES_DISABLED;
      }

      if (!this.isValidProject) {
        return INVALID_GITLAB_PROJECT;
      }

      if (!this.isDockerReady) {
        return DOCKER_CONFIGURATION_ERROR;
      }

      const userCheck =
        this.healthChecks &&
        this.healthChecks.find((check) => check.name === DEVELOPER_ACCESS_CHECK);

      if (!this.isWorkflowEnabledForProject && userCheck) {
        if (!userCheck.value) {
          return USER_PERMISSIONS_ERROR;
        } else {
          return PERMISSIONS_ERROR;
        }
      }

      return UNKNOWN_ERROR;
    },
    currentStateData() {
      return this.$options.states[this.currentState];
    },
    isDockerError() {
      return this.currentState === DOCKER_CONFIGURATION_ERROR;
    },
    isPermissionsError() {
      return this.currentState === PERMISSIONS_ERROR;
    },
    isUserPermissionError() {
      return this.currentState === USER_PERMISSIONS_ERROR;
    },
    isAuthenticationError() {
      return this.currentState === AUTHENTICATION_ERROR;
    },
    isInvalidProject() {
      return this.currentState === INVALID_GITLAB_PROJECT;
    },
    isAgenticFeaturesDisabled() {
      return this.currentState === AGENTIC_FEATURES_DISABLED;
    },
    showRefreshMessage() {
      return !this.isAuthenticationError && !this.isAgenticFeaturesDisabled;
    },
  },
  methods: {
    ...mapActions(useMainStore, ['openUrl']),
    handleRefresh() {
      window.location.reload();
    },
  },
  states: {
    [INVALID_GITLAB_PROJECT]: {
      illustration: EmptyProjectSvg,
      title: 'Use with a GitLab project',
      description: [
        `GitLab Duo Agent Platform only works with GitLab projects that belong to a group namespace. To link your workspace folder to a GitLab project, open the %{strongStart}Source Control%{strongEnd} view.`,
      ],
    },
    [PERMISSIONS_ERROR]: {
      illustration: StatusSettingsSvgSm,
      title: 'Turn on for this project',
      description: [
        'Before you can use GitLab Duo Agent Platform, turn on the following settings.',
      ],
    },
    [USER_PERMISSIONS_ERROR]: {
      illustration: UserPermissionsSvg,
      title: 'Unavailable to you',
      description: ['You must have at least the Developer role in this project.'],
    },
    [AUTHENTICATION_ERROR]: {
      illustration: UserPermissionsSvg,
      title: 'Authentication required',
      description: [
        'Your GitLab authentication token is invalid, expired, or not set.',
        'Please sign in to use GitLab Duo Agent Platform.',
      ],
    },
    [DOCKER_CONFIGURATION_ERROR]: {
      illustration: StatusSettingsSvgMd,
      title: 'Configure Docker',
      helpLink:
        'https://docs.gitlab.com/user/duo_workflow/set_up/#install-docker-and-set-the-socket-file-path',
      description: [
        "Before you can use GitLab Duo Agent Platform, you must configure Docker. It's used to execute arbitrary code, read and write files, and make API calls to GitLab.",
        '%{linkStart}How to set up Docker?%{linkEnd}',
      ],
    },
    [AGENTIC_FEATURES_DISABLED]: {
      illustration: StatusSettingsSvgSm,
      title: 'GitLab Duo Agentic features are disabled',
      description: [
        'GitLab Duo Agent Platform is not available. Make sure Duo Features are enabled in your project settings.',
      ],
    },
    [UNKNOWN_ERROR]: {
      illustration: StatusFailSvg,
      title: 'GitLab Duo Agent Platform is disabled.',
      description: [
        'Unable to validate the project permissions. This could be due to a network error or a misconfiguration. Please contact your GitLab administrator to fix this.',
      ],
    },
  },
};
</script>
<template>
  <gl-empty-state
    class="gl-pt-2 gl-p-5 gl-items-start gl-mx-auto gl-mt-6"
    :content-class="'gl-w-full gl-max-w-full gl-text-left gl-pt-5 gl-px-0'"
  >
    <template #title>
      <component
        :is="currentStateData.illustration"
        :style="{ height: '100px', width: '100px' }"
        class="gl-mb-4"
      />
      <h2 class="gl-mb-0 gl-mt-0 gl-text-size-h-display gl-leading-36 h4">
        {{ currentStateData.title }}
      </h2>
    </template>
    <template #description>
      <p v-for="(line, index) in currentStateData.description" :key="index">
        <gl-sprintf :message="line">
          <template #link="{ content }">
            <gl-button variant="link" @click="openUrl(currentStateData.helpLink)">
              {{ content }}
            </gl-button>
          </template>
          <template #strong="{ content }">
            <strong>{{ content }}</strong></template
          >
        </gl-sprintf>
      </p>
      <project-path v-if="isPermissionsError || isUserPermissionError" class="gl-pb-7" />
      <div v-if="isPermissionsError" class="gl-border-t gl-py-6">
        <ul class="gl-p-0 gl-text-left">
          <health-check-item
            v-for="check in healthChecks"
            :key="check.name"
            :item="check"
            class="gl-py-3"
          />
        </ul>
      </div>
      <docker-health-checks v-if="isDockerError" :docker-status="dockerStatus" />
      <div v-if="showRefreshMessage">
        <p class="text-subtle">Please refresh the page once settings have been updated.</p>
        <gl-button @click="handleRefresh" class="health-check-refresh-button">
          <gl-icon name="retry" class="gl-mr-3" />
          Refresh page
        </gl-button>
      </div>
    </template>
  </gl-empty-state>
</template>
