import type { AIContextItem } from '@gitlab-org/ai-context';

/**
 * Builds the per-turn `plan_context` envelope that tells the registry
 * `developer/2.0.0-local` flow which operating mode to render.
 *
 * Unlike a {@link SystemContextProvider} (which is resolved once at startup),
 * the operating mode can change on every turn — the user can flip the TUI
 * plan/build picker between messages. So the item is built fresh for each
 * `SendPrompt` from the action's `agentMode` and appended to that turn's
 * `additionalContext` (see `GitLabBackend#getAiContextItemsForMessage`).
 *
 * The category is declared in the flow's `flow.inputs` (AI Gateway) and mapped
 * into the `developer_agent` component as `plan_enabled`; the V1 Flow engine
 * resolves `context:inputs.plan_context.plan_enabled` into the prompt template,
 * which switches between the read-only plan-mode and full build-mode system
 * instructions.
 */
export function buildPlanContextItem(planEnabled: boolean): AIContextItem {
  return {
    category: 'plan_context',
    content: JSON.stringify({ plan_enabled: planEnabled }),
    id: 'plan_context',
    metadata: {
      title: planEnabled ? 'Plan Mode' : 'Build Mode',
      enabled: true,
      subType: 'mode',
      icon: 'n/a',
      secondaryText: '',
      subTypeLabel: 'Mode',
    },
  };
}
