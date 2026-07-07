import { EventEmitter } from 'events';
import { jest } from '@jest/globals';

/**
 * A mock implementation of a Node.js ChildProcess object, useful for testing.
 * Allows emitting mock events to stdout, stderr
 */
export class MockChildProcess extends EventEmitter {
  stdout: EventEmitter;

  stderr: EventEmitter;

  kill: jest.MockedFunction<(signal?: NodeJS.Signals | number) => boolean>;

  unref: jest.MockedFunction<() => void>;

  ref: jest.MockedFunction<() => void>;

  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.kill = jest.fn<(signal?: NodeJS.Signals | number) => boolean>().mockReturnValue(true);
    this.unref = jest.fn<() => void>();
    this.ref = jest.fn<() => void>();
  }
}
