import { Logger } from '@gitlab-org/logging';
import { Transport } from '@gitlab-org/webview-transport';

export const createMockLogger = (): jest.Mocked<Logger> => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  withContext: jest.fn(),
});

export const createMockTransport = (): jest.Mocked<Transport> => ({
  publish: jest.fn(),
  on: jest.fn(),
});
