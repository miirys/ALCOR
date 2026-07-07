import { describe, it, expect, beforeEach } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultUpdateChecker } from './update_checker';

describe('DefaultUpdateChecker', () => {
  let logger: TestLogger;
  let updateChecker: DefaultUpdateChecker;

  beforeEach(() => {
    logger = new TestLogger();
    updateChecker = new DefaultUpdateChecker(logger);
  });

  describe('checkForUpdate', () => {
    it('returns up-to-date without contacting any registry', async () => {
      const result = await updateChecker.checkForUpdate('1.0.0');

      expect(result).toEqual({
        type: 'up-to-date',
        updateInfo: {
          currentVersion: '1.0.0',
          latestVersion: '1.0.0',
          installCommand: '',
        },
      });
    });
  });
});
