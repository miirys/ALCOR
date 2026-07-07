import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import Tooltip from './Tooltip.vue';
import TooltipContent from './TooltipContent.vue';
import TooltipProvider from './TooltipProvider.vue';
import TooltipTrigger from './TooltipTrigger.vue';

const meta = {
  title: 'ui/Tooltip',
  component: Tooltip,
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
  argTypes: {
    open: {
      control: 'boolean',
    },
    defaultOpen: {
      control: 'boolean',
    },
    delayDuration: {
      control: 'number',
    },
    disableHoverableContent: {
      control: 'boolean',
    },
    disableClosingTrigger: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
    ignoreNonKeyboardFocus: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent, Button },
    setup() {
      return { args };
    },
    template: `
      <TooltipProvider>
        <Tooltip v-bind="args" v-model="args.open">
          <TooltipTrigger as-child>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Add to library</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    `,
  }),
};
