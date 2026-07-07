import { createInterfaceId } from '@gitlab/needle';
import { RpcMessageDefinition } from '@gitlab-org/rpc';

export interface MessageValidationError {
  code: string;
  methodName: string;
  message: string;
}

export interface MessageValidationResult {
  isValid: boolean;
  errors: MessageValidationError[];
}

export interface MessageValidator {
  validate(message: RpcMessageDefinition): MessageValidationResult;
}

export interface MessageCollectionValidator {
  validate(messages: RpcMessageDefinition[]): MessageValidationResult;
}

export interface MessageValidationService {
  validate: (messages: RpcMessageDefinition[]) => MessageValidationResult;
}

// Interface Ids
export const MessageValidator = createInterfaceId<MessageValidator>('MessageValidator');
export const MessageCollectionValidator = createInterfaceId<MessageCollectionValidator>(
  'MessageCollectionValidator',
);
export const MessageValidationService = createInterfaceId<MessageValidationService>(
  'MessageValidationService',
);
