import { WebviewId, WebviewInstanceId } from '@gitlab-org/webview-plugin';
import { Connection, Disposable } from 'vscode-languageserver';
import { NullLogger } from '@gitlab-org/logging';
import { JsonRpcConnectionTransport } from './json_rpc_connection_transport';

describe('JsonRpcConnectionTransport', () => {
  let connection: jest.Mocked<Connection>;
  let transport: JsonRpcConnectionTransport;

  beforeEach(() => {
    connection = {
      onNotification: jest.fn().mockImplementation(() => {
        const disposable: Disposable = { dispose: jest.fn() };
        return disposable;
      }),
      sendNotification: jest.fn(),
    } as unknown as jest.Mocked<Connection>;

    transport = new JsonRpcConnectionTransport({
      connection,
      logger: new NullLogger(),
      notificationRpcMethod: '$/gitlab/webview/instance/message',
      webviewCreatedRpcMethod: '$/gitlab/webview/instance/created',
      webviewDestroyedRpcMethod: '$/gitlab/webview/instance/destroyed',
    });
  });

  const eventHandlerTestCases = [
    {
      eventType: 'webview_instance_created',
      method: '$/gitlab/webview/instance/created',
      message: { webviewId: '1', webviewInstanceId: '1' },
    },
    {
      eventType: 'webview_instance_destroyed',
      method: '$/gitlab/webview/instance/destroyed',
      message: { webviewId: '1', webviewInstanceId: '1' },
    },
    {
      eventType: 'webview_instance_notification_received',
      method: '$/gitlab/webview/instance/message',
      message: {
        webviewId: '1',
        webviewInstanceId: '1',
        type: 'example_message_type',
        payload: {},
      },
    },
  ];

  eventHandlerTestCases.forEach(({ eventType, method, message }) => {
    it(`should handle '${eventType}' notification`, () => {
      const mockCallback = jest.fn();

      transport.on(eventType as keyof (typeof transport)['on'], mockCallback);

      const notificationHandler = findNotificationHandler(connection, method);

      expect(notificationHandler).toBeDefined();
      notificationHandler?.(message);

      expect(mockCallback).toHaveBeenCalledWith(message);
    });
  });

  const publishTestCases = [
    {
      method: '$/gitlab/webview/instance/message',
      payload: {
        webviewId: '1' as WebviewId,
        webviewInstanceId: '1' as WebviewInstanceId,
        type: 'test_message',
        payload: 'test',
      },
    },
  ];

  publishTestCases.forEach(({ method, payload }) => {
    it(`should publish '${method}' notification`, async () => {
      await transport.publish('webview_instance_notification', payload);

      expect(connection.sendNotification).toHaveBeenCalledWith(method, payload);
    });
  });

  it('should dispose of all resources properly', () => {
    // Create mock disposables and add them to the connection's onNotification mock
    const mockDisposables: jest.Mocked<Disposable>[] = [];
    connection.onNotification.mockImplementation(() => {
      const disposable = {
        dispose: jest.fn(),
      };
      mockDisposables.push(disposable);
      return disposable as Disposable;
    });

    // Simulate event subscription to populate the disposables
    transport.on('webview_instance_created', jest.fn());
    transport.on('webview_instance_destroyed', jest.fn());
    transport.on('webview_instance_notification_received', jest.fn());

    // Call dispose
    transport.dispose();

    // Ensure all disposables are called
    mockDisposables.forEach((disposable) => {
      expect(disposable.dispose).toHaveBeenCalled();
    });
  });
});

function findNotificationHandler(
  connection: jest.Mocked<Connection>,
  method: string,
): ((message: unknown) => void) | undefined {
  type NotificationCall = [string, (message: unknown) => void];

  return (connection.onNotification.mock.calls as unknown as NotificationCall[]).find(
    ([notificationMethod]) => notificationMethod === method,
  )?.[1];
}
