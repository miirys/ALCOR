import { Token } from '../types';
import { MemoryAuthStorage } from './memory';

describe('MemoryAuthStorage', () => {
  let storage: MemoryAuthStorage<Token>;

  const validToken: Token = {
    access_token: 'test-access-token',
    token_type: 'Bearer',
    expires_at: Date.now() + 3600000,
    refresh_token: 'test-refresh-token',
  };

  beforeEach(() => {
    storage = new MemoryAuthStorage(Token, 'Token');
  });

  it('stores a valid value', async () => {
    const res = await storage.store('serverA', validToken);
    expect(res.isOk()).toBe(true);
  });

  it('fails to store an invalid value', async () => {
    // missing required access_token
    const invalid = { token_type: 'Bearer' } as unknown as Token;
    const res = await storage.store('serverA', invalid);

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe('STORAGE_VALIDATION_ERROR');
      expect(res.error.serverName).toBe('serverA');
      expect(res.error.storageType).toBe('Token');
    }
  });

  it('loads a stored value', async () => {
    await storage.store('serverA', validToken);

    const res = await storage.load('serverA');
    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.access_token).toBe('test-access-token');
    }
  });

  it('returns not found for missing value', async () => {
    const res = await storage.load('missing');
    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error.code).toBe('STORAGE_NOT_FOUND');
      expect(res.error.serverName).toBe('missing');
      expect(res.error.storageType).toBe('Token');
    }
  });

  it('clears a stored value', async () => {
    await storage.store('serverA', validToken);

    const clearRes = await storage.clear('serverA');
    expect(clearRes.isOk()).toBe(true);

    const loadRes = await storage.load('serverA');
    expect(loadRes.isErr()).toBe(true);
    if (loadRes.isErr()) {
      expect(loadRes.error.code).toBe('STORAGE_NOT_FOUND');
    }
  });
});
