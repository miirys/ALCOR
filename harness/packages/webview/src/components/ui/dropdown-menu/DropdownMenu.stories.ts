import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import DropdownMenu from './DropdownMenu.vue';
import DropdownMenuContent from './DropdownMenuContent.vue';
import DropdownMenuItem from './DropdownMenuItem.vue';
import DropdownMenuTrigger from './DropdownMenuTrigger.vue';

const meta = {
  title: 'ui/DropdownMenu',
  component: DropdownMenu,
  argTypes: {
    open: {
      control: 'boolean',
    },
    defaultOpen: {
      control: 'boolean',
    },
    modal: {
      control: 'boolean',
    },
    dir: {
      control: 'select',
      options: ['ltr', 'rtl'],
    },
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: {
      DropdownMenu,
      DropdownMenuTrigger,
      DropdownMenuContent,
      DropdownMenuItem,
      Button,
    },
    setup() {
      return { args };
    },
    template: `
      <DropdownMenu v-bind="args" v-model="open">
        <DropdownMenuTrigger as-child>
          <Button variant="outline">Open Menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Item 1</DropdownMenuItem>
          <DropdownMenuItem>Item 2</DropdownMenuItem>
          <DropdownMenuItem>Item 3</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    `,
  }),
};
