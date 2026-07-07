import { createTestMessage } from '../test_utils';
import { NamingConventionValidator } from './naming_convention_validator';

describe('MessageNamingConventionValidator', () => {
  let validator: NamingConventionValidator;

  beforeEach(() => {
    validator = new NamingConventionValidator();
  });

  describe('validate', () => {
    const testCases = {
      valid: {
        'basic namespace/method format': 'namespace/methodName',
        'multiple segments': 'namespace/methodName/subMethod',
        'minimum valid case': 'a/b',
        'dollar prefix with two segments': '$/namespace/methodName',
        'dollar prefix with multiple segments': '$/a/b/c',
        'very long path': 'very/long/path/with/many/segments',
        'very long path with dollar prefix': '$/very/long/path/with/many/segments',
      },
      invalidCharacters: {
        'contains hyphen': 'namespace-name/method',
        'contains underscore': 'namespace_name/method',
        'contains period': 'namespace.name/method',
        'contains numbers': 'namespace123/method',
        'contains $ in middle': 'namespace$/method',
        'contains $ at end': 'namespace/method$',
        'contains space': 'namespace name/method',
        'contains special character': 'namespace*/method',
      },
      invalidCamelCase: {
        'first segment starts with uppercase': 'Namespace/method',
        'second segment starts with uppercase': 'namespace/Method',
        'first segment after $ starts with uppercase': '$/Namespace/method',
        'segment is all uppercase': 'NAMESPACE/method',
        'last segment is all uppercase': 'namespace/METHOD',
      },
      emptySegments: {
        'empty segment in middle': 'namespace//method',
        'empty segment at start': '/namespace/method',
        'empty segment at end': 'namespace/method/',
        'multiple empty segments': '///',
        'empty segment after dollar': '$//method',
        'only dollar with slashes': '$//',
      },
    };

    describe('valid cases', () => {
      Object.entries(testCases.valid).forEach(([description, methodName]) => {
        test(`should accept ${description}: ${methodName}`, () => {
          const result = validator.validate(createTestMessage(methodName));
          expect(result.isValid).toBe(true);
          expect(result.errors).toHaveLength(0);
        });
      });
    });

    describe('invalid characters', () => {
      Object.entries(testCases.invalidCharacters).forEach(([description, methodName]) => {
        test(`should reject when ${description}: ${methodName}`, () => {
          const result = validator.validate(createTestMessage(methodName));
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              code: 'INVALID_CHARACTERS',
              methodName,
            }),
          );
        });
      });
    });

    describe('camelCase validation', () => {
      Object.entries(testCases.invalidCamelCase).forEach(([description, methodName]) => {
        test(`should reject when ${description}: ${methodName}`, () => {
          const result = validator.validate(createTestMessage(methodName));
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              code: 'INVALID_CAMEL_CASE',
              methodName,
            }),
          );
        });
      });
    });

    describe('empty segments', () => {
      Object.entries(testCases.emptySegments).forEach(([description, methodName]) => {
        test(`should reject when ${description}: ${methodName}`, () => {
          const result = validator.validate(createTestMessage(methodName));
          expect(result.isValid).toBe(false);
          expect(result.errors).toContainEqual(
            expect.objectContaining({
              code: 'EMPTY_SEGMENT',
              methodName,
            }),
          );
        });
      });
    });

    describe('multiple errors', () => {
      test('should report all validation errors for a single method name', () => {
        const methodName = 'Name-space//Method$';
        const result = validator.validate(createTestMessage(methodName));

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(4);
        expect(result.errors).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'INVALID_CHARACTERS' }),
            expect.objectContaining({ code: 'INVALID_CAMEL_CASE' }),
            expect.objectContaining({ code: 'EMPTY_SEGMENT' }),
          ]),
        );
      });
    });
  });
});
