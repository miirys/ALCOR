# Writing tests

The webview package uses **Storybook** with **Vitest** integration to test Vue 3 components. Tests run in two separate projects:

- **Unit Tests**: Unit tests using Vitest with jsdom
- **Storybook Tests**: Browser-based tests using Storybook stories with Playwright

## Unit Tests (`test:unit`)

Runs unit tests for components and utilities.

- **Environment**: jsdom
- **Pattern**: `**/*.test.ts`
- **Command**: `bun run test:unit`

## Storybook Tests (`test:storybook`)

Runs tests defined within Storybook stories using the `play` function. These tests execute in a real browser environment.
For testing the user interactions, accessibility, visuals

- **Environment**: Chromium (via Playwright)
- **Pattern**: `**/*.stories.ts` with `play` functions
- **Command**: `bun run test:storybook`
- **Setup File**: `.storybook/vitest.setup.ts`

## Writing Storybook Tests

### Basic Story Structure

```typescript
import type { Meta, StoryObj } from '@storybook/vue3-vite';
import MyComponent from './MyComponent.vue';

const meta = {
  title: 'category/ComponentName',
  component: MyComponent,
} satisfies Meta<typeof MyComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: { MyComponent },
    setup() {
      return { args };
    },
    template: '<MyComponent v-bind="args" />',
  }),
};
```

### Using Decorators

Decorators wrap stories with additional setup (routing, state management, etc.):

```typescript
import piniaDecorator from '@/stories/piniaDecorator';
import vueRouterDecorator from '@/stories/vueRouterDecorator';

const meta = {
  title: 'features/MyFeature',
  component: MyComponent,
  decorators: [piniaDecorator, vueRouterDecorator(routes)],
} satisfies Meta<typeof MyComponent>;
```

#### Available Decorators

`piniaDecorator`

- To create pinia store to mock a store in stories

`vueRouterDecorator`

- To allow `<router-view>` and `<router-link>` in stories.
- Uses [Vue 3 Router](https://storybook.js.org/addons/storybook-vue3-router) integration

### Adding Play Functions (Tests)

Use the `play` function to add interaction tests:

```typescript
export const Interactive: Story = {
  render: () => ({
    components: { MyComponent },
    template: '<MyComponent />',
  }),
  play: async ({ canvas, step, userEvent }) => {
    // Test utilities from storybook/test
    const button = canvas.getByRole('button');

    await step('Click button', async () => {
      await userEvent.click(button);
      await expect(button).toHaveTextContent('Clicked');
    });
  },
};
```

### Accessibility Testing

By default, all stories run accessibility checks and configured to treat violations as errors.

To skip or mark as `todo` per story:

```typescript
const meta = {
  title: 'ui/Button',
  component: Button,
  parameters: {
    a11y: {
      test: 'todo', // Skip accessibility tests
    },
  },
} satisfies Meta<typeof Button>;
```

The motivation behind setting each story with `todo` is to work through accessibility errors progressively and without blocking the feature works.

## Resources

- [Storybook Testing Documentation](https://storybook.js.org/docs/writing-tests)
- [Storybook Vitest Addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)
