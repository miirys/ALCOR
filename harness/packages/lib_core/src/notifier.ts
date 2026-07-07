export type NotifyFn<T> = (data: T) => Promise<void>;

export interface Notifier<T> {
  init(notify: NotifyFn<T>): void;
}
