import { WebviewConnection, WebviewInstanceId, MessageMap } from '@gitlab-org/webview-plugin';
import { MessageBus } from '@gitlab-org/message-bus';
import { ThemeProvider } from '../types';
import { THEME_CHANGE_NOTIFICATION_METHOD } from '../constants';
import { setupWebviewThemeListener } from './setup_webview_theme_listener';

describe('setupWebviewThemeListener', () => {
  const mockTheme = { styles: { '--editor-background': '#ffffff' } };
  let mockThemeProvider: jest.Mocked<ThemeProvider>;
  let mockWebview: jest.Mocked<WebviewConnection>;
  let mockMessageBus: jest.Mocked<MessageBus<MessageMap>>;

  beforeEach(() => {
    mockThemeProvider = {
      getTheme: jest.fn(),
      onThemeChange: jest.fn(),
    };
    mockMessageBus = {
      sendNotification: jest.fn(),
    } as unknown as jest.Mocked<MessageBus<MessageMap>>;
    mockWebview = {
      broadcast: jest.fn(),
      onInstanceConnected: jest.fn(),
    } as unknown as jest.Mocked<WebviewConnection>;
  });

  it('should set up theme change listener', () => {
    mockThemeProvider.getTheme.mockReturnValue(mockTheme);

    setupWebviewThemeListener(mockThemeProvider, mockWebview);

    expect(mockThemeProvider.onThemeChange).toHaveBeenCalled();
  });

  it('should broadcast theme changes', () => {
    mockThemeProvider.onThemeChange.mockImplementation((callback) => {
      callback(mockTheme);
      return { dispose: jest.fn() };
    });

    setupWebviewThemeListener(mockThemeProvider, mockWebview);

    expect(mockWebview.broadcast).toHaveBeenCalledWith(THEME_CHANGE_NOTIFICATION_METHOD, mockTheme);
  });

  it('should send theme notification on instance connection', () => {
    mockThemeProvider.getTheme.mockReturnValue(mockTheme);
    mockWebview.onInstanceConnected.mockImplementation((callback) => {
      callback('instance-id' as WebviewInstanceId, mockMessageBus);
    });

    setupWebviewThemeListener(mockThemeProvider, mockWebview);

    expect(mockMessageBus.sendNotification).toHaveBeenCalledWith(
      THEME_CHANGE_NOTIFICATION_METHOD,
      mockTheme,
    );
  });
});
