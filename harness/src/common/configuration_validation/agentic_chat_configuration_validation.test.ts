import { AGENTIC_CHAT } from '@gitlab-org/core';
import { AgentPlatformEnabledCheck } from '@gitlab-org/feature-state';
import { ProjectDuoAccessCheck } from '../feature_state';
import { DefaultAgenticChatConfigurationValidator } from './agentic_chat_configuration_validation';

describe('AgenticChatConfigurationValidator', () => {
  const config = {};

  let validateProjectDuoAccessMock: jest.Mock;
  let projectDuoAccessCheck: jest.Mocked<ProjectDuoAccessCheck>;

  let validateAgentPlatformEnabledMock: jest.Mock;
  let agentPlatformEnabledCheck: jest.Mocked<AgentPlatformEnabledCheck>;

  let validator: DefaultAgenticChatConfigurationValidator;

  beforeEach(() => {
    validateProjectDuoAccessMock = jest.fn();
    projectDuoAccessCheck = {
      validate: validateProjectDuoAccessMock,
    } as unknown as jest.Mocked<ProjectDuoAccessCheck>;

    validateAgentPlatformEnabledMock = jest.fn();
    agentPlatformEnabledCheck = {
      validate: validateAgentPlatformEnabledMock,
    } as unknown as jest.Mocked<AgentPlatformEnabledCheck>;

    validator = new DefaultAgenticChatConfigurationValidator(
      projectDuoAccessCheck,
      agentPlatformEnabledCheck,
    );
  });

  it('should include engaged checks in the response', async () => {
    jest.mocked(validateProjectDuoAccessMock).mockResolvedValue({
      checkId: 'project-access-check',
      details: 'Project access check',
      engaged: false,
    });
    jest.mocked(validateAgentPlatformEnabledMock).mockResolvedValue({
      checkId: 'agent-platform-enabled',
      details: 'Agent platform enabled check',
      engaged: true,
    });

    const result = await validator.validate(config);

    expect(result?.featureId).toBe(AGENTIC_CHAT);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks?.[0].checkId).toBe('agent-platform-enabled');
    expect(result?.allChecks).toHaveLength(2);

    expect(validateProjectDuoAccessMock).toHaveBeenCalledWith(config);
    expect(validateAgentPlatformEnabledMock).toHaveBeenCalledWith(config);
  });
});
