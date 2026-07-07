import type { MergeDeep, PartialDeep } from 'type-fest';
import type { MessageDefinitions, MessageMap } from './bus';

/**
 * Utility type to create message definitions.
 */
export type CreateMessageDefinitions<T extends PartialDeep<MessageDefinitions> | undefined> = {
  notifications: T extends { notifications: infer M } ? MergeDeep<{}, M> : {};
  requests: T extends { requests: infer M } ? MergeDeep<{}, M> : {};
};

/**
 * Utility type to create a message map.
 */
export type CreateMessageMap<T extends PartialDeep<MessageMap>> = MessageMap<
  CreateMessageDefinitions<T['inbound']>,
  CreateMessageDefinitions<T['outbound']>
>;
