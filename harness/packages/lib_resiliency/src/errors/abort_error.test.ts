import { isAbortError } from './abort_error';

describe('isAbortError', () => {
  it('should return `true` if passed object is an abort error', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(isAbortError(error)).toBe(true);
  });

  it.each([new Error('Network error'), null, undefined, { name: 'FetchError' }])(
    'should return `false` if passed object is not an abort error',
    (err) => {
      expect(isAbortError(err)).toBe(false);
    },
  );
});
