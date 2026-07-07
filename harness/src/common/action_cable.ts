import WebSocket from 'isomorphic-ws';
import { createCable } from '@anycable/core';
import { ensureEndsWithSlash } from '@gitlab-org/core';

export const connectToCable = async (instanceUrl: URL, websocketOptions?: object) => {
  const cableUrl = new URL('./-/cable', ensureEndsWithSlash(instanceUrl));
  cableUrl.protocol = cableUrl.protocol === 'http:' ? 'ws:' : 'wss:';

  const cable = createCable(cableUrl.href, {
    websocketImplementation: WebSocket,
    websocketOptions,
  });

  await cable.connect();
  return cable;
};
