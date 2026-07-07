import { mockBunRuntime } from '@gitlab-org/test-utils';
import { isBunRuntime } from './runtime';

describe('isBunRuntime', () => {
  const setBunRuntime = mockBunRuntime();

  describe('when process.versions.bun is set', () => {
    it('returns true', () => {
      setBunRuntime(true);
      expect(isBunRuntime()).toBe(true);
    });
  });

  describe('when process.versions.bun is not set', () => {
    it('returns false', () => {
      setBunRuntime(false);
      expect(isBunRuntime()).toBe(false);
    });
  });
});
