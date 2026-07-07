import { commandTimedOutMessage } from '../../../api/workflow_command_service';
import { CommandTimeoutSignal } from './command_timeout_signal';

describe('CommandTimeoutSignal', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it.each([0, -1, -100])('throws when timeoutSeconds is %s', (timeout) => {
      expect(() => new CommandTimeoutSignal(timeout)).toThrow(`Invalid timeout: ${timeout}`);
    });

    it.each([NaN, Infinity, -Infinity])('throws when timeoutSeconds is %s', (timeout) => {
      expect(() => new CommandTimeoutSignal(timeout)).toThrow(`Invalid timeout: ${timeout}`);
    });

    it('does not throw for valid positive timeout', () => {
      const signal = new CommandTimeoutSignal(5);
      signal.clear();
      expect(signal).toBeInstanceOf(CommandTimeoutSignal);
    });
  });

  describe('signal', () => {
    it('is not aborted before the timeout fires', () => {
      const commandTimeout = new CommandTimeoutSignal(10);

      expect(commandTimeout.signal.aborted).toBe(false);

      commandTimeout.clear();
    });

    describe('when the timeout elapses', () => {
      it('aborts the signal', () => {
        const commandTimeout = new CommandTimeoutSignal(5);

        jest.advanceTimersByTime(5000);

        expect(commandTimeout.signal.aborted).toBe(true);
      });

      it('aborts with an Error whose message matches commandTimedOutMessage', () => {
        const commandTimeout = new CommandTimeoutSignal(5);

        jest.advanceTimersByTime(5000);

        expect(commandTimeout.signal.reason).toBeInstanceOf(Error);
        expect((commandTimeout.signal.reason as Error).message).toBe(commandTimedOutMessage(5));
      });

      it('does not abort before the full timeout duration', () => {
        const commandTimeout = new CommandTimeoutSignal(5);

        jest.advanceTimersByTime(4999);

        expect(commandTimeout.signal.aborted).toBe(false);

        commandTimeout.clear();
      });
    });
  });

  describe('clear', () => {
    it('prevents the signal from being aborted after the timeout would have fired', () => {
      const commandTimeout = new CommandTimeoutSignal(5);

      commandTimeout.clear();
      jest.advanceTimersByTime(5000);

      expect(commandTimeout.signal.aborted).toBe(false);
    });

    it('can be called multiple times without throwing', () => {
      const commandTimeout = new CommandTimeoutSignal(5);

      expect(() => {
        commandTimeout.clear();
        commandTimeout.clear();
      }).not.toThrow();
    });
  });
});
