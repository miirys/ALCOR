import { createPendingPromise } from './create_pending_promise';
import { PendingPromise } from './pending_promise';

describe('createPendingPromise', () => {
  let pendingPromise: PendingPromise<string>;

  beforeEach(() => {
    pendingPromise = createPendingPromise<string>();
  });

  it('should resolve the promise when resolve is called', async () => {
    const expectedValue = 'test value';
    const { promise } = pendingPromise;

    pendingPromise.resolve(expectedValue);

    expect(await promise).toBe(expectedValue);
  });

  it('should reject the promise when reject is called', async () => {
    const expectedError = new Error('test error');
    const { promise } = pendingPromise;

    pendingPromise.reject(expectedError);

    await expect(promise).rejects.toBe(expectedError);
  });

  it('should create a new promise after resolving', async () => {
    const firstValue = 'first value';
    const secondValue = 'second value';
    const { promise: promiseOne } = pendingPromise;

    pendingPromise.resolve(firstValue);
    await expect(promiseOne).resolves.toBe(firstValue);

    const { promise: promiseTwo } = pendingPromise;

    pendingPromise.reject(secondValue);
    await expect(promiseTwo).rejects.toBe(secondValue);
  });
});
