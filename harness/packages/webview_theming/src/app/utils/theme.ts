import MonokaiTheme from '../themes/monokai.json';
import LightModernTheme from '../themes/light_modern.json';
import NoctisViolaTheme from '../themes/noctis_viola.json';
import SolarizedDark from '../themes/solarized_dark.json';

type Style = [string, string];
type Theme = {
  colors: Record<string, string>;
};

const LIGHT_MODERN = 'LightModern';
const MONOKAI = 'Monokai';
const NOCTIS_VIOLA = 'NoctisViola';
const SOLARIZED_DARK = 'SolarizedDark';

export const SupportedThemes = [
  { value: LIGHT_MODERN, text: 'Light Modern' },
  { value: MONOKAI, text: 'Monokai' },
  { value: NOCTIS_VIOLA, text: 'Noctis Viola' },
  { value: SOLARIZED_DARK, text: 'Solarized Dark' },
];
const vocabulary = {
  '--editor-foreground': ['editor-foreground'],
  '--editor-foreground-muted': ['disabledForeground'],
  '--editor-foreground-disabled': ['disabledForeground'],
  '--editor-background': ['editor-background'],
  '--editor-background-alternative': ['sideBar-background'],

  '--editor-heading-foreground': ['settings-headerForeground'],

  '--editor-border-color': ['widget-border', 'editorWidget-border'],

  '--editor-alert-foreground': ['sideBarTitle-foreground'],
  '--editor-alert-background': ['sideBarSectionHeader-background'],
  '--editor-alert-border-color': ['sideBarSectionHeader-border'],

  '--editor-token-foreground': ['badge-foreground'],
  '--editor-token-background': ['badge-background'],

  '--editor-icon-foreground': ['icon-foreground'],

  '--editor-textLink-foreground': ['textLink-foreground'],
  '--editor-textLink-foreground-active': ['textLink-activeForeground'],
  '--editor-textPreformat-foreground': ['textPreformat-foreground'],
  '--editor-textPreformat-background': ['textCodeBlock-background'],

  '--editor-input-border': ['input-border'],
  '--editor-input-background': ['input-background'],
  '--editor-input-foreground': ['input-foreground'],
  '--editor-input-placeholder-foreground': ['input-placeholderForeground'],
  '--editor-input-border-focus': ['focusBorder'],
  '--editor-input-background-focus': ['sideBar-background'],
  '--editor-input-foreground-focus': ['foreground'],

  '--editor-checkbox-background': ['checkbox-background'],
  '--editor-checkbox-border': ['checkbox-border'],
  '--editor-checkbox-background-selected': ['checkbox-selectBackground'],
  '--editor-checkbox-border-selected': ['checkbox-selectBorder'],

  '--editor-button-foreground': ['button-foreground'],
  '--editor-button-background': ['button-background'],
  '--editor-button-border': ['button-border'],
  '--editor-button-background-hover': ['button-hoverBackground'],

  '--editor-buttonSecondary-foreground': ['button-secondaryForeground'],
  '--editor-buttonSecondary-background': ['button-secondaryBackground'],
  '--editor-buttonSecondary-background-hover': ['button-secondaryHoverBackground'],

  '--editor-textCodeBlock-background': ['textCodeBlock-background'],
  '--editor-widget-shadow': ['widget-shadow'],
  '--editor-error-foreground': ['editorError-foreground'],

  '--editor-dropdown-background': ['dropdown-background'],
  '--editor-dropdown-foreground': ['dropdown-foreground'],
  '--editor-dropdown-border': ['dropdown-border'],

  '--editor-list-activeSelection-background': ['list-activeSelectionBackground'],
  '--editor-list-activeSelection-foreground': ['list-activeSelectionForeground'],
  '--editor-selection-background': ['editor-selectionBackground'],
  '--editor-selection-foreground': ['editor-selectionForeground'],
};

const getThemeFile = (themeName: string): Theme => {
  switch (themeName) {
    case LIGHT_MODERN:
      return LightModernTheme;
    case MONOKAI:
      return MonokaiTheme;
    case NOCTIS_VIOLA:
      return NoctisViolaTheme;
    case SOLARIZED_DARK:
      return SolarizedDark;
    default:
      throw new Error('Unknown theme name');
  }
};

const generateTheme = (themeName: string): Style[] => {
  const { colors } = getThemeFile(themeName);

  return Object.entries(vocabulary).map(([cssVar, [themeVariableName]]) => {
    const propertyName = themeVariableName.replaceAll('-', '.');
    return [cssVar, colors[propertyName]];
  });
};

export const applyTheme = (themeName: string) => {
  const styles = generateTheme(themeName);

  styles.forEach(([cssVar, value]) => {
    document.documentElement.style.setProperty(cssVar, value);
  });
};
