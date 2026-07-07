import { ThemeInfo } from '../types/theme';

export const DEFAULT_LIGHT_THEME: ThemeInfo = {
  styles: {
    // GLOBAL STYLES
    '--editor-font-family':
      '"GitLab Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans", Ubuntu, Cantarell, "Helvetica Neue", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
    '--editor-background': '#ffffff',
    '--editor-border': '#dcdcde',
    '--editor-foreground': '#28272d',
    '--editor-foreground--muted': '#737278',
    '--editor-foreground--disabled': '#89888d',

    // BUTTON
    '--editor-button-background': '',
    '--editor-button-foreground': '',
    '--editor-button-border': '',
    '--editor-button-border-radius': '',

    // INPUT
    '--editor-input-background': '',
    '--editor-input-foreground': '',
    '--editor-input-border': '',

    // LINK
    '--editor-link-background': '',
    '--editor-link-foreground': '',
  },
};
