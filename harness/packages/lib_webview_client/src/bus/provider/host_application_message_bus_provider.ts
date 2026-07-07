import { MessageBus, MessageMap } from '@gitlab-org/message-bus';
import { HostConfig } from '../../types';
import { MessageBusProvider } from './types';

const isHostConfig = <T extends MessageMap>(val: unknown): val is HostConfig<T> => {
  if (!val || typeof val !== 'object') {
    return false;
  }

  return Boolean('host' in val && val.host);
};

export class HostApplicationMessageBusProvider implements MessageBusProvider {
  readonly name = 'HostApplicationMessageBusProvider';

  getMessageBus<TMessages extends MessageMap>(): MessageBus<TMessages> | null {
    return 'gitlab' in window && isHostConfig<TMessages>(window.gitlab) ? window.gitlab.host : null;
  }
}
