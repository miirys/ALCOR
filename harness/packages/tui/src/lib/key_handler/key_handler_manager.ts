import type { UnifiedInputSystem } from '../input/unified/unified_input_system';
import type { ParsedKey } from '../input/unified/types';
import type { KeyEvent, KeyHandler } from './types';

export class KeyHandlerManager {
  #handlers: KeyHandler[] = [];

  #unsubscribe?: { dispose(): void };

  constructor(unifiedInput: UnifiedInputSystem) {
    this.#unsubscribe = unifiedInput.onKey((parsedKey) => {
      this.#handleKey(parsedKey);
    });
  }

  addHandler(handler: KeyHandler): () => void {
    this.#handlers.push(handler);

    return () => {
      this.#removeHandler(handler);
    };
  }

  #removeHandler(handler: KeyHandler): void {
    const index = this.#handlers.indexOf(handler);
    if (index !== -1) {
      this.#handlers.splice(index, 1);
    }
  }

  #handleKey(parsedKey: ParsedKey): void {
    const handlersSnapshot = [...this.#handlers];

    for (const handler of handlersSnapshot) {
      let propagationStopped = false;

      const event: KeyEvent = {
        ...parsedKey,
        stopPropagation() {
          propagationStopped = true;
        },
      };

      handler(event);

      if (propagationStopped) {
        return;
      }
    }
  }

  dispose(): void {
    this.#unsubscribe?.dispose();
    this.#unsubscribe = undefined;
    this.#handlers = [];
  }
}
