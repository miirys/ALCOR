import { CompositeMessageValidationService } from './composite_message_validation_service';
import { MessageValidator, MessageCollectionValidator } from './types';
import { createTestMessage } from './test_utils';

describe('CompositeMessageValidationService', () => {
  describe('validateMessages', () => {
    const testCases = {
      'no validators': {
        messages: ['method1', 'method2'],
        validators: [],
        collectionValidators: [],
        expectedValid: true,
        expectedErrors: 0,
      },
      'single validator with no errors': {
        messages: ['method1'],
        validators: [
          {
            validate: jest.fn().mockReturnValue({ errors: [], isValid: true }),
          },
        ],
        collectionValidators: [],
        expectedValid: true,
        expectedErrors: 0,
      },
      'single validator with errors': {
        messages: ['method1'],
        validators: [
          {
            validate: jest.fn().mockReturnValue({
              errors: [{ code: 'ERROR1', message: 'Error 1', messageMethod: 'method1' }],
              isValid: false,
            }),
          },
        ],
        collectionValidators: [],
        expectedValid: false,
        expectedErrors: 1,
      },
      'multiple validators with mixed results': {
        messages: ['method1'],
        validators: [
          {
            validate: jest.fn().mockReturnValue({ errors: [], isValid: true }),
          },
          {
            validate: jest.fn().mockReturnValue({
              errors: [{ code: 'ERROR1', message: 'Error 1', messageMethod: 'method1' }],
              isValid: false,
            }),
          },
        ],
        collectionValidators: [],
        expectedValid: false,
        expectedErrors: 1,
      },
      'collection validator with errors': {
        messages: ['method1', 'method2'],
        validators: [],
        collectionValidators: [
          {
            validate: jest.fn().mockReturnValue({
              errors: [
                {
                  code: 'COLLECTION_ERROR',
                  message: 'Collection Error',
                  messageMethod: 'method1',
                },
              ],
              isValid: false,
            }),
          },
        ],
        expectedValid: false,
        expectedErrors: 1,
      },
      'both types of validators with errors': {
        messages: ['method1', 'method2'],
        validators: [
          {
            validate: jest.fn().mockReturnValue({
              errors: [{ code: 'ERROR1', message: 'Error 1', messageMethod: 'method1' }],
              isValid: false,
            }),
          },
        ],
        collectionValidators: [
          {
            validate: jest.fn().mockReturnValue({
              errors: [
                {
                  code: 'COLLECTION_ERROR',
                  message: 'Collection Error',
                  messageMethod: 'method2',
                },
              ],
              isValid: false,
            }),
          },
        ],
        expectedValid: false,
        expectedErrors: 3, // 1 collection error + 2 individual errors (1 per message)
      },
    };

    Object.entries(testCases).forEach(([description, testCase]) => {
      test(`should handle ${description}`, () => {
        const service = new CompositeMessageValidationService(
          testCase.validators as MessageValidator[],
          testCase.collectionValidators as MessageCollectionValidator[],
        );

        const messages = testCase.messages.map(createTestMessage);
        const result = service.validate(messages);

        expect(result.isValid).toBe(testCase.expectedValid);
        expect(result.errors).toHaveLength(testCase.expectedErrors);

        // Verify that all validators were called appropriately
        testCase.validators.forEach((validator) => {
          expect(validator.validate).toHaveBeenCalledTimes(messages.length);
        });

        testCase.collectionValidators.forEach((validator) => {
          expect(validator.validate).toHaveBeenCalledWith(messages);
          expect(validator.validate).toHaveBeenCalledTimes(1);
        });
      });
    });

    describe('validator execution order', () => {
      test('should run collection validators before individual validators', () => {
        const executionOrder: string[] = [];

        const collectionValidator: MessageCollectionValidator = {
          validate: jest.fn().mockImplementation(() => {
            executionOrder.push('collection');
            return { errors: [], isValid: true };
          }),
        };

        const individualValidator: MessageValidator = {
          validate: jest.fn().mockImplementation(() => {
            executionOrder.push('individual');
            return { errors: [], isValid: true };
          }),
        };

        const service = new CompositeMessageValidationService(
          [individualValidator],
          [collectionValidator],
        );

        service.validate([createTestMessage('method1')]);

        expect(executionOrder[0]).toBe('collection');
        expect(executionOrder[1]).toBe('individual');
      });
    });

    describe('error accumulation', () => {
      test('should accumulate errors from all validators', () => {
        const validator1: MessageValidator = {
          validate: jest.fn().mockReturnValue({
            errors: [{ code: 'ERROR1', message: 'Error 1', messageMethod: 'method1' }],
            isValid: false,
          }),
        };

        const validator2: MessageValidator = {
          validate: jest.fn().mockReturnValue({
            errors: [{ code: 'ERROR2', message: 'Error 2', messageMethod: 'method1' }],
            isValid: false,
          }),
        };

        const collectionValidator: MessageCollectionValidator = {
          validate: jest.fn().mockReturnValue({
            errors: [{ code: 'ERROR3', message: 'Error 3', messageMethod: 'method1' }],
            isValid: false,
          }),
        };

        const service = new CompositeMessageValidationService(
          [validator1, validator2],
          [collectionValidator],
        );

        const result = service.validate([createTestMessage('method1')]);

        expect(result.errors).toHaveLength(3);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'ERROR1' }),
            expect.objectContaining({ code: 'ERROR2' }),
            expect.objectContaining({ code: 'ERROR3' }),
          ]),
        );
      });
    });
  });
});
