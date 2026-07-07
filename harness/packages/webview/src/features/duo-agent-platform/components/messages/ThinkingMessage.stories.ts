import type { Meta, StoryObj } from '@storybook/vue3-vite';
import ThinkingMessage from './ThinkingMessage.vue';

const meta = {
  title: 'duo-agent-platform/Messages/ThinkingMessage',
  component: ThinkingMessage,
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof ThinkingMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
