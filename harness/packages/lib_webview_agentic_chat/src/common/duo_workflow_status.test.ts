import {
  DuoWorkflowStatus,
  isTerminated,
  isRunning,
  isApprovingPlan,
  isNeedsInput,
  isAwaitingUserInput,
  isAwaitingToolApproval,
} from '@gitlab-lsp/workflow-api';

describe('duo_workflow_status', () => {
  describe('DuoWorkflowStatus enum', () => {
    it('should have all expected status values', () => {
      expect(DuoWorkflowStatus.CREATED).toBe('CREATED');
      expect(DuoWorkflowStatus.RUNNING).toBe('RUNNING');
      expect(DuoWorkflowStatus.FINISHED).toBe('FINISHED');
      expect(DuoWorkflowStatus.FAILED).toBe('FAILED');
      expect(DuoWorkflowStatus.STOPPED).toBe('STOPPED');
      expect(DuoWorkflowStatus.INPUT_REQUIRED).toBe('INPUT_REQUIRED');
      expect(DuoWorkflowStatus.PLAN_APPROVAL).toBe('PLAN_APPROVAL_REQUIRED');
      expect(DuoWorkflowStatus.TOOL_APPROVAL).toBe('TOOL_CALL_APPROVAL_REQUIRED');
    });
  });

  describe('isTerminated', () => {
    it.each`
      status                        | expected | description
      ${DuoWorkflowStatus.FINISHED} | ${true}  | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}   | ${true}  | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}  | ${true}  | ${'STOPPED status'}
    `('should return $expected for $description', ({ status, expected }) => {
      expect(isTerminated(status)).toBe(expected);
    });

    it.each`
      status                              | expected | description
      ${DuoWorkflowStatus.CREATED}        | ${false} | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}        | ${false} | ${'RUNNING status'}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${false} | ${'INPUT_REQUIRED status'}
      ${DuoWorkflowStatus.PLAN_APPROVAL}  | ${false} | ${'PLAN_APPROVAL status'}
      ${DuoWorkflowStatus.TOOL_APPROVAL}  | ${false} | ${'TOOL_APPROVAL status'}
    `('should return $expected for $description', ({ status, expected }) => {
      expect(isTerminated(status)).toBe(expected);
    });
  });

  describe('isRunning', () => {
    it.each`
      status                              | expected | description
      ${DuoWorkflowStatus.CREATED}        | ${true}  | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}        | ${true}  | ${'RUNNING status'}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${true}  | ${'INPUT_REQUIRED status'}
      ${DuoWorkflowStatus.PLAN_APPROVAL}  | ${true}  | ${'PLAN_APPROVAL status'}
      ${DuoWorkflowStatus.TOOL_APPROVAL}  | ${true}  | ${'TOOL_APPROVAL status'}
    `('should return $expected for $description', ({ status, expected }) => {
      expect(isRunning(status)).toBe(expected);
    });

    it.each`
      status                        | expected | description
      ${DuoWorkflowStatus.FINISHED} | ${false} | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}   | ${false} | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}  | ${false} | ${'STOPPED status'}
    `('should return $expected for $description', ({ status, expected }) => {
      expect(isRunning(status)).toBe(expected);
    });
  });

  describe('isApprovingPlan', () => {
    it('should return true for PLAN_APPROVAL status', () => {
      expect(isApprovingPlan(DuoWorkflowStatus.PLAN_APPROVAL)).toBe(true);
    });

    it.each`
      status                              | description
      ${DuoWorkflowStatus.CREATED}        | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}        | ${'RUNNING status'}
      ${DuoWorkflowStatus.FINISHED}       | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}         | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}        | ${'STOPPED status'}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${'INPUT_REQUIRED status'}
      ${DuoWorkflowStatus.TOOL_APPROVAL}  | ${'TOOL_APPROVAL status'}
    `('should return false for $description', ({ status }) => {
      expect(isApprovingPlan(status)).toBe(false);
    });
  });

  describe('isNeedsInput', () => {
    it('should return true for INPUT_REQUIRED status', () => {
      expect(isNeedsInput(DuoWorkflowStatus.INPUT_REQUIRED)).toBe(true);
    });

    it.each`
      status                             | description
      ${DuoWorkflowStatus.CREATED}       | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}       | ${'RUNNING status'}
      ${DuoWorkflowStatus.FINISHED}      | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}        | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}       | ${'STOPPED status'}
      ${DuoWorkflowStatus.PLAN_APPROVAL} | ${'PLAN_APPROVAL status'}
      ${DuoWorkflowStatus.TOOL_APPROVAL} | ${'TOOL_APPROVAL status'}
    `('should return false for $description', ({ status }) => {
      expect(isNeedsInput(status)).toBe(false);
    });
  });

  describe('isAwaitingUserInput', () => {
    it.each`
      status                              | expected | description
      ${DuoWorkflowStatus.PLAN_APPROVAL}  | ${true}  | ${'PLAN_APPROVAL status'}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${true}  | ${'INPUT_REQUIRED status'}
    `('should return $expected for $description', ({ status, expected }) => {
      expect(isAwaitingUserInput(status)).toBe(expected);
    });

    it.each`
      status                             | description
      ${DuoWorkflowStatus.CREATED}       | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}       | ${'RUNNING status'}
      ${DuoWorkflowStatus.FINISHED}      | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}        | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}       | ${'STOPPED status'}
      ${DuoWorkflowStatus.TOOL_APPROVAL} | ${'TOOL_APPROVAL status'}
    `('should return false for $description', ({ status }) => {
      expect(isAwaitingUserInput(status)).toBe(false);
    });
  });

  describe('isAwaitingToolApproval', () => {
    it('should return true for TOOL_APPROVAL status', () => {
      expect(isAwaitingToolApproval(DuoWorkflowStatus.TOOL_APPROVAL)).toBe(true);
    });

    it('should return true for legacy REQUIRE_TOOL_CALL_APPROVAL string', () => {
      expect(isAwaitingToolApproval('REQUIRE_TOOL_CALL_APPROVAL' as DuoWorkflowStatus)).toBe(true);
    });

    it.each`
      status                              | description
      ${DuoWorkflowStatus.CREATED}        | ${'CREATED status'}
      ${DuoWorkflowStatus.RUNNING}        | ${'RUNNING status'}
      ${DuoWorkflowStatus.FINISHED}       | ${'FINISHED status'}
      ${DuoWorkflowStatus.FAILED}         | ${'FAILED status'}
      ${DuoWorkflowStatus.STOPPED}        | ${'STOPPED status'}
      ${DuoWorkflowStatus.INPUT_REQUIRED} | ${'INPUT_REQUIRED status'}
      ${DuoWorkflowStatus.PLAN_APPROVAL}  | ${'PLAN_APPROVAL status'}
    `('should return false for $description', ({ status }) => {
      expect(isAwaitingToolApproval(status)).toBe(false);
    });

    it('should return false for other string values', () => {
      expect(isAwaitingToolApproval('' as DuoWorkflowStatus)).toBe(false);
      expect(isAwaitingToolApproval('SOME_OTHER_STATUS' as DuoWorkflowStatus)).toBe(false);
    });
  });

  describe('function relationships', () => {
    it('should have isRunning as the inverse of isTerminated', () => {
      Object.values(DuoWorkflowStatus).forEach((status) => {
        expect(isRunning(status)).toBe(!isTerminated(status));
      });
    });

    it('should have isAwaitingUserInput return true when either isApprovingPlan or isNeedsInput is true', () => {
      Object.values(DuoWorkflowStatus).forEach((status) => {
        const expectedResult = isApprovingPlan(status) || isNeedsInput(status);
        expect(isAwaitingUserInput(status)).toBe(expectedResult);
      });
    });
  });
});
