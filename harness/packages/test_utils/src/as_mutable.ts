type Mutable<T> = { -readonly [P in keyof T]: T[P] };

/**
 * Utility type to allow assigning values to readonly properties in tests
 * @example
 * ```typescript
 *   class Foo {
 *     readonly wow = true;
 *   }
 *   const foo = new Foo();
 *   foo.wow = false; // Error: "Attempt to assign to const or readonly variable "
 *   asMutable(foo).wow = false; // ok!
 * ```
 */
export const asMutable = <T>(value: T): Mutable<T> => value as Mutable<T>;
