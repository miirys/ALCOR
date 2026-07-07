type ErrorMeta = {
  readonly timestamp?: string;
};

export type ErrorBase<Code extends string = string, Data extends object = object> = Readonly<{
  code: Code;
  message: string;
}> &
  ErrorMeta &
  Readonly<Data>;

export const createError = <Code extends string, Data extends object>(
  code: Code,
  message: string,
  data: Data,
): ErrorBase<Code, Data> => ({
  code,
  message,
  ...data,
  timestamp: new Date().toISOString(),
});
