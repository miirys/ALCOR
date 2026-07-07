import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getDistribution } from './environment';

describe('getDistribution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('when GITLAB_DUO_DISTRIBUTION env var is set', () => {
    it('returns the env var value', () => {
      process.env.GITLAB_DUO_DISTRIBUTION = 'glab';

      expect(getDistribution()).toBe('glab');
    });
  });

  describe('when GITLAB_DUO_DISTRIBUTION env var is not set', () => {
    it('returns the bundler-injected distribution', () => {
      delete process.env.GITLAB_DUO_DISTRIBUTION;

      // BUNDLER_INJECTED_DISTRIBUTION is set to 'npm' in jest.config.js globals
      expect(getDistribution()).toBe('npm');
    });
  });
});
