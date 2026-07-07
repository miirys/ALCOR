import type { Meta, StoryObj } from '@storybook/vue3-vite';
import Card from './Card.vue';
import CardContent from './CardContent.vue';
import CardDescription from './CardDescription.vue';
import CardHeader from './CardHeader.vue';
import CardTitle from './CardTitle.vue';

const meta = {
  title: 'ui/Card',
  component: Card,
  argTypes: {
    class: {
      control: 'text',
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { Card, CardHeader, CardTitle, CardDescription, CardContent },
    setup() {
      return { args };
    },
    template: `
      <Card v-bind="args">
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Card Content</p>
        </CardContent>
      </Card>
    `,
  }),
};
