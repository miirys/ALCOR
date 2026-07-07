import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { Injectable, createCollectionId } from '@gitlab/needle';
import {
  MessageCollectionValidator,
  MessageValidationError,
  MessageValidationResult,
  MessageValidationService,
  MessageValidator,
} from './types';

const MESSAGE_VALIDATORS = createCollectionId<MessageValidator>(MessageValidator);
const MESSAGE_COLLECTION_VALIDATORS = createCollectionId<MessageCollectionValidator>(
  MessageCollectionValidator,
);

@Injectable(MessageValidationService, [MESSAGE_VALIDATORS, MESSAGE_COLLECTION_VALIDATORS])
export class CompositeMessageValidationService implements MessageValidationService {
  #validators: MessageValidator[];

  #collectionValidators: MessageCollectionValidator[];

  constructor(validators: MessageValidator[], collectionValidators: MessageCollectionValidator[]) {
    this.#validators = validators;
    this.#collectionValidators = collectionValidators;
  }

  validate(messages: RpcMessageDefinition[]): MessageValidationResult {
    const errors: MessageValidationError[] = [];

    // Run collection validators
    for (const validator of this.#collectionValidators) {
      const result = validator.validate(messages);
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
    }

    // Run individual message validators
    for (const message of messages) {
      for (const validator of this.#validators) {
        const result = validator.validate(message);
        if (result.errors.length > 0) {
          errors.push(...result.errors);
        }
      }
    }

    return {
      errors,
      isValid: errors.length === 0,
    };
  }
}
