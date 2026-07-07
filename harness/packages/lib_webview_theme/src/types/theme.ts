/**
 * Prefix used for all webview theme keys to ensure consistency and avoid collisions.
 */
export type WebviewThemeKeyPrefix = '--editor';

/**
 * Constructs a theme key by prefixing it with the global theme prefix.
 * @template ThemeKey The main key for the theme.
 */
type PrefixedThemeKey<ThemeKey extends string> = `${WebviewThemeKeyPrefix}-${ThemeKey}`;

/**
 * Creates a fully prefixed theme key for a specific component and property.
 * @template Component The name of the component (e.g., 'button').
 * @template Key The property of the component (e.g., 'background', 'foreground').
 */
type CreateThemeKeys<
  Component extends string,
  Key extends string,
> = PrefixedThemeKey<`${Component}-${Key}`>;

/**
 * Adds a state modifier to a theme key if a state is provided. Also includes the base key.
 * @template Key The base key for the theme (e.g., 'background').
 * @template State The state to append (e.g., 'hover', 'active').
 */
type WithState<Key extends string, State extends string> = Key | `${Key}--${State}`;

/**
 * Creates all possible theme keys for a given component, property, and optional state.
 * If a state is provided, keys are created for both base properties and state-based variants.
 * @template Component The name of the component (e.g., 'button').
 * @template Property The property of the component (e.g., 'background').
 * @template State Optional state modifier (e.g., 'hover', 'active').
 */
type ComponentThemeKeys<
  Component extends string,
  Property extends string,
  State extends string | undefined = undefined,
> = State extends string
  ? CreateThemeKeys<Component, WithState<Property, State>>
  : CreateThemeKeys<Component, Property>;

// Global
type GlobalProperties =
  | 'background'
  | 'border'
  | WithState<'foreground', 'muted' | 'disabled'>
  | 'font-family';
type GlobalThemeKeys = PrefixedThemeKey<GlobalProperties>;

// Button
type ButtonComponentName = 'button';
type ButtonComponentProperties = 'background' | 'foreground' | 'border' | 'border-radius';
type ButtonComponentStates = 'hover' | 'active' | 'disabled';
type ButtonThemeKey = ComponentThemeKeys<
  ButtonComponentName,
  ButtonComponentProperties,
  ButtonComponentStates
>;

// Input
type InputComponentName = 'input';
type InputComponentProperties = 'background' | 'foreground' | 'border';
type InputComponentStates = 'focus';
type InputThemeKeys = ComponentThemeKeys<
  InputComponentName,
  InputComponentProperties,
  InputComponentStates
>;

// Link
type LinkComponentName = 'link';
type LinkComponentProperties = 'foreground' | 'background';
type LinkThemeKeys = ComponentThemeKeys<LinkComponentName, LinkComponentProperties>;

// TextCodeBlock
type TextCodeBlockComponentName = 'textCodeBlock';
type TextCodeBlockComponentProperties = 'background';
type TextCodeBlockThemeKeys = ComponentThemeKeys<
  TextCodeBlockComponentName,
  TextCodeBlockComponentProperties
>;

export type ThemeKeys =
  | GlobalThemeKeys
  | ButtonThemeKey
  | InputThemeKeys
  | LinkThemeKeys
  | TextCodeBlockThemeKeys;
export type ThemeInfo = {
  styles: Partial<Record<ThemeKeys, string>>;
};

export const isThemeInfo = (theme: unknown): theme is ThemeInfo =>
  typeof theme === 'object' && theme !== null && 'styles' in theme;
