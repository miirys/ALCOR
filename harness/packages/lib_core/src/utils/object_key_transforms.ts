import { isPlainObject, camelCase, snakeCase } from 'lodash-es';

/**
 * Recursively transforms all object keys from snake_case to camelCase.
 * Arrays are processed recursively. Non-object values are returned as-is.
 *
 * @param obj - The object, array, or primitive value to transform
 * @returns A new object/array with transformed keys, or the original value for primitives
 */
export function deepCamelCaseKeys(obj: unknown): unknown {
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    const typedObj = obj as Record<string, unknown>;
    Object.keys(typedObj).forEach((key) => {
      result[camelCase(key)] = deepCamelCaseKeys(typedObj[key]);
    });
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCamelCaseKeys(item));
  }
  return obj;
}

/**
 * Recursively transforms all object keys from camelCase to snake_case.
 * Arrays are processed recursively. Non-object values are returned as-is.
 *
 * @param obj - The object, array, or primitive value to transform
 * @returns A new object/array with transformed keys, or the original value for primitives
 */
export function deepSnakeCaseKeys(obj: unknown): unknown {
  if (isPlainObject(obj)) {
    const result: Record<string, unknown> = {};
    const typedObj = obj as Record<string, unknown>;
    Object.keys(typedObj).forEach((key) => {
      result[snakeCase(key)] = deepSnakeCaseKeys(typedObj[key]);
    });
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepSnakeCaseKeys(item));
  }
  return obj;
}
