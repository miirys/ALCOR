import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
  PLAN_AGENT_PRIVILEGES,
  WorkflowRunner,
} from '@gitlab-lsp/workflow-api';
import { WorkflowAgentPrivileges } from './workflow_agent_privileges';

describe('WorkflowAgentPrivileges', () => {
  let updateAgentPrivileges: jest.MockedFunction<WorkflowRunner['updateAgentPrivileges']>;
  let runner: Pick<WorkflowRunner, 'updateAgentPrivileges'>;

  beforeEach(() => {
    updateAgentPrivileges = jest
      .fn<WorkflowRunner['updateAgentPrivileges']>()
      .mockResolvedValue([]);
    runner = createFakePartial<WorkflowRunner>({ updateAgentPrivileges });
  });

  const create = (preApprove: boolean) => new WorkflowAgentPrivileges(runner, preApprove);

  it('maps build (default) to the full set and plan to the read-only set', () => {
    const privileges = create(true);

    expect(privileges.privilegesForMode(undefined)).toEqual(
      HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
    );
    expect(privileges.privilegesForMode('build')).toEqual(
      HEADLESS_CLI_PRE_APPROVED_AGENT_PRIVILEGES,
    );
    expect(privileges.privilegesForMode('plan')).toEqual(PLAN_AGENT_PRIVILEGES);
  });

  describe('reconcile', () => {
    it('applies the mode privileges when none have been recorded (resume)', async () => {
      expect(await create(true).reconcile('wf-1', 'plan')).toEqual({ type: 'applied' });
      expect(updateAgentPrivileges).toHaveBeenCalledWith(
        'wf-1',
        PLAN_AGENT_PRIVILEGES,
        PLAN_AGENT_PRIVILEGES,
      );
    });

    it('leaves the pre-approved set empty when pre-approval is disabled', async () => {
      await create(false).reconcile('wf-1', 'plan');

      expect(updateAgentPrivileges).toHaveBeenCalledWith('wf-1', PLAN_AGENT_PRIVILEGES, []);
    });

    it('no-ops for the mode recorded by markCreated, then applies again after a change', async () => {
      const privileges = create(true);
      privileges.markCreated('build');

      await privileges.reconcile('wf-1', undefined); // build (default) → unchanged
      await privileges.reconcile('wf-1', 'plan'); // changed → applied
      await privileges.reconcile('wf-1', 'plan'); // unchanged

      expect(updateAgentPrivileges).toHaveBeenCalledTimes(1);
    });

    it('returns the joined mutation errors without recording the mode (so it retries)', async () => {
      updateAgentPrivileges.mockResolvedValue(['workflow not found', 'nope']);
      const privileges = create(true);

      expect(await privileges.reconcile('wf-1', 'plan')).toEqual({
        type: 'error',
        message: 'workflow not found; nope',
      });
      await privileges.reconcile('wf-1', 'plan');
      expect(updateAgentPrivileges).toHaveBeenCalledTimes(2);
    });

    it('returns the thrown error message', async () => {
      updateAgentPrivileges.mockRejectedValue(new Error('field does not exist'));

      expect(await create(true).reconcile('wf-1', 'plan')).toEqual({
        type: 'error',
        message: 'field does not exist',
      });
    });
  });
});
