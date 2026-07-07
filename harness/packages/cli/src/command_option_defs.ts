import { z } from 'zod';
import type { AIContextItem } from '@gitlab-org/ai-context';
import type { OptionDefMap } from './option_def';
import { tryParseAiContextItems } from './utils/ai_context_items';

const commonCommandOptionDefs = {
  existingSessionId: {
    flags: '--existing-session-id <sessionId>',
    description: 'ID of an existing session to resume.',
    env: 'DUO_WORKFLOW_WORKFLOW_ID',
    zod: z.string().optional(),
  },
} satisfies OptionDefMap;

export const tuiCommandOptionDefs = {
  ...commonCommandOptionDefs,
  auto: {
    flags: '--auto',
    description:
      'Start in auto mode: tool calls are approved automatically for this session. ' +
      'Toggle at runtime with the `/auto` slash command.',
    env: 'DUO_AUTO_APPROVE',
    zod: z.boolean().default(false),
  },
} satisfies OptionDefMap;

export const runCommandOptionDefs = {
  goal: {
    flags: '-g, --goal <goal>',
    description: 'Goal or prompt for the session.',
    env: 'DUO_WORKFLOW_GOAL',
    mandatory: true,
    zod: z.string(),
  },
  approval: {
    flags: '--approval <decision>',
    description:
      'Human decision for a plan approval checkpoint. Use alongside `--goal` when resuming a session.',
    env: 'DUO_WORKFLOW_APPROVAL',
    choices: ['true', 'false', 'once'],
    zod: z
      .enum(['true', 'false', 'once'])
      .transform((v): 'approved' | 'rejected' => {
        if (v === 'false') return 'rejected';
        return 'approved';
      })
      .optional(),
  },
  rejectionReason: {
    flags: '--rejection-reason <text>',
    description: 'Free-text feedback explaining why the plan was rejected.',
    env: 'DUO_WORKFLOW_REJECTION_REASON',
    zod: z.string().optional(),
  },
  aiContextItems: {
    flags: '--ai-context-items <contextItems>',
    description: 'Additional context items as a JSON-encoded array.',
    env: 'DUO_WORKFLOW_ADDITIONAL_CONTEXT_CONTENT',
    parse: (value: string) => tryParseAiContextItems(value),
    zod: z.custom<AIContextItem[]>().optional(),
  },
  outputFormat: {
    flags: '--output-format <format>',
    description:
      'Output format for the run. `json` emits a single JSON document to stdout and routes logs to stderr; `text` (default) preserves the current human-readable behavior.',
    env: 'DUO_WORKFLOW_OUTPUT_FORMAT',
    choices: ['text', 'json'],
    zod: z.enum(['text', 'json']).default('text'),
  },
  ...commonCommandOptionDefs,
} satisfies OptionDefMap;
