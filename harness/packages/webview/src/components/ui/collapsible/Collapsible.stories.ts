import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Button from '../button/Button.vue';
import Collapsible from './Collapsible.vue';
import CollapsibleContent from './CollapsibleContent.vue';
import CollapsibleTrigger from './CollapsibleTrigger.vue';

const meta = {
  title: 'ui/Collapsible',
  component: Collapsible,
  argTypes: {
    open: {
      control: 'boolean',
    },
    defaultOpen: {
      control: 'boolean',
    },
    disabled: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Collapsible, CollapsibleTrigger, CollapsibleContent, Button },
    setup() {
      return { args };
    },
    template: `
      <Collapsible v-bind="args" v-model:open="args.open">
        <CollapsibleTrigger as-child>
          <Button variant="outline">Toggle</Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="p-4">
            This is the collapsible content.
          </div>
        </CollapsibleContent>
      </Collapsible>
    `,
  }),
};
