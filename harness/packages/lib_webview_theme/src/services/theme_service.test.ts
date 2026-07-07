import { ThemeInfo } from '../types';
import { DEFAULT_DARK_THEME } from '../themes';
import { ThemeService } from './theme_service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    service = new ThemeService();
  });

  describe('constructor', () => {
    it.each([
      ['default theme', undefined, DEFAULT_DARK_THEME],
      [
        'custom theme',
        { styles: { '--editor-background': '#000000' } },
        { styles: { '--editor-background': '#000000' } },
      ],
    ])('initializes with %s', (_, initialTheme, expected) => {
      service = new ThemeService(initialTheme as ThemeInfo);
      expect(service.getTheme()).toEqual(expected);
    });
  });

  describe('getTheme', () => {
    it('returns current theme', () => {
      expect(service.getTheme()).toEqual(DEFAULT_DARK_THEME);
    });
  });

  describe('onThemeChange', () => {
    it('should call the callback immediately with the current theme', () => {
      const themeService = new ThemeService();
      const callback = jest.fn();

      themeService.onThemeChange(callback);

      expect(callback).toHaveBeenCalledWith(DEFAULT_DARK_THEME);
    });

    it('should return a disposable object', () => {
      const themeService = new ThemeService();

      const result = themeService.onThemeChange(() => {});

      expect(result).toHaveProperty('dispose');
      expect(typeof result.dispose).toBe('function');
    });
  });

  describe('publishTheme', () => {
    it('should update the current theme', () => {
      const themeService = new ThemeService();
      const newTheme: ThemeInfo = {
        styles: {
          '--editor-background': '#000000',
          '--editor-foreground': '#ffffff',
        },
      };

      themeService.publishTheme(newTheme);

      expect(themeService.getTheme()).toEqual(newTheme);
    });

    it('should notify all subscribers when the theme changes', () => {
      const themeService = new ThemeService();
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      themeService.onThemeChange(callback1);
      themeService.onThemeChange(callback2);
      const newTheme: ThemeInfo = {
        styles: {
          '--editor-background': '#000000',
          '--editor-foreground': '#ffffff',
        },
      };

      themeService.publishTheme(newTheme);

      expect(callback1).toHaveBeenCalledWith(newTheme);
      expect(callback2).toHaveBeenCalledWith(newTheme);
    });
  });
});
