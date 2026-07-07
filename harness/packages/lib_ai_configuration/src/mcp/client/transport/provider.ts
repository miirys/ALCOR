import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { ResultAsync } from 'neverthrow';
import { TransportError } from './error';

export interface TransportProvider {
  create(): ResultAsync<Transport, TransportError>;
}

// Helper to bind an existing factory function into a TransportProvider
export const boundProvider = (
  mk: () => ResultAsync<Transport, TransportError>,
): TransportProvider => ({
  create: mk,
});
