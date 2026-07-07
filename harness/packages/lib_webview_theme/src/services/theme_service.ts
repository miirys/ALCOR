import { Disposable } from '@gitlab-org/disposable';
import { ThemeInfo, ThemeProvider, ThemePublisher, ThemeSubscriptionListener } from '../types';
import { DEFAULT_DARK_THEME } from '../themes';

export class ThemeService implements ThemeProvider, ThemePublisher {
  #currentTheme: ThemeInfo;

  #subscribers = new Set<ThemeSubscriptionListener>();

  constructor(initialTheme: ThemeInfo = DEFAULT_DARK_THEME) {
    this.#currentTheme = initialTheme;
  }

  getTheme(): ThemeInfo {
    return this.#currentTheme;
  }

  onThemeChange(callback: ThemeSubscriptionListener): Disposable {
    callback(this.#currentTheme);
    this.#subscribers.add(callback);
    return { dispose: () => this.#subscribers.delete(callback) };
  }

  publishTheme(theme: ThemeInfo): void {
    this.#currentTheme = theme;
    for (const subscriber of this.#subscribers) {
      subscriber(theme);
    }
  }
}
