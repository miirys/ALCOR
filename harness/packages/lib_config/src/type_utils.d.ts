/*
TypedGetter allows type-safe retrieval of nested properties of an object
*/
// there is no benefit in readability from formatting this type utility
// prettier-ignore
export interface TypedGetter<T> {
  (): T;
  <K1 extends keyof T>(key: `${K1 extends string ? K1 : never}`): T[K1];
  /*
   * from 2nd level down, we need to qualify the values with `NonNullable` utility.
   * without doing that, we could possibly end up with a type `never`
   * as long as any key in the string concatenation is `never`, the concatenated type becomes `never`
   * and with deep nesting, without the `NonNullable`, there could always be at lest one `never` because of optional parameters in T
   */
  <K1 extends keyof T, K2 extends keyof NonNullable<T[K1]>>(key: `${K1 extends string ? K1 : never}.${K2 extends string ? K2 : never}`): NonNullable<T[K1]>[K2] | undefined;
  <K1 extends keyof T, K2 extends keyof NonNullable<T[K1]>, K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>>(key: `${K1 extends string ? K1 : never}.${K2 extends string ? K2 : never}.${K3 extends string ? K3 : never}`): NonNullable<NonNullable<T[K1]>[K2]>[K3] | undefined;
}

/*
TypedSetter allows type-safe setting of nested properties of an object
*/
// there is no benefit in readability from formatting this type utility
// prettier-ignore
export interface TypedSetter<T> {
  <K1 extends keyof T>(key: `${K1 extends string ? K1 : never}`, value: T[K1]): void;
  /*
   * from 2nd level down, we need to qualify the values with `NonNullable` utility.
   * without doing that, we could possibly end up with a type `never`
   * as long as any key in the string concatenation is `never`, the concatenated type becomes `never`
   * and with deep nesting, without the `NonNullable`, there could always be at lest one `never` because of optional parameters in T
   */
  <K1 extends keyof T, K2 extends keyof NonNullable<T[K1]>>(key: `${K1 extends string ? K1 : never}.${K2 extends string ? K2 : never}`, value: T[K1][K2]): void;
  <K1 extends keyof T, K2 extends keyof NonNullable<T[K1]>, K3 extends keyof NonNullable<NonNullable<T[K1]>[K2]>>(key: `${K1 extends string ? K1 : never}.${K2 extends string ? K2 : never}.${K3 extends string ? K3 : never}`, value: T[K1][K2][K3]): void;
}
