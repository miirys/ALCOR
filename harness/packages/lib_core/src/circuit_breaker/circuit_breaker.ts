import { Disposable } from 'vscode-languageserver';

export const CIRCUIT_BREAK_INTERVAL_MS = 10000;
export const MAX_ERRORS_BEFORE_CIRCUIT_BREAK = 4;

export enum CircuitBreakerState {
  OPEN = 'Open',
  CLOSED = 'Closed',
}

export interface CircuitBreaker {
  error(e?: unknown): void;
  success(): void;
  isOpen(): boolean;
  onOpen(listener: () => void): Disposable;
  onClose(listener: () => void): Disposable;
}
