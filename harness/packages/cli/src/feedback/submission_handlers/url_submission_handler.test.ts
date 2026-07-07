import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { WorkflowUrlOpenerService } from '@gitlab-org/ai-configuration';
import type { RuntimeContext } from '../../runtime_context';
import { UrlSubmissionHandler } from './url_submission_handler';

describe('UrlSubmissionHandler', () => {
  const logger = new TestLogger();

  const mockRuntimeContext = createFakePartial<RuntimeContext>({
    cliVersion: '1.0.0',
    envInfo: {
      distribution: 'npm',
      osPlatform: 'darwin',
      osVersion: '23.0.0',
      terminalName: 'iTerm.app',
      isKittyProtocolSupported: false,
      duoCliVersion: '1.0.0',
      environment: 'development',
    },
  });

  describe('when submitting feedback', () => {
    let openUrlMock: jest.Mock<WorkflowUrlOpenerService['openUrl']>;
    let mockUrlOpener: WorkflowUrlOpenerService;
    let handler: UrlSubmissionHandler;

    beforeEach(() => {
      openUrlMock = jest.fn<WorkflowUrlOpenerService['openUrl']>().mockResolvedValue(undefined);

      mockUrlOpener = createFakePartial<WorkflowUrlOpenerService>({
        openUrl: openUrlMock,
      });

      handler = new UrlSubmissionHandler(
        mockUrlOpener,
        mockRuntimeContext,
        logger,
        'https://gitlab.com',
        'test-org/test-project',
      );
    });

    it('returns SubmissionResult with URL method', async () => {
      const result = await handler.submit({
        title: 'Test Issue',
        description: 'Test description',
        type: 'feature',
        includeLogs: false,
        labels: ['test'],
      });

      expect(result).toEqual({
        method: 'url',
      });
      expect(openUrlMock).toHaveBeenCalled();
    });
  });
});
