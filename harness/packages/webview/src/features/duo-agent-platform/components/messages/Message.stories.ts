import type { Meta } from '@storybook/vue3-vite';
import Message from './Message.vue';
import piniaDecorator from '@/stories/piniaDecorator';

const meta = {
  title: 'duo-agent-platform/Messages',
  component: Message,
  decorators: [piniaDecorator],

  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof Message>;

export default meta;
