import { describe, it, expect } from '@jest/globals';
import type { AgentModeConfig } from '../../agents/agents';
import { buildChatPartialFlowConfig } from './flow_config_builder';

describe('buildChatPartialFlowConfig', () => {
  it('builds the expected flow config structure', () => {
    const config: AgentModeConfig = {
      name: 'plan',
      systemPrompt: 'You are a planning assistant.',
      allowedTools: ['read_file', 'grep', 'list_dir'],
      excludeMcp: true,
    };

    expect(JSON.parse(buildChatPartialFlowConfig(config))).toEqual({
      version: 'v1',
      environment: 'chat-partial',
      flow: { entry_point: 'plan' },
      components: [
        {
          name: 'plan',
          type: 'AgentComponent',
          prompt_id: 'plan_mode_prompt',
          toolset: ['read_file', 'grep', 'list_dir'],
          inputs: [{ from: 'context:goal', as: 'goal' }],
        },
      ],
      prompts: [
        {
          name: 'plan_mode_prompt',
          prompt_id: 'plan_mode_prompt',
          unit_primitives: ['duo_agent_platform'],
          prompt_template: {
            system: 'You are a planning assistant.',
            user: '{{goal}}',
            placeholder: 'history',
          },
        },
      ],
    });
  });
});
