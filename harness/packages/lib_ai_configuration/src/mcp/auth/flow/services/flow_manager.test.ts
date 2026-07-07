import { okAsync, errAsync, Result, ResultAsync } from 'neverthrow';
import { NullLogger } from '@gitlab-org/logging';
import type { OAuthFinalizer, ServerName } from '../../../types';
import { AuthFlowError } from '../errors';
import { DefaultMcpAuthFlowManager, DEFAULT_FLOW_TTL_MS } from './flow_manager';

function createMockFinalizer(
  implementation?: () => ResultAsync<void, unknown>,
): jest.Mocked<OAuthFinalizer> {
  return {
    finishAuth: jest.fn(implementation ?? (() => okAsync(undefined))),
  } as unknown as jest.Mocked<OAuthFinalizer>;
}

function expectAuthFlowError<T extends AuthFlowError>(
  result: Result<unknown, AuthFlowError>,
  expectedError: T,
): void {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error.code).toBe(expectedError.code);
  }
}

describe('DefaultMcpAuthFlowManager', () => {
  const serverName = 'test-server' as ServerName;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  function createManager(ttlMs = DEFAULT_FLOW_TTL_MS) {
    return new DefaultMcpAuthFlowManager(new NullLogger(), { ttlMs });
  }

  describe('finalizer registry', () => {
    test('registers and then unregisters a finalizer', async () => {
      const manager = createManager();
      const finalizer = createMockFinalizer();

      manager.registerAuthFinalizer(serverName, finalizer);
      manager.unregisterAuthFinalizer(serverName);

      const state = manager.startFlow(serverName);
      const res = await manager.completeFlow(state, 'code');

      expectAuthFlowError(res, AuthFlowError.finalizerNotFound(serverName));
    });

    test('clearFinalizers removes all registered finalizers', async () => {
      const manager = createManager();
      const finalizer = createMockFinalizer();

      manager.registerAuthFinalizer(serverName, finalizer);
      manager.clearFinalizers();

      const state = manager.startFlow(serverName);
      const res = await manager.completeFlow(state, 'code');

      expectAuthFlowError(res, AuthFlowError.finalizerNotFound(serverName));
    });
  });

  describe('startFlow', () => {
    test('generates unique state per call (even for same server)', () => {
      const manager = createManager();
      const state1 = manager.startFlow(serverName);
      const state2 = manager.startFlow(serverName);

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1).not.toBe(state2);
    });
  });

  describe('completeFlow', () => {
    describe('when state does not exist', () => {
      test('returns stateNotFound', async () => {
        const manager = createManager();

        const res = await manager.completeFlow('unknown-state', 'any-code');
        expectAuthFlowError(res, AuthFlowError.stateNotFound());
      });
    });

    describe('when finalizer is not registered', () => {
      test('returns finalizerNotFound', async () => {
        const manager = createManager();
        const state = manager.startFlow(serverName);

        const res = await manager.completeFlow(state, 'auth-code');
        expectAuthFlowError(res, AuthFlowError.finalizerNotFound(serverName));
      });
    });

    describe('when finalizer succeeds', () => {
      test('calls finalizer with code and removes state', async () => {
        const manager = createManager();
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const state = manager.startFlow(serverName);
        const res = await manager.completeFlow(state, 'auth-code-123');

        expect(res.isOk()).toBe(true);
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);
        expect(finalizer.finishAuth).toHaveBeenCalledWith('auth-code-123');
      });

      test('second completion after success returns stateNotFound and does not re-call finalizer', async () => {
        const manager = createManager();
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const state = manager.startFlow(serverName);

        const first = await manager.completeFlow(state, 'code-1');
        expect(first.isOk()).toBe(true);
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);

        const second = await manager.completeFlow(state, 'code-2');
        expectAuthFlowError(second, AuthFlowError.stateNotFound());
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);
      });
    });

    describe('when finalizer fails', () => {
      test('maps error to finalizationFailed and removes state', async () => {
        const manager = createManager();
        const cause = { reason: 'boom' };
        const failingFinalizer = createMockFinalizer(() => errAsync(cause));
        manager.registerAuthFinalizer(serverName, failingFinalizer);

        const state = manager.startFlow(serverName);
        const res = await manager.completeFlow(state, 'code');

        expectAuthFlowError(res, AuthFlowError.finalizationFailed(serverName));
        expect(failingFinalizer.finishAuth).toHaveBeenCalledTimes(1);
        expect(failingFinalizer.finishAuth).toHaveBeenCalledWith('code');

        // state should have been removed; subsequent completion returns state-not-found
        const resSecond = await manager.completeFlow(state, 'another');
        expectAuthFlowError(resSecond, AuthFlowError.stateNotFound());
      });
    });
  });

  describe('timeouts', () => {
    describe('with a registered finalizer', () => {
      test('calls finishAuth(null) once and removes state', async () => {
        const ttlMs = 1_000; // short TTL for the test
        const manager = createManager(ttlMs);
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const state = manager.startFlow(serverName);

        // advance beyond TTL to trigger timeout
        jest.advanceTimersByTime(ttlMs + 5);

        // timeout should notify with null exactly once
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);
        expect(finalizer.finishAuth).toHaveBeenCalledWith(null);

        // completing after timeout should be "state not found"
        const res = await manager.completeFlow(state, 'late-code');
        expectAuthFlowError(res, AuthFlowError.stateNotFound());
      });
    });

    describe('with no finalizer registered', () => {
      test('does not throw and simply clears state', async () => {
        const ttlMs = 1_000;
        const manager = createManager(ttlMs);

        const state = manager.startFlow(serverName);

        jest.advanceTimersByTime(ttlMs + 5);

        // no finalizer registered: completion should now be "state not found"
        const res = await manager.completeFlow(state, 'some-code');
        expectAuthFlowError(res, AuthFlowError.stateNotFound());
      });
    });

    describe('clearFlows', () => {
      test('cancels timeouts and does not call finalizers', async () => {
        const ttlMs = 1_000;
        const manager = createManager(ttlMs);
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const stateA = manager.startFlow(serverName);
        const stateB = manager.startFlow(serverName);

        manager.clearFlows();

        // Advance time; no finishAuth should be called because timers were cleared
        jest.advanceTimersByTime(ttlMs + 100);
        expect(finalizer.finishAuth).not.toHaveBeenCalled();

        // States were cleared; completing should be "state not found"
        const resA = await manager.completeFlow(stateA, 'code');
        const resB = await manager.completeFlow(stateB, 'code');
        expectAuthFlowError(resA, AuthFlowError.stateNotFound());
        expectAuthFlowError(resB, AuthFlowError.stateNotFound());
      });
    });

    describe('TTL boundary conditions', () => {
      test.each([
        ['minimum TTL', 1_000],
        ['exactly at boundary', DEFAULT_FLOW_TTL_MS],
        ['very long TTL', 60_000 * 60], // 1 hour
      ])('handles %s correctly', async (_scenario, ttl) => {
        const manager = createManager(ttl);
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const state = manager.startFlow(serverName);

        // Just before the TTL: should NOT have fired
        jest.advanceTimersByTime(ttl - 1);
        expect(finalizer.finishAuth).not.toHaveBeenCalled();

        // Cross the boundary by exactly 1ms: should fire once with null
        jest.advanceTimersByTime(1);
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);
        expect(finalizer.finishAuth).toHaveBeenCalledWith(null);

        // After timeout, completing should be "state not found"
        const res = await manager.completeFlow(state, 'late-code');
        expectAuthFlowError(res, AuthFlowError.stateNotFound());
      });

      test('clamps very small TTLs to minimum of 1000ms', async () => {
        const tinyTtl = 10; // constructor should clamp this up to 1_000ms
        const manager = createManager(tinyTtl);
        const finalizer = createMockFinalizer();
        manager.registerAuthFinalizer(serverName, finalizer);

        const state = manager.startFlow(serverName);

        // Before 1_000ms: should NOT fire because of clamping
        jest.advanceTimersByTime(999);
        expect(finalizer.finishAuth).not.toHaveBeenCalled();

        // At 1_000ms: should fire once with null
        jest.advanceTimersByTime(1);
        expect(finalizer.finishAuth).toHaveBeenCalledTimes(1);
        expect(finalizer.finishAuth).toHaveBeenCalledWith(null);

        const res = await manager.completeFlow(state, 'late-code');
        expectAuthFlowError(res, AuthFlowError.stateNotFound());
      });
    });
  });
});
