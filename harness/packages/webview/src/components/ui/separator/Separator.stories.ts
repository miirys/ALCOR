import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Separator from './Separator.vue';

const meta = {
  title: 'ui/Separator',
  component: Separator,
  argTypes: {
    class: {
      control: 'text',
    },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
    },
    decorative: {
      control: 'boolean',
    },
    asChild: {
      control: 'boolean',
    },
  },
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Separator },
    setup() {
      return { args };
    },
    template: `
      <div>
        <div class="space-y-1">
          <h4 class="text-sm font-medium leading-none">GitLab Duo</h4>
          <p class="text-sm text-muted-foreground">AI-powered features for your workflow</p>
        </div>
        <Separator v-bind="args" class="my-4" />
        <div class="flex h-5 items-center space-x-4 text-sm">
          <div>Chat</div>
          <Separator orientation="vertical" />
          <div>Code Suggestions</div>
          <Separator orientation="vertical" />
          <div>Workflows</div>
        </div>
      </div>
    `,
  }),
};
