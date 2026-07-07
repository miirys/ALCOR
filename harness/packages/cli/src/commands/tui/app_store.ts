import { defaultAppState, type AppState } from '@gitlab-org/tui';

export class AppStore {
  #state: AppState;

  #setState?: (state: AppState) => void;

  constructor() {
    this.#state = {
      ...defaultAppState,
    };
  }

  initialize(setState: (state: AppState) => void): void {
    this.#setState = setState;
  }

  getState(): AppState {
    return this.#state;
  }

  setState(newState: AppState): void {
    this.#state = newState;
    if (!this.#setState) {
      throw new Error('AppStore is not initialized');
    }
    this.#setState(this.#state);
  }
}
