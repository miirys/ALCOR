import { shallowMount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { GlCollapsibleListbox } from '@gitlab/ui';
import { mockWorkflowStoreEvents } from '../../test_utils/mock_workflow_store_plugin';
import { useRepositoriesStore } from '../stores/repositories';
import ProjectSelector from './project_selector.vue';

describe('ProjectSelector', () => {
  let wrapper;
  let repositoriesStore;

  const createWrapper = () => {
    wrapper = shallowMount(ProjectSelector);
  };

  beforeEach(() => {
    const pinia = createPinia();
    pinia.use(mockWorkflowStoreEvents);
    setActivePinia(pinia);

    repositoriesStore = useRepositoriesStore();
  });

  afterEach(() => {
    wrapper?.destroy();
  });

  describe('when there are multiple projects', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'multiple',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
            {
              id: '124',
              name: 'project-2',
              namespaceWithPath: 'namespace/project-2',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
      createWrapper();
    });

    it('renders the dropdown', () => {
      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(true);
    });

    it('shows all projects in dropdown', () => {
      const dropdown = wrapper.findComponent(GlCollapsibleListbox);
      expect(dropdown.props('items')).toHaveLength(1);
      expect(dropdown.props('items')[0].options).toHaveLength(2);
      expect(dropdown.props('items')[0].options[0].text).toBe('namespace/project-1');
      expect(dropdown.props('items')[0].options[1].text).toBe('namespace/project-2');
    });

    it('selects a project when clicked', async () => {
      const selectProjectSpy = jest.spyOn(repositoriesStore, 'selectProject');
      const dropdown = wrapper.findComponent(GlCollapsibleListbox);

      await dropdown.vm.$emit('select', 'namespace/project-2');

      expect(selectProjectSpy).toHaveBeenCalledWith('namespace/project-2');
    });

    it('limits width of project selector collapsible listbox', () => {
      const dropdown = wrapper.findComponent(GlCollapsibleListbox);

      expect(dropdown.props('toggleClass')).toContain('gl-max-w-26');
    });
  });

  describe('when there is only one project', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'single',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
      createWrapper();
    });

    it('renders the dropdown (single project still shows selector)', () => {
      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(true);
    });
  });

  describe('when project selector is locked', () => {
    beforeEach(() => {
      repositoriesStore.repositories = [
        {
          type: 'multiple',
          rootFsPath: '/path/to/repo',
          folderName: 'repo',
          projects: [
            {
              id: '123',
              name: 'project-1',
              namespaceWithPath: 'namespace/project-1',
              remoteName: 'origin',
              duoAgenticChatAvailable: true,
            },
            {
              id: '124',
              name: 'project-2',
              namespaceWithPath: 'namespace/project-2',
              remoteName: 'upstream',
              duoAgenticChatAvailable: true,
            },
          ],
        },
      ];
    });

    it('shows locked state with project name and remote when project is in repositories', () => {
      repositoriesStore.workflowProjectPath = 'namespace/project-2';
      createWrapper();

      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(false);
      expect(wrapper.find('[data-testid="locked-project-text"]').text()).toBe(
        'project-2 (upstream)',
      );
    });

    it('shows locked state with project name only when no remote', () => {
      repositoriesStore.repositories[0].projects[0].remoteName = '';
      repositoriesStore.workflowProjectPath = 'namespace/project-1';
      createWrapper();

      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(false);
      expect(wrapper.find('[data-testid="locked-project-text"]').text()).toBe('project-1');
    });

    it('shows locked state with full path when project is not in repositories', () => {
      repositoriesStore.workflowProjectPath = 'other-namespace/external-project';
      createWrapper();

      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(false);
      expect(wrapper.find('[data-testid="locked-project-text"]').text()).toBe(
        'other-namespace/external-project',
      );
    });

    it('does not render locked state when workflowProjectPath is empty', () => {
      repositoriesStore.workflowProjectPath = null;
      createWrapper();

      expect(wrapper.find('[data-testid="locked-project"]').exists()).toBe(false);
      expect(wrapper.findComponent(GlCollapsibleListbox).exists()).toBe(true);
    });

    describe('locked project text styling and truncation', () => {
      beforeEach(() => {
        repositoriesStore.workflowProjectPath = 'namespace/project-2';
        createWrapper();
      });

      it('truncates locked project text span', () => {
        const lockedProjectText = wrapper.find('[data-testid="locked-project-text"]');

        expect(lockedProjectText.classes()).toContain('gl-truncate');
        expect(lockedProjectText.attributes('title')).toBe('project-2 (upstream)');
        expect(wrapper.find('[data-testid="locked-project"]').classes()).toContain('gl-max-w-26');
      });
    });
  });
});
