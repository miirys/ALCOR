import { asPromise } from './abort_signal_as_promise';
import { isAbortError } from './errors/abort_error';

describe('asPromise', () => {
  describe('when signal is not already aborted', () => {
    describe('when aborted with no reason', () => {
      it('should reject with AbortError', async () => {
        const controller = new AbortController();
        const promise = asPromise(controller.signal);

        controller.abort();

        await expect(promise).rejects.toThrow('This operation was aborted');
      });
    });

    describe('when aborted with custom reason', () => {
      it('should reject with AbortError containing custom abort reason', async () => {
        const controller = new AbortController();
        const customError = new Error('Custom abort reason');
        const promise = asPromise(controller.signal);

        controller.abort(customError);

        try {
          await promise;
        } catch (error) {
          expect(isAbortError(error)).toBe(true);
          expect((error as Error).message).toBe('Custom abort reason');
        }
      });
    });
  });

  describe('when signal is already aborted', () => {
    it('should immediately reject with AbortError', async () => {
      const controller = new AbortController();
      controller.abort();

      const promise = asPromise(controller.signal);

      await expect(promise).rejects.toThrow('This operation was aborted');
    });
  });
});
