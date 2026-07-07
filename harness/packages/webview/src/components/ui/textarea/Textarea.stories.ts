import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Textarea from './Textarea.vue';

const meta = {
  title: 'ui/Textarea',
  component: Textarea,
  argTypes: {
    class: {
      control: 'text',
    },
    defaultValue: {
      control: 'text',
    },
    modelValue: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Textarea },
    setup() {
      return { args };
    },
    template:
      '<Textarea v-bind="args" v-model="args.modelValue" placeholder="Type your message here..." />',
  }),
};
