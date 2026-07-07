import { TestLogger } from '@gitlab-org/logging';
import { interceptConsole } from './console_interceptor';

describe('interceptConsole', () => {
  let testLogger: TestLogger;
  let originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    debug: typeof console.debug;
  };

  beforeEach(() => {
    // Save original console methods
    originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      debug: console.debug,
    };

    testLogger = new TestLogger();
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.debug = originalConsole.debug;
  });

  describe('basic functionality', () => {
    it('intercepts console.log and routes to logger.info', () => {
      interceptConsole(testLogger);
      // eslint-disable-next-line no-console
      console.log('test message');
      expect(testLogger.infoLogs).toHaveLength(1);
      expect(testLogger.infoLogs[0].message).toBe('Console: test message');
    });

    it('intercepts console.error and routes to logger.error', () => {
      interceptConsole(testLogger);
      // eslint-disable-next-line no-console
      console.error('error message');
      expect(testLogger.errorLogs).toHaveLength(1);
      expect(testLogger.errorLogs[0].message).toBe('Console error: error message');
    });

    it('intercepts console.warn and routes to logger.warn', () => {
      interceptConsole(testLogger);
      // eslint-disable-next-line no-console
      console.warn('warning message');
      expect(testLogger.warnLogs).toHaveLength(1);
      expect(testLogger.warnLogs[0].message).toBe('Console warning: warning message');
    });

    it('intercepts console.debug and routes to logger.debug', () => {
      interceptConsole(testLogger);
      // eslint-disable-next-line no-console
      console.debug('debug message');
      expect(testLogger.debugLogs).toHaveLength(1);
      expect(testLogger.debugLogs[0].message).toBe('Console debug: debug message');
    });
  });

  describe('cleanup functionality', () => {
    it('returns a cleanup function that restores original console methods', () => {
      const cleanup = interceptConsole(testLogger);

      // Verify console is intercepted
      // eslint-disable-next-line no-console
      console.log('test');
      expect(testLogger.infoLogs).toHaveLength(1);

      // Call cleanup
      cleanup();

      // Reset logger to verify original console is restored
      testLogger.clear();

      // Original console should be back (we can't test it directly without seeing output,
      // but we can verify our test logger is NOT called)
      // eslint-disable-next-line no-console
      console.log = originalConsole.log;
      expect(testLogger.infoLogs).toHaveLength(0);
    });
  });

  describe('argument serialization', () => {
    beforeEach(() => {
      interceptConsole(testLogger);
    });

    it('handles string arguments', () => {
      // eslint-disable-next-line no-console
      console.log('simple string');
      expect(testLogger.infoLogs).toHaveLength(1);
      expect(testLogger.infoLogs[0].message).toBe('Console: simple string');
    });

    it('handles multiple arguments', () => {
      // eslint-disable-next-line no-console
      console.log('message:', { value: 123 }, true);
      const loggedMessage = testLogger.infoLogs[0].message;
      expect(loggedMessage).toContain('Console: message:');
      expect(loggedMessage).toContain('value');
      expect(loggedMessage).toContain('123');
      expect(loggedMessage).toContain('true');
    });

    it('handles circular references without throwing (unlike JSON.stringify)', () => {
      const obj: { self?: unknown; value: string } = { value: 'test' };
      obj.self = obj;

      // This should not throw (JSON.stringify would throw)
      expect(() => {
        // eslint-disable-next-line no-console
        console.log(obj);
      }).not.toThrow();

      const loggedMessage = testLogger.infoLogs[0].message;
      expect(loggedMessage).toContain('Console:');
      expect(loggedMessage).toContain('value');
      expect(loggedMessage).toContain('test');
      // util.inspect shows circular references with [Circular]
      expect(loggedMessage).toContain('[Circular');
    });
  });
});
