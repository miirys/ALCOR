import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import Popover from './Popover.vue';
import PopoverContent from './PopoverContent.vue';
import PopoverTrigger from './PopoverTrigger.vue';

const meta = {
  title: 'ui/Popover',
  component: Popover,
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
  },
} satisfies Meta<typeof Popover>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Popover, PopoverTrigger, PopoverContent, Button },
    setup() {
      return { args };
    },
    template: `
      <Popover v-bind="args" v-model="args.open">
        <PopoverTrigger as-child>
          <Button variant="outline">Open Popover</Button>
        </PopoverTrigger>
        <PopoverContent>
          <div class="p-4">
            This is the popover content.
          </div>
        </PopoverContent>
      </Popover>
    `,
  }),
};
