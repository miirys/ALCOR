import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ScrollArea from './ScrollArea.vue';

const meta = {
  title: 'ui/ScrollArea',
  component: ScrollArea,
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
  argTypes: {
    class: {
      control: 'text',
    },
    type: {
      control: 'select',
      options: ['auto', 'always', 'scroll', 'hover'],
    },
    dir: {
      control: 'select',
      options: ['ltr', 'rtl'],
    },
    scrollHideDelay: {
      control: 'number',
    },
  },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { ScrollArea },
    setup() {
      return { args };
    },
    template: `
      <ScrollArea v-bind="args" class="h-72 w-48 rounded-md border">
        <div class="p-4">
          <h4 class="mb-4 text-sm font-medium leading-none">Tags</h4>
          <div v-for="tag in 50" :key="tag" class="text-sm">
            Tag {{ tag }}
          </div>
        </div>
      </ScrollArea>
    `,
  }),
};
