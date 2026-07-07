import { NullLogger } from '@gitlab-org/logging';
import { Transport } from '@gitlab-org/webview-transport';
import {
  DefaultWebviewRuntimeMessageBus,
  WebviewRuntimeMessageBus,
} from '../messaging/webview_runtime_message_bus';
import { DefaultWebviewTransportService } from './webview_transport_service';
import { WebviewRuntimeTransportMediator } from './webview_runtime_transport_mediator';

jest.mock('./webview_runtime_transport_mediator');

describe('DefaultWebviewTransportService', () => {
  let service: DefaultWebviewTransportService;
  let mockTransport: jest.Mocked<Transport>;
  let runtimeMessageBus: WebviewRuntimeMessageBus;

  beforeEach(() => {
    mockTransport = {
      constructor: { name: 'MockTransport' },
      on: jest.fn(),
      publish: jest.fn(),
    } as unknown as jest.Mocked<Transport>;

    runtimeMessageBus = new DefaultWebviewRuntimeMessageBus();

    service = new DefaultWebviewTransportService(runtimeMessageBus, new NullLogger());
  });

  describe('registerTransport', () => {
    it('creates a mediator for the transport', () => {
      service.registerTransport(mockTransport);

      expect(WebviewRuntimeTransportMediator).toHaveBeenCalledWith(
        mockTransport,
        runtimeMessageBus,
      );
    });

    it('prevents duplicate transport registration', () => {
      // Arrange
      const mockMediator = { dispose: jest.fn() };
      (WebviewRuntimeTransportMediator as jest.Mock).mockReturnValue(mockMediator);

      // Act
      service.registerTransport(mockTransport);
      service.registerTransport(mockTransport);

      // Assert
      expect(WebviewRuntimeTransportMediator).toHaveBeenCalledTimes(1);
    });

    it('handles mediator creation errors gracefully', () => {
      const error = new Error('Mediator creation failed');
      (WebviewRuntimeTransportMediator as jest.Mock).mockImplementationOnce(() => {
        throw error;
      });

      const disposable = service.registerTransport(mockTransport);

      expect(() => disposable.dispose()).not.toThrow();
    });

    it('returns a disposable that cleans up the mediator', () => {
      const mockMediator = {
        dispose: jest.fn(),
      };
      (WebviewRuntimeTransportMediator as jest.Mock).mockReturnValue(mockMediator);

      const disposable = service.registerTransport(mockTransport);
      disposable.dispose();

      expect(mockMediator.dispose).toHaveBeenCalled();
    });

    it('manages multiple transports independently', () => {
      const mockMediator1 = { dispose: jest.fn() };
      const mockMediator2 = { dispose: jest.fn() };
      const mockTransport2 = {
        ...mockTransport,
        constructor: { name: 'MockTransport2' },
      };

      (WebviewRuntimeTransportMediator as jest.Mock)
        .mockReturnValueOnce(mockMediator1)
        .mockReturnValueOnce(mockMediator2);

      const disposable1 = service.registerTransport(mockTransport);
      service.registerTransport(mockTransport2);

      disposable1.dispose();

      expect(mockMediator1.dispose).toHaveBeenCalled();
      expect(mockMediator2.dispose).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('disposes all managed transports', () => {
      const mockMediator1 = { dispose: jest.fn() };
      const mockMediator2 = { dispose: jest.fn() };
      const mockTransport2 = {
        ...mockTransport,
        constructor: { name: 'MockTransport2' },
      };

      (WebviewRuntimeTransportMediator as jest.Mock)
        .mockReturnValueOnce(mockMediator1)
        .mockReturnValueOnce(mockMediator2);

      service.registerTransport(mockTransport);
      service.registerTransport(mockTransport2);

      service.dispose();

      expect(mockMediator1.dispose).toHaveBeenCalled();
      expect(mockMediator2.dispose).toHaveBeenCalled();
    });

    it('clears all managed transports after disposal', () => {
      const mockMediator = { dispose: jest.fn() };
      (WebviewRuntimeTransportMediator as jest.Mock).mockReturnValue(mockMediator);

      service.registerTransport(mockTransport);

      service.dispose();

      service.registerTransport(mockTransport);

      expect(WebviewRuntimeTransportMediator).toHaveBeenCalledTimes(2);
    });
  });
});
