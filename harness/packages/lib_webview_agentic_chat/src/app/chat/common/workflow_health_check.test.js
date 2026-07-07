import { shallowMount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { GlEmptyState, GlSprintf } from '@gitlab/ui';
import { useHealthCheckStore } from '../stores/health_check';
import { useUserStore } from '../stores/user';
import { DOCKER_STATES, useDockerStore } from '../stores/docker';
import { useRepositoriesStore } from '../stores/repositories';
import {
  INVALID_GITLAB_PROJECT,
  PERMISSIONS_ERROR,
  USER_PERMISSIONS_ERROR,
  AUTHENTICATION_ERROR,
  DOCKER_CONFIGURATION_ERROR,
  UNKNOWN_ERROR,
} from '../constants.ts';

import ProjectPath from './project_path.vue';
import WorkflowHealthCheck from './workflow_health_check.vue';
import HealthCheckItem from './health_check_item.vue';

describe('WorkflowHealthCheck', () => {
  let wrapper;
  let pinia;
  let healthCheckStore;
  let userStore;
  let dockerStore;
  let repositoriesStore;

  beforeEach(() => {
    pinia = createTestingPinia();
    healthCheckStore = useHealthCheckStore();
    userStore = useUserStore();
    dockerStore = useDockerStore();
    repositoriesStore = useRepositoriesStore();
  });

  const createWrapper = (storeState = {}, userStoreState = {}, repositoriesStoreState = {}) => {
    repositoriesStore.$patch(repositoriesStoreState);
    healthCheckStore.$patch(storeState);
    userStore.$patch(userStoreState);

    wrapper = shallowMount(WorkflowHealthCheck, {
      global: {
        plugins: [pinia],
        stubs: {
          GlEmptyState,
          GlSprintf,
        },
      },
    });
  };

  const authenticationError = { isValidProject: true };
  const invalidProject = { isValidProject: false };
  const permissionsError = {
    isValidProject: true,
    isWorkflowEnabledForProject: false,
    healthChecks: [{ name: 'developer_access', value: true }],
  };
  const userPermissionsError = {
    isValidProject: true,
    isWorkflowEnabledForProject: false,
    healthChecks: [{ name: 'developer_access', value: false }],
  };
  const dockerError = {
    isValidProject: true,
    isWorkflowEnabledForProject: true,
    healthChecks: [],
  };
  const unknownError = {
    isValidProject: true,
    isWorkflowEnabledForProject: true,
    healthChecks: [],
  };
  const projectsWithDapAccess = {
    repositories: [
      {
        folderName: 'test-repo',
        projects: [
          {
            id: 'gid://gitlab/Project/1',
            namespaceWithPath: 'namespace/project',
            rootNamespaceId: '123',
            duoFeaturesEnabled: true,
          },
        ],
      },
    ],
  };

  const findProjectPathComponent = () => wrapper.findComponent(ProjectPath);
  const findHealthCheckItems = () => wrapper.findAllComponents(HealthCheckItem);

  describe.each`
    errorState                    | expectedTitle                               | expectedDescription                                                                                                                                                   | initialStoreState       | userStoreState                | repositoriesStoreState   | withProjectPath | isDockerReady
    ${AUTHENTICATION_ERROR}       | ${'Authentication required'}                | ${'Your GitLab authentication token is invalid, expired, or not set.'}                                                                                                | ${authenticationError}  | ${{ isAuthenticated: false }} | ${projectsWithDapAccess} | ${false}        | ${true}
    ${INVALID_GITLAB_PROJECT}     | ${'Use with a GitLab project'}              | ${'GitLab Duo Agent Platform only works with GitLab projects that belong to a group namespace.'}                                                                      | ${invalidProject}       | ${{}}                         | ${projectsWithDapAccess} | ${false}        | ${true}
    ${PERMISSIONS_ERROR}          | ${'Turn on for this project'}               | ${'Before you can use GitLab Duo Agent Platform, turn on the following settings.'}                                                                                    | ${permissionsError}     | ${{}}                         | ${projectsWithDapAccess} | ${true}         | ${true}
    ${USER_PERMISSIONS_ERROR}     | ${'Unavailable to you'}                     | ${'at least the Developer role in this project.'}                                                                                                                     | ${userPermissionsError} | ${{}}                         | ${projectsWithDapAccess} | ${true}         | ${true}
    ${DOCKER_CONFIGURATION_ERROR} | ${'Configure Docker'}                       | ${"Before you can use GitLab Duo Agent Platform, you must configure Docker. It's used to execute arbitrary code, read and write files, and make API calls to GitLab"} | ${dockerError}          | ${{}}                         | ${projectsWithDapAccess} | ${false}        | ${false}
    ${UNKNOWN_ERROR}              | ${'GitLab Duo Agent Platform is disabled.'} | ${'Unable to validate the project permissions.'}                                                                                                                      | ${unknownError}         | ${{}}                         | ${projectsWithDapAccess} | ${false}        | ${true}
  `(
    'when currentState is $errorState',
    ({
      initialStoreState,
      userStoreState,
      repositoriesStoreState,
      expectedTitle,
      expectedDescription,
      withProjectPath,
      isDockerReady,
    }) => {
      beforeEach(() => {
        createWrapper(
          {
            isWorkflowEnabledForProject: false,
            ...initialStoreState,
          },
          userStoreState,
          repositoriesStoreState,
        );
        dockerStore.status = isDockerReady
          ? DOCKER_STATES.IMAGE_PULLED
          : DOCKER_STATES.NOT_CONFIGURED;
      });

      it('renders the correct title', () => {
        expect(wrapper.find('h2').text()).toContain(expectedTitle);
      });

      it('renders the correct description', () => {
        expect(wrapper.findComponent(GlSprintf).attributes('message')).toContain(
          expectedDescription,
        );
      });

      it(`${withProjectPath ? 'renders' : 'does not render'} the project path component`, () => {
        expect(findProjectPathComponent().exists()).toBe(withProjectPath);
      });
    },

    describe('Health checks', () => {
      describe('when currentState is not permissions_error', () => {
        it.each`
          errorState                | initialStoreState
          ${INVALID_GITLAB_PROJECT} | ${invalidProject}
          ${USER_PERMISSIONS_ERROR} | ${userPermissionsError}
          ${UNKNOWN_ERROR}          | ${unknownError}
        `('it does not render the health checks on $errorState error', ({ initialStoreState }) => {
          createWrapper(initialStoreState, {}, projectsWithDapAccess);

          expect(findHealthCheckItems()).toHaveLength(0);
        });
      });

      describe('when there is a permissions_error', () => {
        beforeEach(() => {
          createWrapper(
            {
              isValidProject: true,
              isWorkflowEnabledForProject: false,
              healthChecks: [
                { name: 'developer_access', value: true, message: 'Message 1' },
                { name: 'check2', value: false, message: 'Message 2' },
              ],
            },
            {},
            projectsWithDapAccess,
          );
          dockerStore.status = DOCKER_STATES.IMAGE_PULLED;
        });

        it('renders the list of health checks', () => {
          const listItems = findHealthCheckItems();
          expect(listItems).toHaveLength(2);
        });
      });
    }),
  );

  describe('when a project has the Duo features toggle off', () => {
    beforeEach(() => {
      createWrapper(
        {
          isValidProject: true,
          isWorkflowEnabledForProject: true,
          healthChecks: [],
        },
        { isAuthenticated: true },
        {
          repositories: [
            {
              folderName: 'test-repo',
              projects: [
                {
                  id: 'gid://gitlab/Project/1',
                  namespaceWithPath: 'group/project',
                  rootNamespaceId: '123',
                  duoFeaturesEnabled: false,
                },
              ],
            },
          ],
        },
      );
      dockerStore.status = DOCKER_STATES.IMAGE_PULLED;
    });

    it('renders the agentic features disabled error', () => {
      expect(wrapper.find('h2').text()).toContain('GitLab Duo Agentic features are disabled');
    });

    it('does not show the refresh button', () => {
      const refreshButton = wrapper.find('.health-check-refresh-button');
      expect(refreshButton.exists()).toBe(false);
    });
  });

  describe('when the only project has Duo features enabled', () => {
    beforeEach(() => {
      createWrapper(
        {
          isValidProject: true,
          isWorkflowEnabledForProject: true,
          healthChecks: [],
        },
        { isAuthenticated: true },
        {
          repositories: [
            {
              folderName: 'test-repo',
              projects: [
                {
                  id: 'gid://gitlab/Project/1',
                  namespaceWithPath: 'user/project',
                  rootNamespaceId: '123',
                  duoFeaturesEnabled: true,
                },
              ],
            },
          ],
        },
      );
      dockerStore.status = DOCKER_STATES.IMAGE_PULLED;
    });

    it('does not render the agentic features disabled error', () => {
      expect(wrapper.find('h2').text()).not.toContain('GitLab Duo Agentic features are disabled');
    });
  });
});
