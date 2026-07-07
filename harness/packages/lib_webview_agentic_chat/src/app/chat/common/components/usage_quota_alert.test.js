import { shallowMount } from '@vue/test-utils';
import { GlAlert } from '@gitlab/ui';
import { createPinia, setActivePinia } from 'pinia';
import { useUsageQuotaStore } from '../../stores/usage_quota';
import UsageQuotaAlert from './usage_quota_alert.vue';

describe('UsageQuotaAlert', () => {
  let wrapper;
  let usageQuotaStore;

  const createWrapper = ({ usageQuotaExceeded = false, inline = false }) => {
    setActivePinia(createPinia());
    usageQuotaStore = useUsageQuotaStore();
    usageQuotaStore.checkUsageQuota = jest.fn();

    wrapper = shallowMount(UsageQuotaAlert, {
      propsData: {
        usageQuotaExceeded,
        inline,
      },
    });
  };

  const findAlert = () => wrapper.findComponent(GlAlert);

  describe('when usageQuotaExceeded is false', () => {
    beforeEach(() => {
      createWrapper({ usageQuotaExceeded: false });
    });

    it('does not render the alert', () => {
      expect(findAlert().exists()).toBe(false);
    });
  });

  describe('when usageQuotaExceeded is true', () => {
    beforeEach(() => {
      createWrapper({ usageQuotaExceeded: true });
    });

    it('renders the alert', () => {
      expect(findAlert().exists()).toBe(true);
    });

    it('renders with correct title', () => {
      expect(findAlert().props('title')).toBe('No credits remain for this billing period.');
    });

    it('renders with info variant', () => {
      expect(findAlert().props('variant')).toBe('info');
    });

    it('is not dismissible', () => {
      expect(findAlert().props('dismissible')).toBe(false);
    });

    it('renders the correct message text', () => {
      const alertText = wrapper.text();
      expect(alertText).toContain(
        'Contact your administrator for more credits, or switch to Non-Agentic Chat to continue.',
      );
      expect(alertText).toContain('When you have more credits, refresh.');
    });

    it('renders with primary button text', () => {
      expect(findAlert().props('primaryButtonText')).toBe('Refresh');
    });

    it('calls checkUsageQuota when primary button is clicked', async () => {
      await findAlert().vm.$emit('primaryAction');
      expect(usageQuotaStore.checkUsageQuota).toHaveBeenCalled();
    });

    it('should not have transparent background by default', () => {
      createWrapper({ usageQuotaExceeded: true });
      expect(findAlert().classes()).not.toContain('gl-bg-transparent');
    });

    describe('inline alert', () => {
      it('should get transparent background when "inline=true"', () => {
        createWrapper({ usageQuotaExceeded: true, inline: true });
        expect(findAlert().classes()).toContain('gl-bg-transparent');
      });
    });
  });
});
