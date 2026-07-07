import type { AgentModeConfig } from '../../agents/agents';

export const FLOW_CONFIG_SCHEMA_VERSION = 'v1';

/**
 * Build a `chat-partial` inline config. The gateway wraps this back into the
 * legacy code-defined `chat.Workflow` engine, overriding only the toolset and
 * system prompt. Used when no `--developer` flow is active, so plan and (legacy)
 * build share the same `chat.Workflow` `FlowState`.
 *
 * Tool gating is client-side: the gateway trusts the toolset we send.
 */
export function buildChatPartialFlowConfig(config: AgentModeConfig): string {
  const componentName = config.name;
  const promptId = `${config.name}_mode_prompt`;

  return JSON.stringify({
    version: 'v1',
    environment: 'chat-partial',
    flow: {
      entry_point: componentName,
    },
    components: [
      {
        name: componentName,
        type: 'AgentComponent',
        prompt_id: promptId,
        toolset: config.allowedTools,
        inputs: [{ from: 'context:goal', as: 'goal' }],
      },
    ],
    prompts: [buildInlinePrompt(promptId, config.systemPrompt)],
  });
}

function buildInlinePrompt(promptId: string, system: string) {
  return {
    name: promptId,
    prompt_id: promptId,
    unit_primitives: ['duo_agent_platform'],
    prompt_template: {
      system,
      user: '{{goal}}',
      placeholder: 'history',
    },
  };
}
