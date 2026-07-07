import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Input from './Input.vue';

const meta = {
  title: 'ui/Input',
  component: Input,
  argTypes: {
    class: {
      control: 'text',
    },
    modelValue: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Input },
    setup() {
      return { args };
    },
    template: '<Input v-bind="args" v-model="args.modelValue" placeholder="Type something..." />',
  }),
};
