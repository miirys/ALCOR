import type { Meta, StoryObj } from '@storybook/vue3-vite';
import type { EnablementCheckType } from '@gitlab-lsp/workflow-api';
import HealthCheckItem from './HealthCheckItem.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const meta = {
  title: 'duo-agent-platform/health-check/HealthCheckItem',
  component: HealthCheckItem,
  decorators: [
    piniaDecorator,
    () => ({ template: '<ul class="flex flex-col gap-3 text-left max-w-md"><story /></ul>' }),
  ],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof HealthCheckItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const check = (overrides: Partial<EnablementCheckType>): EnablementCheckType => ({
  name: 'feature_flag',
  value: false,
  message: '',
  ...overrides,
});

// Known check names render a fixed label and a docs link.
export const FeatureFlag: Story = {
  args: { item: check({ name: 'feature_flag' }) },
};

export const DuoFeaturesEnabled: Story = {
  args: { item: check({ name: 'duo_features_enabled' }) },
};

export const FeatureAvailable: Story = {
  args: { item: check({ name: 'feature_available' }) },
};

// A satisfied check shows the green tick instead of the red cross.
export const Passing: Story = {
  args: { item: check({ name: 'duo_features_enabled', value: true }) },
};

// Unknown check names fall back to the raw message with no link.
export const GenericMessage: Story = {
  args: {
    item: check({
      name: 'developer_access',
      message: 'You must have at least the Developer role in this project.',
    }),
  },
};
