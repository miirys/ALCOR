import { Disposable } from '@gitlab-org/disposable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handler = (...args: any) => any;

export interface HandlerRegistry<TKey, THandler extends Handler = Handler> {
  size: number;
  has(key: TKey): boolean;
  register(key: TKey, handler: THandler): Disposable;
  handle(key: TKey, ...args: Parameters<THandler>): Promise<ReturnType<THandler>>;
  dispose(): void;
}
