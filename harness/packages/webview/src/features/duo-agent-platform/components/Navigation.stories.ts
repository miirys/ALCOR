import type { Meta, StoryObj } from '@storybook/vue3-vite';
import vueRouterDecorator from '@/stories/vueRouterDecorator';
import piniaDecorator from '@/stories/piniaDecorator';
import { duoAgentPlatformRoutes } from '../router';
import Navigation from './Navigation.vue';

const meta = {
  title: 'duo-agent-platform/Navigation',
  component: Navigation,
  decorators: [vueRouterDecorator(duoAgentPlatformRoutes), piniaDecorator],
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof Navigation>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Navigation },
    setup() {
      return { args };
    },
    template: '<Navigation />',
  }),
};
