import { ThemeInfo } from '../types/theme';

export const DEFAULT_DARK_THEME: ThemeInfo = {
  styles: {
    // GLOBAL STYLES
    '--editor-font-family':
      '"GitLab Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    '--editor-background': 'rgb(24, 23, 29)',
    '--editor-border': 'rgb(58, 56, 63)',
    '--editor-foreground': 'rgb(236, 236, 239)',
    '--editor-foreground--muted': 'rgb(115, 114, 120)',
    '--editor-foreground--disabled': 'rgb(137, 136, 141)',

    // BUTTON
    '--editor-button-background': 'rgb(3, 52, 100)',
    '--editor-button-foreground': 'rgb(157, 199, 241)',
    '--editor-button-border': 'rgb(76, 75, 81)',
    '--editor-button-border-radius': '4px',
    '--editor-button-background--hover': 'rgb(40, 39, 45)',
    '--editor-button-foreground--hover': 'rgb(66, 143, 220)',

    // INPUT
    '--editor-input-background': 'rgb(40, 39, 45)',
    '--editor-input-foreground': 'rgb(236, 236, 239)',
    '--editor-input-border': 'rgb(115, 114, 120)',
    '--editor-input-background--focus': 'rgb(40, 39, 45)',
    '--editor-input-foreground--focus': 'rgb(236, 236, 239)',
    '--editor-input-border--focus': 'rgb(128, 189, 255)',

    // LINK
    '--editor-link-background': 'rgba(0, 0, 0, 0)',
    '--editor-link-foreground': 'rgb(99, 166, 233)',
  },
};
