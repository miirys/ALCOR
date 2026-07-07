import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { Injectable } from '@gitlab/needle';
import { MessageValidationResult, MessageValidator } from '../types';

const ERROR_CODES = {
  INVALID_CHARACTERS: 'INVALID_CHARACTERS',
  INVALID_CAMEL_CASE: 'INVALID_CAMEL_CASE',
  EMPTY_SEGMENT: 'EMPTY_SEGMENT',
} as const;

const ALLOWED_CHARACTERS_PATTERN = /^(\$\/)?[a-zA-Z/]+$/;
const CAMEL_CASE_PATTERN = /^[a-z][a-zA-Z]*$/;
const DOLLAR_PREFIX = '$/';

@Injectable(MessageValidator, [])
export class NamingConventionValidator implements MessageValidator {
  validate(message: RpcMessageDefinition): MessageValidationResult {
    const errors: MessageValidationResult['errors'] = [
      ...this.#validateCharacters(message),
      ...this.#validateSegments(message),
    ];

    return {
      errors,
      isValid: errors.length === 0,
    };
  }

  #validateCharacters(message: RpcMessageDefinition): MessageValidationResult['errors'] {
    const errors: MessageValidationResult['errors'] = [];

    if (!ALLOWED_CHARACTERS_PATTERN.test(message.methodName)) {
      errors.push({
        code: ERROR_CODES.INVALID_CHARACTERS,
        message: `Method name contains invalid characters. Only alphabetical characters and '/' are allowed, with optional '$/' at start: ${message.methodName}`,
        methodName: message.methodName,
      });
    }

    return errors;
  }

  #validateSegments(message: RpcMessageDefinition) {
    const errors: MessageValidationResult['errors'] = [];

    const path = message.methodName.startsWith(DOLLAR_PREFIX)
      ? message.methodName.substring(DOLLAR_PREFIX.length)
      : message.methodName;

    const segments = path.split('/');

    for (const segment of segments) {
      if (!segment) {
        errors.push({
          code: ERROR_CODES.EMPTY_SEGMENT,
          message: `Empty segment in method name: ${message.methodName}`,
          methodName: message.methodName,
        });
      } else if (!CAMEL_CASE_PATTERN.test(segment)) {
        errors.push({
          code: ERROR_CODES.INVALID_CAMEL_CASE,
          message: `Path segment '${segment}' is not in camelCase format: ${message.methodName}`,
          methodName: message.methodName,
        });
      }
    }

    return errors;
  }
}
