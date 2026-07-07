import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from './Button.vue';
import type { ButtonVariants } from './index';

const meta = {
  title: 'ui/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: [
        'default',
        'primary',
        'destructive',
        'secondary',
        'outline',
        'ghost',
        'link',
      ] as ButtonVariants['variant'][],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg'] as ButtonVariants['size'][],
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
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Button },
    setup() {
      return { args };
    },
    template: '<Button v-bind="args">Button</Button>',
  }),
};
