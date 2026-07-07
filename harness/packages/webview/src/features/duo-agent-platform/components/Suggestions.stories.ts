import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { SuggestedTask } from '../types';
import Suggestions from './Suggestions.vue';

const meta = {
  title: 'duo-agent-platform/Suggestions',
  component: Suggestions,
  parameters: {
    a11y: {
      test: 'todo',
    },
  },
} satisfies Meta<typeof Suggestions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Suggestions },
    setup() {
      const handlePopulatePrompt = (task: SuggestedTask) => {
        // eslint-disable-next-line no-alert
        alert(`Selected: ${task.title}\nPrompt: ${task.prompt}`);
      };
      return { args, handlePopulatePrompt };
    },
    template: '<Suggestions @populate-prompt="handlePopulatePrompt" />',
  }),
};
