import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { useModelsStore } from '../../stores/modelsStore';
import PromptInput from './PromptInput.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const meta = {
  title: 'duo-agent-platform/PromptInput',
  component: PromptInput,
  decorators: [piniaDecorator],
  argTypes: {
    isLoading: {
      control: 'boolean',
    },
    canStop: {
      control: 'boolean',
    },
    modelValue: {
      control: 'text',
    },
  },
} satisfies Meta<typeof PromptInput>;

export default meta;
type Story = StoryObj<typeof meta>;

const render: Story['render'] = (args) => ({
  components: { PromptInput },
  setup() {
    return { args };
  },
  template: `
    <PromptInput
      :is-loading="args.isLoading"
      :can-stop="args.canStop"
      :model-value="args.modelValue"
      @update:modelValue="(value) => args.modelValue = value"
    />
  `,
});

export const Default: Story = {
  args: {
    isLoading: false,
    canStop: false,
    modelValue: '',
  },
  render,
};

// Run started but not yet connected: Stop is shown but disabled until a status arrives.
export const Connecting: Story = {
  args: {
    isLoading: true,
    canStop: false,
    modelValue: '',
  },
  render,
};

// Run connected and stoppable: Stop is enabled.
export const Running: Story = {
  args: {
    isLoading: true,
    canStop: true,
    modelValue: '',
  },
  render,
};

export const LoadingSelectors: Story = {
  args: {
    isLoading: false,
    modelValue: '',
  },
  render: (args) => ({
    components: { PromptInput },
    setup() {
      const store = useModelsStore();
      store.isLoading = true;

      return { args };
    },
    template: `
      <PromptInput
        :is-loading="args.isLoading"
        :model-value="args.modelValue"
        @update:modelValue="(value) => args.modelValue = value"
      />
    `,
  }),
};
