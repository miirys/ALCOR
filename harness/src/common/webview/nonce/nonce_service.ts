import { IncomingMessage } from 'http';
import { createInterfaceId } from '@gitlab/needle';
import { FastifyRequest } from 'fastify';

export interface NonceService {
  generateNonce(): string;
  generateCsrfToken(): string;
  verifyCsrfToken(token: string): boolean;
  verifyIncomingCsrfToken(req: FastifyRequest | IncomingMessage): boolean;
}

export const NonceService = createInterfaceId<NonceService>('NonceService');
