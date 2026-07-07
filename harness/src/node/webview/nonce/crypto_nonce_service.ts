import { randomBytes } from 'crypto';
import { IncomingMessage } from 'http';
import { Injectable } from '@gitlab/needle';
import { Tokens, TokensSimple } from '@fastify/csrf';
import { FastifyRequest } from 'fastify';
import { NonceService } from '@gitlab-org/legacy-common';

@Injectable(NonceService, [])
export class CryptoNonceService implements NonceService {
  #secret: string;

  #tokens: TokensSimple;

  constructor() {
    this.#tokens = new Tokens({ secretLength: 32 });
    this.#secret = this.#tokens.secretSync();
  }

  generateNonce(): string {
    return randomBytes(32).toString('base64');
  }

  generateCsrfToken(): string {
    return this.#tokens.create(this.#secret);
  }

  verifyCsrfToken(token?: string): boolean {
    return this.#tokens.verify(this.#secret, token ?? '');
  }

  verifyIncomingCsrfToken(req: FastifyRequest | IncomingMessage): boolean {
    // eslint-disable-next-line no-underscore-dangle
    let value: string | string[] | undefined = req.headers._csrf;
    if (value instanceof Array) {
      value = value[value.length - 1];
    }

    const csrfToken = value && (value as string);
    return this.verifyCsrfToken(csrfToken);
  }
}
