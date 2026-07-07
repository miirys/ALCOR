import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { useUsageQuotaStore } from '../stores/usageQuotaStore';
import UsageQuotaAlert from './UsageQuotaAlert.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const meta = {
  title: 'duo-agent-platform/UsageQuotaAlert',
  component: UsageQuotaAlert,
  decorators: [piniaDecorator],

  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof UsageQuotaAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Banner: Story = {
  render: () => ({
    components: { UsageQuotaAlert },
    setup() {
      const usageQuotaStore = useUsageQuotaStore();
      usageQuotaStore.usageQuotaExceeded = true;
    },
    template: '<UsageQuotaAlert/>',
  }),
};

export const Inline: Story = {
  render: () => ({
    components: { UsageQuotaAlert },
    setup() {
      const usageQuotaStore = useUsageQuotaStore();
      usageQuotaStore.usageQuotaExceeded = true;
      usageQuotaStore.usageQuotaExceededMidStream = true;
    },
    template: '<UsageQuotaAlert inline/>',
  }),
};
