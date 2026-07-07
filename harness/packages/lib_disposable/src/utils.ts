import { Disposable } from './types';

export const isDisposable = (value: unknown): value is Disposable => {
  return (
    typeof value === 'object' &&
    value !== null &&
    'dispose' in value &&
    typeof (value as Disposable).dispose === 'function'
  );
};
