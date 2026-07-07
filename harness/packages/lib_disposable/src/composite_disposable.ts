import { Disposable } from './types';

/**
 * Represents a group of Disposables that are disposed together
 */
export class CompositeDisposable implements Disposable {
  #disposables: Set<Disposable> = new Set();

  get size() {
    return this.#disposables.size;
  }

  add(...disposables: Disposable[]): void {
    for (const disposable of disposables) {
      this.#disposables.add(disposable);
    }
  }

  dispose(): void {
    for (const disposable of this.#disposables) {
      disposable.dispose();
    }
    this.#disposables.clear();
  }
}
