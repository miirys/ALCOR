import { createInterfaceId } from '@gitlab/needle';
import { Disposable } from '@gitlab-org/disposable';
import { ThemeInfo } from './theme';

export interface ThemeSubscriptionListener {
  (theme: ThemeInfo): void;
}

export interface ThemeProvider {
  getTheme(): ThemeInfo;
  onThemeChange(callback: ThemeSubscriptionListener): Disposable;
}
export const ThemeProvider = createInterfaceId<ThemeProvider>('ThemeProvider');
