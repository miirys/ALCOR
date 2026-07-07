import { Logger } from '@gitlab-org/logging';
import { ThemePublisher } from '../types';
import { DefaultThemeNotificationHandler } from './theme_notification_handler';

describe('DefaultThemeNotificationHandler', () => {
  let mockThemePublisher: jest.Mocked<ThemePublisher>;
  let mockLogger: jest.Mocked<Logger>;
  let handler: DefaultThemeNotificationHandler;

  beforeEach(() => {
    mockThemePublisher = { publishTheme: jest.fn() };
    mockLogger = { error: jest.fn() } as unknown as jest.Mocked<Logger>;
    handler = new DefaultThemeNotificationHandler(mockThemePublisher, mockLogger);
  });

  describe('handleThemeChange', () => {
    it('publishes theme when valid theme info is received', () => {
      const validThemeInfo = { styles: { '--gl-background': '#ffffff' } };

      handler.handleThemeChange(validThemeInfo);

      expect(mockThemePublisher.publishTheme).toHaveBeenCalledWith(validThemeInfo);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('logs error when invalid theme info is received', () => {
      const invalidThemeInfo = { invalidKey: 'invalidValue' };

      handler.handleThemeChange(invalidThemeInfo);

      expect(mockThemePublisher.publishTheme).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid theme info format'),
      );
    });
  });
});
