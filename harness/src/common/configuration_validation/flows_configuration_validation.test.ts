import { FLOWS } from '@gitlab-org/core';
import { AgentPlatformEnabledCheck, FlowsInstanceFlagCheck } from '@gitlab-org/feature-state';
import { ProjectDuoAccessCheck } from '../feature_state';
import { DefaultFlowsConfigurationValidator } from './flows_configuration_validation';

describe('FlowsConfigurationValidator', () => {
  const config = {};

  let validateProjectDuoAccessMock: jest.Mock;
  let projectDuoAccessCheck: jest.Mocked<ProjectDuoAccessCheck>;

  let validateFlowsInstanceFlagMock: jest.Mock;
  let flowsInstanceFlagCheck: jest.Mocked<FlowsInstanceFlagCheck>;

  let validateAgentPlatformEnabledMock: jest.Mock;
  let agentPlatformEnabledCheck: jest.Mocked<AgentPlatformEnabledCheck>;

  let validator: DefaultFlowsConfigurationValidator;

  beforeEach(() => {
    validateProjectDuoAccessMock = jest.fn();
    projectDuoAccessCheck = {
      validate: validateProjectDuoAccessMock,
    } as unknown as jest.Mocked<ProjectDuoAccessCheck>;

    validateFlowsInstanceFlagMock = jest.fn();
    flowsInstanceFlagCheck = {
      validate: validateFlowsInstanceFlagMock,
    } as unknown as jest.Mocked<FlowsInstanceFlagCheck>;

    validateAgentPlatformEnabledMock = jest.fn();
    agentPlatformEnabledCheck = {
      validate: validateAgentPlatformEnabledMock,
    } as unknown as jest.Mocked<AgentPlatformEnabledCheck>;

    validator = new DefaultFlowsConfigurationValidator(
      projectDuoAccessCheck,
      flowsInstanceFlagCheck,
      agentPlatformEnabledCheck,
    );
  });

  it('should include engaged checks in the response', async () => {
    jest.mocked(validateProjectDuoAccessMock).mockResolvedValue({
      checkId: 'project-access-check',
      details: 'Project access check',
      engaged: false,
    });
    jest.mocked(validateFlowsInstanceFlagMock).mockResolvedValue({
      checkId: 'flows-instance-flag',
      details: 'Instance flag check',
      engaged: true,
    });
    jest.mocked(validateAgentPlatformEnabledMock).mockResolvedValue({
      checkId: 'agent-platform-enabled',
      details: 'Agent platform enabled check',
      engaged: false,
    });

    const result = await validator.validate(config);

    expect(result?.featureId).toBe(FLOWS);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks?.[0].checkId).toBe('flows-instance-flag');
    expect(result?.allChecks).toHaveLength(3);

    expect(validateProjectDuoAccessMock).toHaveBeenCalledWith(config);
    expect(validateFlowsInstanceFlagMock).toHaveBeenCalledWith(config);
    expect(validateAgentPlatformEnabledMock).toHaveBeenCalledWith(config);
  });
});
