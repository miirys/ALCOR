import { Transport, WebviewAddress } from '@gitlab-org/webview-transport';
import { WebviewId, WebviewInstanceId } from '@gitlab-org/webview-plugin';
import { DefaultWebviewRuntimeMessageBus, WebviewRuntimeMessageBus } from '../messaging';
import { WebviewRuntimeTransportMediator } from './webview_runtime_transport_mediator';

describe('WebviewRuntimeTransportMediator', () => {
  let mediator: WebviewRuntimeTransportMediator;
  let transport: jest.Mocked<Transport>;
  let runtimeMessageBus: WebviewRuntimeMessageBus;

  const createTestAddress = (partial?: Partial<WebviewAddress>): WebviewAddress => ({
    webviewId: 'test-webview' as WebviewId,
    webviewInstanceId: 'test-instance' as WebviewInstanceId,
    ...partial,
  });

  beforeEach(() => {
    transport = {
      on: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      publish: jest.fn().mockResolvedValue(undefined),
    };

    runtimeMessageBus = new DefaultWebviewRuntimeMessageBus();
    mediator = new WebviewRuntimeTransportMediator(transport, runtimeMessageBus);
  });

  describe('transport event handling', () => {
    it('subscribes to all necessary transport events', () => {
      const expectedEvents = [
        'webview_instance_created',
        'webview_instance_destroyed',
        'webview_instance_notification_received',
        'webview_instance_request_received',
        'webview_instance_response_received',
      ];

      expectedEvents.forEach((event) => {
        expect(transport.on).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });
  });

  describe('instance lifecycle', () => {
    const testAddress = createTestAddress();

    it('handles instance creation', () => {
      const [, handler] = transport.on.mock.calls.find(
        ([event]) => event === 'webview_instance_created',
      )!;

      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      handler(testAddress);

      expect(publishSpy).toHaveBeenCalledWith('webview:connect', testAddress);
    });

    it('handles instance destruction', () => {
      const [, createHandler] = transport.on.mock.calls.find(
        ([event]) => event === 'webview_instance_created',
      )!;
      createHandler(testAddress);

      const [, destroyHandler] = transport.on.mock.calls.find(
        ([event]) => event === 'webview_instance_destroyed',
      )!;

      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');
      destroyHandler(testAddress);

      expect(publishSpy).toHaveBeenCalledWith('webview:disconnect', testAddress);
    });
  });

  describe('message routing from transport to runtime', () => {
    const testAddress = createTestAddress();
    const testMessage = {
      ...testAddress,
      type: 'text',
      payload: { data: 'test ' },
    };

    it.each([
      ['notification', 'webview_instance_notification_received', 'webview:notification'],
      ['request', 'webview_instance_request_received', 'webview:request'],
      ['response', 'webview_instance_response_received', 'webview:response'],
    ])('routes %s messages correctly', (_, transportEvent, runtimeEvent) => {
      const [, handler] = transport.on.mock.calls.find(([event]) => event === transportEvent)!;

      const publishSpy = jest.spyOn(runtimeMessageBus, 'publish');

      handler(testMessage);
      expect(publishSpy).toHaveBeenCalledWith(runtimeEvent, testMessage);
    });
  });

  describe('runtime message handling', () => {
    const testAddress = createTestAddress();
    const testMessage = {
      ...testAddress,
      type: 'test',
      payload: { data: 'test' },
    };

    beforeEach(() => {
      const [, createHandler] = transport.on.mock.calls.find(
        ([event]) => event === 'webview_instance_created',
      )!;
      createHandler(testAddress);
    });

    it.each([
      ['notification', 'plugin:notification', 'webview_instance_notification'],
      ['request', 'plugin:request', 'webview_instance_request'],
      ['response', 'plugin:response', 'webview_instance_response'],
    ])('routes %s messages correctly', async (_, runtimeEvent, transportEvent) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await runtimeMessageBus.publish(runtimeEvent as any, testMessage);

      expect(transport.publish).toHaveBeenCalledWith(transportEvent, testMessage);
    });

    it('only routes messages for managed instances', async () => {
      const unmangedMessage = {
        ...testMessage,
        webviewInstanceId: 'unmanaged' as WebviewInstanceId,
      };

      // Publish runtime message for unmanaged instance
      await runtimeMessageBus.publish('plugin:notification', unmangedMessage);

      // Verify message is not routed
      expect(transport.publish).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('disposes all subscriptions on cleanup', () => {
      const disposeSpy = jest.fn();
      transport.on.mockReturnValue({ dispose: disposeSpy });

      mediator = new WebviewRuntimeTransportMediator(transport, runtimeMessageBus);
      mediator.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });
  });
});
