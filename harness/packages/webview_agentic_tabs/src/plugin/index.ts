import {
  WebviewPlugin,
  WebviewPluginSetupParams,
  CreatePluginMessageMap,
} from '@gitlab-org/webview-plugin';
import { Logger } from '@gitlab-org/logging';
import { Injectable } from '@gitlab/needle';
import { DuoAgenticTabMessages, WEBVIEW_ID, WEBVIEW_TITLE } from '../contract';

@Injectable(WebviewPlugin, [Logger])
export class DefaultAgenticTabsWebviewPlugin implements WebviewPlugin<DuoAgenticTabMessages> {
  readonly id = WEBVIEW_ID;

  readonly title = WEBVIEW_TITLE;

  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  setup(params: WebviewPluginSetupParams<CreatePluginMessageMap<DuoAgenticTabMessages>>) {
    const { webview } = params;

    webview.onInstanceConnected(() => {
      this.#logger.debug('Duo Tabs created');
    });
  }
}
