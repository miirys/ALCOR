import { WebviewConnection, WebviewId, WebviewPlugin } from '@gitlab-org/webview-plugin';
import { MessageBus } from '@gitlab-org/message-bus';
import { TestLogger } from '@gitlab-org/logging';
import { WebviewConnectionProvider } from '../connection';
import { ExtensionMessageBusProvider } from '../../extension_message_bus_provider';
import { DefaultPluginManager } from './plugin_manager';
import { PluginRegistrationError } from './errors';

describe('DefaultPluginManager', () => {
  const TEST_PLUGIN_ID = 'test-plugin-id' as WebviewId;

  let pluginManager: DefaultPluginManager;

  let mockExtensionMessageBus: jest.Mocked<MessageBus>;
  let mockExtensionMessageBusProvider: jest.Mocked<ExtensionMessageBusProvider>;

  let mockWebviewConnectionProvider: jest.Mocked<WebviewConnectionProvider>;
  let mockWebviewConnection: jest.Mocked<WebviewConnection>;
  let testLogger: TestLogger;

  const createMockPlugin = (id: WebviewId = TEST_PLUGIN_ID): WebviewPlugin => ({
    id,
    title: `Plugin ${id}`,
    setup: jest.fn(),
  });

  const createPluginWithDisposable = (id: WebviewId = TEST_PLUGIN_ID) => {
    const disposable = { dispose: jest.fn() };
    const plugin = createMockPlugin(id);
    plugin.setup = jest.fn().mockReturnValue(disposable);
    return { plugin, disposable };
  };

  beforeEach(() => {
    mockExtensionMessageBus = {
      onNotification: jest.fn(),
      onRequest: jest.fn(),
      sendNotification: jest.fn(),
      sendRequest: jest.fn(),
    };

    mockExtensionMessageBusProvider = {
      getMessageBus: jest.fn().mockReturnValue(mockExtensionMessageBus),
    };

    mockWebviewConnection = {
      onInstanceConnected: jest.fn(),
      broadcast: jest.fn(),
    };

    mockWebviewConnectionProvider = {
      getConnection: jest.fn().mockReturnValue(mockWebviewConnection),
    };

    testLogger = new TestLogger();

    pluginManager = new DefaultPluginManager(
      mockWebviewConnectionProvider,
      mockExtensionMessageBusProvider,
      testLogger,
    );
  });

  describe('registerPlugin', () => {
    describe('successful registration', () => {
      it('registers a new plugin with correct context', () => {
        const plugin = createMockPlugin();
        const disposable = pluginManager.registerPlugin(plugin);

        expect(disposable).toBeDefined();
        expect(plugin.setup).toHaveBeenCalledWith({
          webview: mockWebviewConnection,
          extension: mockExtensionMessageBus,
          logger: expect.anything(),
        });
      });

      it('provides unique resources for multiple plugins', () => {
        const plugin1 = createMockPlugin('plugin1' as WebviewId);
        const plugin2 = createMockPlugin('plugin2' as WebviewId);

        pluginManager.registerPlugin(plugin1);
        pluginManager.registerPlugin(plugin2);

        expect(mockWebviewConnectionProvider.getConnection).toHaveBeenCalledWith(plugin1.id);
        expect(mockWebviewConnectionProvider.getConnection).toHaveBeenCalledWith(plugin2.id);
        expect(mockExtensionMessageBusProvider.getMessageBus).toHaveBeenCalledWith(plugin1.id);
        expect(mockExtensionMessageBusProvider.getMessageBus).toHaveBeenCalledWith(plugin2.id);
      });
    });

    describe('unsuccessful registration', () => {
      it('prevents duplicate registration', () => {
        const plugin = createMockPlugin();
        pluginManager.registerPlugin(plugin);
        expect(() => pluginManager.registerPlugin(plugin)).toThrow(PluginRegistrationError);
      });

      it('handles setup failures', () => {
        const plugin = createMockPlugin();
        const error = new Error('Setup failed');
        plugin.setup = jest.fn().mockImplementation(() => {
          throw error;
        });

        expect(() => pluginManager.registerPlugin(plugin)).toThrow(PluginRegistrationError);
      });
    });

    describe('plugin lifecycle', () => {
      describe('disposal', () => {
        it('handles plugin unregistration via disposable', () => {
          const { plugin, disposable } = createPluginWithDisposable();
          const registration = pluginManager.registerPlugin(plugin);

          registration.dispose();
          expect(disposable.dispose).toHaveBeenCalled();
        });

        it('handles plugins without setup disposables', () => {
          const plugin = createMockPlugin();
          plugin.setup = jest.fn().mockReturnValue(undefined);

          const registration = pluginManager.registerPlugin(plugin);
          expect(() => registration.dispose()).not.toThrow();
        });

        it('allows re-registration after unregistration', () => {
          const plugin = createMockPlugin();
          const registration = pluginManager.registerPlugin(plugin);
          registration.dispose();

          expect(() => pluginManager.registerPlugin(plugin)).not.toThrow();
        });
      });
    });
  });

  describe('dispose', () => {
    it('disposes all plugins on manager disposal', () => {
      const { plugin: plugin1, disposable: disposable1 } = createPluginWithDisposable(
        'plugin1' as WebviewId,
      );
      const { plugin: plugin2, disposable: disposable2 } = createPluginWithDisposable(
        'plugin2' as WebviewId,
      );

      pluginManager.registerPlugin(plugin1);
      pluginManager.registerPlugin(plugin2);

      pluginManager.dispose();

      expect(disposable1.dispose).toHaveBeenCalled();
      expect(disposable2.dispose).toHaveBeenCalled();
    });
  });
});
