import { createTestMessages } from '../test_utils';
import { DuplicateMethodValidator } from './duplicate_method_validator';

describe('DuplicateMethodValidator', () => {
  let validator: DuplicateMethodValidator;

  beforeEach(() => {
    validator = new DuplicateMethodValidator();
  });

  describe('validate', () => {
    const testCases = {
      valid: {
        'empty array': {
          messages: [],
          expectedValid: true,
        },
        'single message': {
          messages: ['method1'],
          expectedValid: true,
        },
        'multiple unique messages': {
          messages: ['method1', 'method2', 'method3'],
          expectedValid: true,
        },
        'similar but different methods': {
          messages: ['namespace/method', 'otherNamespace/method'],
          expectedValid: true,
        },
      },
      invalid: {
        'two identical methods': {
          messages: ['method1', 'method1'],
          expectedDuplicates: ['method1'],
        },
        'multiple duplicates of same method': {
          messages: ['method1', 'method1', 'method1'],
          expectedDuplicates: ['method1', 'method1'],
        },
        'different duplicates': {
          messages: ['method1', 'method2', 'method1', 'method3', 'method2'],
          expectedDuplicates: ['method1', 'method2'],
        },
        'case-sensitive duplicates': {
          messages: ['namespace/method', 'namespace/method'],
          expectedDuplicates: ['namespace/method'],
        },
      },
    };

    describe('valid cases', () => {
      Object.entries(testCases.valid).forEach(([description, testCase]) => {
        test(`should accept ${description}`, () => {
          const result = validator.validate(createTestMessages(testCase.messages));

          expect(result.isValid).toBe(testCase.expectedValid);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid cases', () => {
      Object.entries(testCases.invalid).forEach(([description, testCase]) => {
        test(`should reject ${description}`, () => {
          const result = validator.validate(createTestMessages(testCase.messages));

          expect(result.isValid).toBe(false);
          expect(result.errors).toHaveLength(testCase.expectedDuplicates.length);

          testCase.expectedDuplicates.forEach((methodName) => {
            expect(result.errors).toContainEqual(
              expect.objectContaining({
                code: 'DUPLICATE_METHOD',
                methodName,
                message: `Duplicate method name: ${methodName}`,
              }),
            );
          });
        });
      });
    });

    describe('error details', () => {
      test('should provide correct error details', () => {
        const duplicateMethod = 'namespace/method';
        const result = validator.validate(createTestMessages([duplicateMethod, duplicateMethod]));

        expect(result.errors[0]).toEqual({
          code: 'DUPLICATE_METHOD',
          methodName: duplicateMethod,
          message: `Duplicate method name: ${duplicateMethod}`,
        });
      });
    });

    describe('order preservation', () => {
      test('should detect duplicates regardless of order', () => {
        const methods = ['method1', 'method2', 'method1'];
        const reversedMethods = [...methods].reverse();

        const result1 = validator.validate(createTestMessages(methods));
        const result2 = validator.validate(createTestMessages(reversedMethods));

        expect(result1.errors).toHaveLength(1);
        expect(result2.errors).toHaveLength(1);
        expect(result1.errors[0].methodName).toBe('method1');
        expect(result2.errors[0].methodName).toBe('method1');
      });
    });
  });
});
