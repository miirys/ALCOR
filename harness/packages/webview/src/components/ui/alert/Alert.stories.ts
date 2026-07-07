import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Alert from './Alert.vue';
import AlertDescription from './AlertDescription.vue';
import AlertTitle from './AlertTitle.vue';
import type { AlertVariants } from './index';

const meta = {
  title: 'ui/Alert',
  component: Alert,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive'] as AlertVariants['variant'][],
    },
    class: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Alert, AlertTitle, AlertDescription },
    setup() {
      return { args };
    },
    template: `
      <Alert v-bind="args">
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>
          You can add components to your app using the cli.
        </AlertDescription>
      </Alert>
    `,
  }),
};
