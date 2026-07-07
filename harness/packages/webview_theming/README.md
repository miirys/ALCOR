# GitLab UI Theme Testing

This package provides a visual testing environment for GitLab UI components with different editor color schemes. It allows developers to preview how GitLab UI components will look across various themes without having to switch themes in the editor.

## Purpose

This package is specifically designed for **testing color schemes only**. It focuses on visualizing how different GitLab UI components appear under various editor themes, but doesn't include comprehensive testing of all component functionalities and interactions.

## Usage

To start the theme testing environment, run the following command from the root of the repository:

```bash
bun run watch
```

This command uses the project's watch system to start the development server, which rebuilds all packages (including theming) on file changes. It syncs built packages to VS Code by default, using `yalc`.

## Adding a New Theme

To add a new theme for testing:

1. Create a new JSON file in `src/app/themes/` directory, e.g., `my_new_theme.json`
1. Use VSCode theme format, which includes a `colors` object with key-value pairs of color tokens
1. Update the `theme.ts` file in `src/app/utils/` to include your new theme:

```typescript
// Add import
import MyNewTheme from '../themes/my_new_theme.json';

// Add constant
export const MY_NEW_THEME = 'MyNewTheme';

// Add to the supported themes list
export const SupportedThemes = [
  // ... existing themes
  { value: MY_NEW_THEME, text: 'My New Theme' },
];

// Add to the getThemeFile function
export const getThemeFile = (themeName: string): Theme => {
  switch (themeName) {
    // ... existing cases
    case MY_NEW_THEME:
      return MyNewTheme;
    default:
      throw new Error('Unknown theme name');
  }
};
```

## Components Included

The theme testing page displays various GitLab UI components including (but not limited to):

- Buttons (with different variants and states)
- Links
- Icons
- Badges
- Alerts
- Modals
- Toggle switches
- Form inputs
- Tables

## Why Not Storybook?

While Storybook is excellent for comprehensive component documentation and testing, we opted for a custom lightweight page for theme testing for several reasons:

1. **Maintenance simplicity** - A dedicated page focused only on theme testing is easier to maintain alongside the extension development
1. **VS Code integration** - This approach allows easier integration with the VS Code extension development workflow
1. **Performance** - A lightweight solution loads faster and consumes fewer resources during development
1. **Focused purpose** - The page is specialized only for verifying theme compatibility without the additional overhead of Storybook's full feature set

## Development

This package consists of:

- Vue-based test application that displays GitLab UI components
- Theme application utilities that map VSCode theme colors to GitLab UI components
- Sample themes to test different color schemes

To test this page, it is recommended to execute `bun run watch`, then start the Extension host in VS Code. Then grab the URL from the GitLab Language server output channel. The watch system automatically reflects your changes to the theming preview without requiring manual refreshes.
