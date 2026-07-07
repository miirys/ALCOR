/**
 * Unit tests for McpServerSessionManager.
 *
 * Focused on the security-relevant behaviour that setPendingApproval() and
 * setRejected() tear down any active connection, so a revoked/rejected server
 * cannot be used via executeTool() after the state transition.
 */

import type { Logger } from '@gitlab-org/logging';
import { McpServerSessionManager } from './server_session_manager';
import { ConnectionState } from './client/connection';
import type { McpConnectionFactory } from './client';
import type { McpConnection } from './client/connection';
import type { ServerName } from './types';

// ---- helpers ----------------------------------------------------------------

function makeLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    withPrefix: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Logger>;
}

const VALID_CONFIG = {
  type: 'stdio' as const,
  command: 'node',
  args: [] as string[],
  env: {} as Record<string, string>,
  approvedTools: [] as string[],
};

function makeConnection(
  initialState: ConnectionState = ConnectionState.Connected,
): jest.Mocked<McpConnection> {
  const handlers = new Set<(state: { status: ConnectionState }) => void>();
  return {
    getStateSnapshot: jest.fn().mockReturnValue({ status: initialState }),
    getConnectedClient: jest.fn().mockReturnValue({
      andThen: jest.fn().mockReturnThis(),
      unwrapOr: jest.fn().mockReturnValue([]),
    }),
    onStateChanged: jest.fn().mockImplementation((handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    }),
    dispose: jest.fn(),
    finishAuth: jest.fn(),
  } as unknown as jest.Mocked<McpConnection>;
}

function makeConnectionFactory(connection: jest.Mocked<McpConnection>): McpConnectionFactory {
  return {
    connect: jest.fn().mockReturnValue({
      andTee: jest.fn().mockImplementation((cb) => {
        cb(connection);
        return { orTee: jest.fn().mockReturnValue({ match: jest.fn() }) };
      }),
    }),
  } as unknown as McpConnectionFactory;
}

function makeSession(
  connectionFactory: McpConnectionFactory,
  logger: Logger,
): McpServerSessionManager {
  return new McpServerSessionManager(
    'test-server' as ServerName,
    'Test Server',
    VALID_CONFIG,
    '/workspace',
    connectionFactory,
    logger,
  );
}

// ---- tests ------------------------------------------------------------------

describe('McpServerSessionManager', () => {
  describe('setPendingApproval', () => {
    it('disposes the active connection when called on a Connected session', async () => {
      const logger = makeLogger();
      const connection = makeConnection(ConnectionState.Connected);
      const factory = makeConnectionFactory(connection);
      const session = makeSession(factory, logger);

      await session.start();
      expect(connection.dispose).not.toHaveBeenCalled();

      session.setPendingApproval();

      expect(connection.dispose).toHaveBeenCalledTimes(1);
      expect(session.getState().status).toBe(ConnectionState.PendingApproval);
    });

    it('sets state to PendingApproval even when no connection is active', () => {
      const logger = makeLogger();
      const connection = makeConnection();
      const factory = makeConnectionFactory(connection);
      const session = makeSession(factory, logger);

      // No start() called — no connection established
      session.setPendingApproval();

      expect(session.getState().status).toBe(ConnectionState.PendingApproval);
    });
  });

  describe('setRejected', () => {
    it('disposes the active connection when called on a Connected session', async () => {
      const logger = makeLogger();
      const connection = makeConnection(ConnectionState.Connected);
      const factory = makeConnectionFactory(connection);
      const session = makeSession(factory, logger);

      await session.start();
      expect(connection.dispose).not.toHaveBeenCalled();

      session.setRejected();

      expect(connection.dispose).toHaveBeenCalledTimes(1);
      expect(session.getState().status).toBe(ConnectionState.Rejected);
    });

    it('sets state to Rejected even when no connection is active', () => {
      const logger = makeLogger();
      const connection = makeConnection();
      const factory = makeConnectionFactory(connection);
      const session = makeSession(factory, logger);

      session.setRejected();

      expect(session.getState().status).toBe(ConnectionState.Rejected);
    });
  });
});
