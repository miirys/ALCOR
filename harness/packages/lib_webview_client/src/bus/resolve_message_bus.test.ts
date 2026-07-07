import { MessageBus, MessageMap } from '@gitlab-org/message-bus';
import { CONNECTION_LOST_NOTIFICATION_METHOD } from '../constants';
import { MessageBusProvider } from './provider';
import { resolveMessageBus } from './resolve_message_bus';

describe('resolveMessageBus', () => {
  const webviewId = 'test-webview-id';
  let mockMessageBus: jest.Mocked<MessageBus<MessageMap>>;
  let mockProvider1: jest.Mocked<MessageBusProvider>;
  let mockProvider2: jest.Mocked<MessageBusProvider>;

  beforeEach(() => {
    mockMessageBus = {
      onNotification: jest.fn(),
    } as unknown as jest.Mocked<MessageBus<MessageMap>>;

    mockProvider1 = {
      name: 'mock-provider-1',
      getMessageBus: jest.fn(),
    };

    mockProvider2 = {
      name: 'mock-provider-2',
      getMessageBus: jest.fn(),
    };
  });

  it('should return the bus from the first provider if available', () => {
    mockProvider1.getMessageBus.mockReturnValue(mockMessageBus);
    mockProvider2.getMessageBus.mockReturnValue(null);

    const result = resolveMessageBus({
      webviewId,
      providers: [mockProvider1, mockProvider2],
    });

    expect(result).toBe(mockMessageBus);
    expect(mockProvider1.getMessageBus).toHaveBeenCalledWith(webviewId);
    expect(mockProvider2.getMessageBus).not.toHaveBeenCalled();
  });

  it('should return the bus from the second provider if the first one is not available', () => {
    mockProvider1.getMessageBus.mockReturnValue(null);
    mockProvider2.getMessageBus.mockReturnValue(mockMessageBus);

    const result = resolveMessageBus({
      webviewId,
      providers: [mockProvider1, mockProvider2],
    });

    expect(result).toBe(mockMessageBus);
    expect(mockProvider1.getMessageBus).toHaveBeenCalledWith(webviewId);
    expect(mockProvider2.getMessageBus).toHaveBeenCalledWith(webviewId);
  });

  it('should throw an error if no providers return a bus', () => {
    mockProvider1.getMessageBus.mockReturnValue(null);
    mockProvider2.getMessageBus.mockReturnValue(null);

    expect(() =>
      resolveMessageBus({
        webviewId,
        providers: [mockProvider1, mockProvider2],
      }),
    ).toThrow(`Unable to resolve a message bus for webviewId: ${webviewId}`);

    expect(mockProvider1.getMessageBus).toHaveBeenCalledWith(webviewId);
    expect(mockProvider2.getMessageBus).toHaveBeenCalledWith(webviewId);
  });

  describe('when a provider returns a bus', () => {
    beforeEach(() => {
      mockProvider1.getMessageBus.mockReturnValue(mockMessageBus);
    });

    it('registers a no-op connectionLost handler on the resolved bus', () => {
      resolveMessageBus({
        webviewId,
        providers: [mockProvider1],
      });

      expect(mockMessageBus.onNotification).toHaveBeenCalledWith(
        CONNECTION_LOST_NOTIFICATION_METHOD,
        expect.any(Function),
      );
    });

    it('the registered connectionLost no-op handler does not throw', () => {
      resolveMessageBus({
        webviewId,
        providers: [mockProvider1],
      });

      const [, noOpHandler] = (mockMessageBus.onNotification as jest.Mock).mock.calls.find(
        ([method]: [string]) => method === CONNECTION_LOST_NOTIFICATION_METHOD,
      )!;

      expect(() => noOpHandler()).not.toThrow();
    });
  });
});
