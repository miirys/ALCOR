import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Label from './Label.vue';

const meta = {
  title: 'ui/Label',
  component: Label,
  argTypes: {
    class: {
      control: 'text',
    },
    for: {
      control: 'text',
    },
    asChild: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Label },
    setup() {
      return { args };
    },
    template: '<Label v-bind="args">Label Text</Label>',
  }),
};
