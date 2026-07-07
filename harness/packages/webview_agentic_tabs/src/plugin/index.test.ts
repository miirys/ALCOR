import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultAgenticTabsWebviewPlugin } from './index';

describe('DefaultAgenticTabsWebviewPlugin', () => {
  let plugin: DefaultAgenticTabsWebviewPlugin;
  let mockLogger: Logger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWebview: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExtension: any;

  beforeEach(() => {
    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
    });

    mockWebview = {
      onInstanceConnected: jest.fn(),
    };

    mockExtension = {
      // Mock extension properties as needed
    };

    plugin = new DefaultAgenticTabsWebviewPlugin(mockLogger);
  });

  describe('plugin properties', () => {
    it('has correct id', () => {
      expect(plugin.id).toBe('agentic-tabs');
    });

    it('has correct title', () => {
      expect(plugin.title).toBe('GitLab Duo Agent Platform');
    });
  });

  describe('setup', () => {
    it('sets up webview instance connection handler', () => {
      plugin.setup({ webview: mockWebview, extension: mockExtension });

      expect(mockWebview.onInstanceConnected).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
