import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Badge from './Badge.vue';
import type { BadgeVariants } from './index';

const meta = {
  title: 'ui/Badge',
  component: Badge,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'secondary', 'destructive', 'outline'] as BadgeVariants['variant'][],
    },
    class: {
      control: 'text',
    },
    as: {
      control: 'text',
    },
    asChild: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Badge },
    setup() {
      return { args };
    },
    template: '<Badge v-bind="args">Badge</Badge>',
  }),
};
