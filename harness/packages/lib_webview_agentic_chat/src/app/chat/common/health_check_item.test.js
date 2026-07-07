import { shallowMount } from '@vue/test-utils';
import { GlIcon, GlSprintf, GlButton } from '@gitlab/ui';
import { createTestingPinia } from '@pinia/testing';
import { useMainStore } from '../stores/main';
import HealthCheckItem from './health_check_item.vue';

describe('HealthCheckItem', () => {
  let wrapper;
  let mainStore;

  const createWrapper = (props = {}) => {
    wrapper = shallowMount(HealthCheckItem, {
      propsData: {
        item: {
          name: 'test_item',
          value: true,
          message: 'Default message',
          ...props.item,
        },
      },
      pinia: createTestingPinia(),
      stubs: {
        GlSprintf,
      },
    });

    mainStore = useMainStore();
  };

  const findIcon = () => wrapper.findComponent(GlIcon);
  const findButton = () => wrapper.findComponent(GlButton);

  describe('component rendering', () => {
    it('renders the icon', () => {
      createWrapper();
      expect(findIcon().exists()).toBe(true);
    });

    it('renders the success status when the value is true', () => {
      createWrapper({ item: { name: 'test', value: true } });
      expect(findIcon().attributes('name')).toBe('status-success');
      expect(findIcon().attributes('variant')).toBe('success');
    });

    it('renders the failed status when the value is false', () => {
      createWrapper({ item: { name: 'test', value: false } });
      expect(findIcon().attributes('name')).toBe('status-failed');
      expect(findIcon().attributes('variant')).toBe('danger');
    });
  });

  describe('message rendering', () => {
    it('renders text and link opens the correct url for feature_flag', async () => {
      createWrapper({ item: { name: 'feature_flag', value: false } });
      expect(wrapper.text()).toContain('Turn on the feature flag duo_workflow');

      await findButton().vm.$emit('click');
      expect(mainStore.openUrl).toHaveBeenCalledWith(
        'https://docs.gitlab.com/administration/feature_flags/',
      );
    });

    it('renders text and link opens the correct url for duo_features_enabled', async () => {
      createWrapper({ item: { name: 'duo_features_enabled', value: false } });
      expect(wrapper.text()).toContain('Turn on GitLab Duo');

      await findButton().vm.$emit('click');
      expect(mainStore.openUrl).toHaveBeenCalledWith(
        'https://docs.gitlab.com/ee/user/gitlab_duo/turn_on_off/',
      );
    });

    it('renders text and link opens the correct url for feature_available', async () => {
      createWrapper({ item: { name: 'feature_available', value: false } });
      expect(wrapper.text()).toContain('Turn on experimental features');

      await findButton().vm.$emit('click');
      expect(mainStore.openUrl).toHaveBeenCalledWith(
        'https://docs.gitlab.com/ee/user/gitlab_duo/turn_on_off.html#turn-on-beta-and-experimental-features',
      );
    });

    it('does not render a button link when the name is not recognized', () => {
      createWrapper({ item: { name: 'test', value: false } });
      expect(findButton().exists()).toBe(false);
    });
  });
});
