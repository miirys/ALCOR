import { callbackify } from './callbackify';

describe('callbackify', () => {
  it('should convert promise-based function to callback-based function', (done) => {
    const promiseFn = async (input: string): Promise<number> => {
      return input.length;
    };

    const callbackFn = callbackify<string, Error, number>(promiseFn);

    callbackFn('test', (error, result) => {
      expect(error).toBeNull();
      expect(result).toBe(4);
      done();
    });
  });

  it('should handle errors properly', (done) => {
    const error = new Error('Test error');
    const promiseFn = async (): Promise<number> => {
      throw error;
    };

    const callbackFn = callbackify<string, Error, number>(promiseFn);

    callbackFn('test', (err, result) => {
      expect(err).toBe(error);
      expect(result).toBeUndefined();
      done();
    });
  });
});
