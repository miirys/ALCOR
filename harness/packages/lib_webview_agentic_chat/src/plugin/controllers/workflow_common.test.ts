/* eslint-disable @typescript-eslint/no-explicit-any */
import { WorkflowRunner, UsageQuotaService } from '@gitlab-lsp/workflow-api';

import { NullLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { initWorkflowCommonController } from './workflow_common';

let workflowApiMock: any;
let usageQuotaServiceMock: any;

describe('WorkflowCommonController', () => {
  let workflowCommonController: any;
  const logger = new NullLogger();

  beforeEach(() => {
    workflowApiMock = {
      getProjectPath: jest.fn().mockReturnValue('gitlab-org/gitlab'),
      isExecutorPrepared: jest.fn(),
      prepareExecutor: jest.fn(),
    } as unknown as jest.Mocked<WorkflowRunner>;

    usageQuotaServiceMock = createFakePartial<UsageQuotaService>({
      checkUsageCreditsExceeded: jest.fn(),
    });

    workflowCommonController = initWorkflowCommonController(
      workflowApiMock,
      logger,
      usageQuotaServiceMock,
    );
  });

  describe('getProjectPath', () => {
    beforeEach(() => {
      workflowApiMock.getProjectPath.mockReturnValue('test-project');
    });

    it('should return the project path', async () => {
      expect(await workflowCommonController.getProjectPath()).toEqual({
        eventName: 'setProjectPath',
        data: 'test-project',
      });
    });
  });

  describe('checkUsageQuota', () => {
    it('should return quota exceeded when service returns true', async () => {
      jest.mocked(usageQuotaServiceMock.checkUsageCreditsExceeded).mockResolvedValue(true);

      const result = await workflowCommonController.checkUsageQuota({
        rootNamespaceId: 'gid://gitlab/Group/123',
        workflowDefinition: 'chat',
      });

      expect(usageQuotaServiceMock.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        'gid://gitlab/Group/123',
        'chat',
        undefined,
      );
      expect(result).toEqual({
        eventName: 'setUsageQuotaExceeded',
        data: { exceeded: true },
      });
    });

    it('should return quota not exceeded when service returns false', async () => {
      jest.mocked(usageQuotaServiceMock.checkUsageCreditsExceeded).mockResolvedValue(false);

      const result = await workflowCommonController.checkUsageQuota({
        rootNamespaceId: 'gid://gitlab/Group/123',
        workflowDefinition: 'software_development',
      });

      expect(usageQuotaServiceMock.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        'gid://gitlab/Group/123',
        'software_development',
        undefined,
      );
      expect(result).toEqual({
        eventName: 'setUsageQuotaExceeded',
        data: { exceeded: false },
      });
    });

    it('should pass workflowDefinition when provided without rootNamespaceId', async () => {
      jest.mocked(usageQuotaServiceMock.checkUsageCreditsExceeded).mockResolvedValue(false);

      const result = await workflowCommonController.checkUsageQuota({
        workflowDefinition: 'test_agent/v1',
      });

      expect(usageQuotaServiceMock.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        undefined,
        'test_agent/v1',
        undefined,
      );
      expect(result).toEqual({
        eventName: 'setUsageQuotaExceeded',
        data: { exceeded: false },
      });
    });

    it('should handle missing rootNamespaceId gracefully', async () => {
      jest.mocked(usageQuotaServiceMock.checkUsageCreditsExceeded).mockResolvedValue(false);

      const result = await workflowCommonController.checkUsageQuota({});

      expect(usageQuotaServiceMock.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual({
        eventName: 'setUsageQuotaExceeded',
        data: { exceeded: false },
      });
    });

    it('should handle no payload gracefully', async () => {
      jest.mocked(usageQuotaServiceMock.checkUsageCreditsExceeded).mockResolvedValue(false);

      const result = await workflowCommonController.checkUsageQuota();

      expect(usageQuotaServiceMock.checkUsageCreditsExceeded).toHaveBeenCalledWith(
        expect.any(AbortSignal),
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual({
        eventName: 'setUsageQuotaExceeded',
        data: { exceeded: false },
      });
    });
  });

  describe('logToOutputChannel', () => {
    it.each`
      level
      ${'info'}
      ${'warn'}
      ${'error'}
    `(
      'should log the message with the correct level',
      ({ level }: { level: 'info' | 'warn' | 'error' }) => {
        const spy = jest.spyOn(logger, level);
        const result = workflowCommonController.logToOutputChannel({
          message: 'test message',
          level,
        });
        expect(result).toBe('noreply');
        expect(spy).toHaveBeenCalledWith('[Duo Workflow Plugin] test message');
        expect(logger[level]).toHaveBeenCalled();
      },
    );
  });
});
