import { WebviewPlugin } from '@gitlab-org/webview-plugin';
import { THEMING_PREVIEW_WEBVIEW_ID } from '../../metadata';

// Plugin factory to create the GitLab UI Theming webview plugin
export const themingPluginFactory = (): WebviewPlugin => ({
  id: THEMING_PREVIEW_WEBVIEW_ID,
  title: 'Theming',
  setup: ({ webview }) => {
    // Set up inbound handlers (messages from the webview to the extension)
    webview.onInstanceConnected(() => {});
    // Return disposable for cleanup
    return {
      dispose: () => {},
    };
  },
});
