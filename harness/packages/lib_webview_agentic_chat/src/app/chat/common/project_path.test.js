import { mount } from '@vue/test-utils';
import { createTestingPinia } from '@pinia/testing';
import { useMainStore } from '../stores/main';
import ProjectPath from './project_path.vue';

describe('ProjectPath', () => {
  let wrapper;
  let store;

  const createComponent = (centered = false) => {
    const pinia = createTestingPinia();
    store = useMainStore();

    wrapper = mount(ProjectPath, {
      propsData: {
        centered,
      },
      global: {
        plugins: [pinia],
        stubs: {
          GlIcon: true,
        },
      },
    });
  };

  describe('default behaviour', () => {
    beforeEach(() => {
      createComponent();
    });

    describe('when projectPath is set', () => {
      beforeEach(() => {
        store.projectPath = 'gitlab-org/gitlab';
      });

      it('renders the project path', () => {
        expect(wrapper.text()).toContain('Project: gitlab-org/gitlab');
      });
    });

    describe('when projectPath is not set', () => {
      beforeEach(() => {
        store.projectPath = null;
      });

      it('renders nothing when projectPath is not set', () => {
        expect(wrapper.html()).toBe('');
      });
    });
  });

  describe('when centered prop is true', () => {
    beforeEach(() => {
      createComponent(true);
      store.projectPath = 'gitlab-org/gitlab';
    });

    it('adds gl-justify-center class to the container', () => {
      expect(wrapper.find('.gl-justify-center').exists()).toBe(true);
    });
  });

  describe('when centered prop is false', () => {
    beforeEach(() => {
      store.projectPath = 'gitlab-org/gitlab';
      createComponent(false);
    });

    it('does not add gl-justify-center class to the container', () => {
      expect(wrapper.find('.gl-justify-center').exists()).toBe(false);
    });
  });
});
