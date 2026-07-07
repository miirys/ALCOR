// packages/lib_ai_configuration/src/flow/persistence/resolver/schemas/v1.ts
import { z } from 'zod';

/**
 * GitLab Flow Registry v1 Schema
 *
 * Validates YAML structure according to:
 * https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/102ea538709d114f9c738da75c13df7fda85b55a/docs/flow_registry/v1.md
 */

// ===== Component Types =====

const ComponentInputObjectSchema = z.object({
  from: z.string(),
  as: z.string().optional(),
  literal: z.boolean().optional(),
  optional: z.boolean().optional(),
});

/**
 * Component inputs accept two equivalent forms in v1 YAML:
 *
 *   - Object: `{ from: "context:goal", as: "goal" }`
 *   - String shorthand: `"context:goal"` (treated as `{ from: <string> }`)
 *
 * Both are normalized to the object form on parse so consumers don't need to
 * discriminate. The workflow service's `IOKey.parse_key` accepts both, so the
 * shorthand round-trips through GitLab's AI Catalog and runs correctly.
 */
const ComponentInputSchema = z.union([
  z.string().transform((value) => ({
    from: value,
    as: undefined,
    literal: undefined,
    optional: undefined,
  })),
  ComponentInputObjectSchema,
]);

const BaseComponentSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Component name must be alphanumeric or underscore'),
  inputs: z.array(ComponentInputSchema).optional(),
  ui_log_events: z.array(z.string()).optional(),
  ui_role_as: z.enum(['agent', 'tool']).optional(),
});

const AgentComponentSchema = BaseComponentSchema.extend({
  type: z.literal('AgentComponent'),
  prompt_id: z.string(),
  prompt_version: z.string().optional().nullable(),
  toolset: z.array(z.string()).default([]),
});

const DeterministicStepComponentSchema = BaseComponentSchema.extend({
  type: z.literal('DeterministicStepComponent'),
  tool_name: z.string(),
  toolset: z.array(z.string()).default([]),
});

const OneOffComponentSchema = BaseComponentSchema.extend({
  type: z.literal('OneOffComponent'),
  prompt_id: z.string(),
  prompt_version: z.string().optional().nullable(),
  toolset: z.array(z.string()).default([]),
  max_correction_attempts: z.number().int().positive().default(3),
});

const ComponentSchema = z.discriminatedUnion('type', [
  AgentComponentSchema,
  DeterministicStepComponentSchema,
  OneOffComponentSchema,
]);

// ===== Router Schema =====

const RouterConditionSchema = z.object({
  input: z.string(),
  routes: z.record(z.string(), z.string()),
});

const RouterSchema = z.object({
  from: z.string(),
  to: z.string().optional(),
  condition: RouterConditionSchema.optional(),
});

// ===== Flow Config Schema =====

const InputFieldDefinitionSchema = z.object({
  type: z.string(),
  format: z.string().optional(),
  description: z.string().optional(),
});

const FlowConfigInputSchema = z.object({
  category: z.string(),
  input_schema: z.record(z.string(), InputFieldDefinitionSchema),
});

const FlowConfigSchema = z.object({
  entry_point: z.string(),
  inputs: z.array(FlowConfigInputSchema).optional(),
});

// ===== Prompt Schema =====

const PromptTemplateSchema = z.object({
  system: z.string(),
  user: z.string(),
  placeholder: z.string().optional(),
});

const PromptParamsSchema = z.object({
  timeout: z.number().optional(),
  stop: z.array(z.string()).optional(),
  vertex_location: z.string().optional(),
});

const InlinePromptSchema = z.object({
  prompt_id: z.string(),
  name: z.string(),
  unit_primitives: z.array(z.string()).default([]),
  prompt_template: PromptTemplateSchema,
  params: PromptParamsSchema.optional(),
});

// ===== Main Flow v1 Schema =====

export const FlowV1Schema = z.object({
  version: z.literal('v1'),
  environment: z.enum(['ambient', 'chat', 'chat-partial']),
  components: z.array(ComponentSchema).min(1, 'At least one component is required'),
  routers: z.array(RouterSchema),
  flow: FlowConfigSchema,
  prompts: z.array(InlinePromptSchema).optional(),
});

export type FlowV1 = z.infer<typeof FlowV1Schema>;
export type Component = z.infer<typeof ComponentSchema>;
export type ComponentType = Component['type'];
export type AgentComponent = z.infer<typeof AgentComponentSchema>;
export type DeterministicStepComponent = z.infer<typeof DeterministicStepComponentSchema>;
export type OneOffComponent = z.infer<typeof OneOffComponentSchema>;
export type Router = z.infer<typeof RouterSchema>;
export type InlinePrompt = z.infer<typeof InlinePromptSchema>;

export const COMPONENT_TYPES: ComponentType[] = [
  'AgentComponent',
  'OneOffComponent',
  'DeterministicStepComponent',
];

/**
 * Additional semantic validation beyond schema
 */
export function validateFlowV1Semantics(flow: FlowV1): string[] {
  const errors: string[] = [];

  // Validate entry point exists in components
  const componentNames = new Set(flow.components.map((c) => c.name));
  if (!componentNames.has(flow.flow.entry_point)) {
    errors.push(`Entry point "${flow.flow.entry_point}" not found in components`);
  }

  // Validate router references
  for (const router of flow.routers) {
    if (router.from !== 'end' && !componentNames.has(router.from)) {
      errors.push(`Router 'from' component "${router.from}" not found`);
    }

    if (router.to && router.to !== 'end' && !componentNames.has(router.to)) {
      errors.push(`Router 'to' component "${router.to}" not found`);
    }

    // Validate condition routes
    if (router.condition) {
      for (const [key, target] of Object.entries(router.condition.routes)) {
        if (target !== 'end' && !componentNames.has(target)) {
          errors.push(`Router condition route "${key}" targets non-existent component "${target}"`);
        }
      }
    }
  }

  // Check for duplicate component names
  const duplicates = flow.components
    .map((c) => c.name)
    .filter((name, index, arr) => arr.indexOf(name) !== index);

  if (duplicates.length > 0) {
    errors.push(`Duplicate component names: ${[...new Set(duplicates)].join(', ')}`);
  }

  return errors;
}
