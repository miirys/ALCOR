import type { Meta, StoryObj } from '@storybook/vue3-vite';
import NavigationMenu from './NavigationMenu.vue';
import NavigationMenuContent from './NavigationMenuContent.vue';
import NavigationMenuItem from './NavigationMenuItem.vue';
import NavigationMenuLink from './NavigationMenuLink.vue';
import NavigationMenuList from './NavigationMenuList.vue';
import NavigationMenuTrigger from './NavigationMenuTrigger.vue';

const meta = {
  title: 'ui/NavigationMenu',
  component: NavigationMenu,
  argTypes: {
    as: {
      control: 'text',
      description: 'The element or component this component should render as',
      table: {
        defaultValue: { summary: 'nav' },
        type: { summary: 'AsTag | Component' },
      },
    },
    asChild: {
      control: 'boolean',
      description: 'Change the default rendered element for the one passed as a child',
      table: {
        type: { summary: 'boolean' },
      },
    },
    modelValue: {
      control: 'text',
      description: 'The controlled value of the menu item to activate',
      table: {
        type: { summary: 'string' },
      },
    },
    defaultValue: {
      control: 'text',
      description: 'The value of the menu item that should be active when initially rendered',
      table: {
        type: { summary: 'string' },
      },
    },
    dir: {
      control: 'select',
      options: ['ltr', 'rtl'],
      description: 'The reading direction of the navigation menu',
      table: {
        type: { summary: "'ltr' | 'rtl'" },
      },
    },
    orientation: {
      control: 'select',
      options: ['horizontal', 'vertical'],
      description: 'The orientation of the menu',
      table: {
        defaultValue: { summary: 'horizontal' },
        type: { summary: "'vertical' | 'horizontal'" },
      },
    },
    delayDuration: {
      control: 'number',
      description:
        'The duration from when the pointer enters the trigger until the menu gets opened',
      table: {
        defaultValue: { summary: '200' },
        type: { summary: 'number' },
      },
    },
    skipDelayDuration: {
      control: 'number',
      description:
        'How much time a user has to enter another trigger without incurring a delay again',
      table: {
        defaultValue: { summary: '300' },
        type: { summary: 'number' },
      },
    },
    disableClickTrigger: {
      control: 'boolean',
      description: 'If true, menu cannot be opened by click on trigger',
      table: {
        defaultValue: { summary: 'false' },
        type: { summary: 'boolean' },
      },
    },
    disableHoverTrigger: {
      control: 'boolean',
      description: 'If true, menu cannot be opened by hover on trigger',
      table: {
        defaultValue: { summary: 'false' },
        type: { summary: 'boolean' },
      },
    },
    disablePointerLeaveClose: {
      control: 'boolean',
      description: 'If true, menu will not close during pointer leave event',
      table: {
        type: { summary: 'boolean' },
      },
    },
    unmountOnHide: {
      control: 'boolean',
      description: 'When true, the element will be unmounted on closed state',
      table: {
        defaultValue: { summary: 'true' },
        type: { summary: 'boolean' },
      },
    },
    viewport: {
      control: 'boolean',
      description: 'Whether to show the viewport component',
      table: {
        defaultValue: { summary: 'true' },
        type: { summary: 'boolean' },
      },
    },
  },
} satisfies Meta<typeof NavigationMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => ({
    components: {
      NavigationMenu,
      NavigationMenuList,
      NavigationMenuItem,
      NavigationMenuTrigger,
      NavigationMenuContent,
      NavigationMenuLink,
    },
    setup() {
      return { args };
    },
    template: `
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Item One</NavigationMenuTrigger>
          <NavigationMenuContent>
            <NavigationMenuLink>
            <a href="/">
                Link 1
              </a>
            </NavigationMenuLink>
            <NavigationMenuLink>
              <a href="/">
                Link 2
              </a>
            </NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink>
              <a href="/">
                Home
              </a>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
    `,
  }),
};
