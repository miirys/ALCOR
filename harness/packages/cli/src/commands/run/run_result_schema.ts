import { z } from 'zod';
import { CHAT_ELEMENT_TYPES } from '@gitlab-org/tui';

/**
 * Versioned envelope for the JSON document emitted by `duo run --output-format json`.
 *
 * The transcript element shapes (message / tool / error / info) mirror the
 * `@gitlab-org/tui` `ChatElement` types (`packages/tui/src/types.ts`). They are
 * intentionally duplicated here as zod schemas rather than imported: this is a
 * CLI-specific output contract, and the schema must stay valid even if the TUI
 * types evolve, in which case `schemaVersion` is bumped deliberately.
 */

/** Current schema version. Bump when the document shape changes incompatibly. */
export const RUN_RESULT_SCHEMA_VERSION = '1.0';

const fileWithContentSchema = z.object({
  filepath: z.string(),
  content: z.string(),
});

const todoItemSchema = z.object({
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
});

/** Mirrors `@gitlab-org/tui` `ToolInput` — a discriminated union on `tool`. */
const knownToolInputSchema = z.discriminatedUnion('tool', [
  z.object({
    tool: z.literal('read_file'),
    filepath: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  z.object({ tool: z.literal('read_files'), filepaths: z.array(z.string()) }),
  z.object({
    tool: z.literal('edit_file'),
    filepath: z.string(),
    diff: z.object({ old: fileWithContentSchema, new: fileWithContentSchema }),
  }),
  z.object({
    tool: z.literal('create_file_with_contents'),
    filepath: z.string(),
    content: z.string(),
  }),
  z.object({ tool: z.literal('run_command'), command: z.string() }),
  z.object({ tool: z.literal('shell_command'), command: z.string() }),
  z.object({ tool: z.literal('list_dir'), directory: z.string() }),
  z.object({ tool: z.literal('find_files'), pattern: z.string() }),
  z.object({
    tool: z.literal('grep'),
    pattern: z.string(),
    directory: z.string().optional(),
    caseInsensitive: z.boolean().optional(),
  }),
  z.object({ tool: z.literal('mkdir'), path: z.string() }),
  z.object({
    tool: z.literal('run_git_command'),
    command: z.string(),
    commandArgs: z.string().optional(),
  }),
  z.object({ tool: z.literal('todo_write'), todos: z.array(todoItemSchema) }),
  z.object({ tool: z.literal('compaction'), trigger: z.string(), wasCompacted: z.boolean() }),
  z.object({
    tool: z.literal('mcp_tool'),
    name: z.string(),
    serverName: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
  z.object({
    tool: z.literal('generic'),
    name: z.string(),
    args: z.record(z.string(), z.unknown()),
  }),
]);

/**
 * The tool names this schema version validates strictly, derived from
 * `knownToolInputSchema` so the two can never diverge: adding a tool to the
 * discriminated union automatically extends this set, keeping the catch-all
 * refinement below honest with zero manual sync.
 */
const KNOWN_TOOL_NAMES: string[] = knownToolInputSchema.options.map(
  (option) => (option.shape.tool as z.ZodLiteral<string>).value,
);

/**
 * Tool input for the output document.
 *
 * Known tools are validated strictly by `knownToolInputSchema` above. Because
 * this schema is intentionally decoupled from the TUI types and evolves on its
 * own cadence, a tool the backend introduces before the schema is updated would
 * otherwise make the whole document fail validation and break json mode for
 * that run. The catch-all below preserves an unknown tool's input verbatim.
 *
 * The catch-all's `tool` refinement excludes the known tool names — symmetric
 * with `unknownElementSchema` — so a KNOWN tool with a malformed input (e.g.
 * `read_file` missing `filepath`) still fails strict validation rather than
 * silently falling through. Only a genuinely-unknown tool degrades to
 * pass-through fidelity.
 */
const toolInputSchema = z.union([
  knownToolInputSchema,
  z
    .object({ tool: z.string() })
    .refine((value) => !KNOWN_TOOL_NAMES.includes(value.tool), {
      message: 'known tool must match its strict schema',
    })
    .passthrough(),
]);

/** Mirrors the `@gitlab-org/tui` `ApprovalScope` type. */
const approvalScopeSchema = z.enum(['session', 'once']);

/**
 * Mirrors the `state` discriminated union on `@gitlab-org/tui` `ToolCall`.
 * `success.output` and `error.error` carry the tool's result.
 *
 * The transient states (`loading`, `approval_request`) are intentionally kept,
 * not just the terminal ones. Although this document is emitted after the run
 * completes, an interrupted or errored run can leave a tool call that never
 * reached a terminal state; preserving the transient states keeps the emitted
 * transcript a faithful mirror of the in-memory `ChatElement` history rather
 * than silently dropping or mis-typing such entries.
 */
const toolStateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('loading') }),
  z.object({
    type: z.literal('approval_request'),
    content: z.string(),
    availableScopes: z.array(approvalScopeSchema),
    suggestedPatterns: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('success'), output: z.string() }),
  z.object({ type: z.literal('error'), error: z.string() }),
]);

const messageElementSchema = z.object({
  id: z.string(),
  type: z.literal(CHAT_ELEMENT_TYPES.MESSAGE),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.number(),
  isComplete: z.boolean(),
  agentMode: z.enum(['build', 'plan']).optional(),
});

const toolCallElementSchema = z.object({
  id: z.string(),
  type: z.literal(CHAT_ELEMENT_TYPES.TOOL),
  name: z.string(),
  input: toolInputSchema,
  state: toolStateSchema,
  timestamp: z.number(),
});

const errorElementSchema = z.object({
  id: z.string(),
  type: z.literal(CHAT_ELEMENT_TYPES.ERROR),
  error: z.string(),
  timestamp: z.number(),
});

const infoElementSchema = z.object({
  id: z.string(),
  type: z.literal(CHAT_ELEMENT_TYPES.INFO),
  message: z.string(),
  timestamp: z.number(),
});

/** A single known transcript entry — mirrors `@gitlab-org/tui` `ChatElement`. */
const knownElementSchema = z.discriminatedUnion('type', [
  messageElementSchema,
  toolCallElementSchema,
  errorElementSchema,
  infoElementSchema,
]);

/**
 * The element `type` literals this schema version knows how to validate,
 * derived from `knownElementSchema` so it cannot drift from the strict
 * schemas it guards (same rationale as `KNOWN_TOOL_NAMES`).
 */
const KNOWN_ELEMENT_TYPES: string[] = knownElementSchema.options.map(
  (option) => (option.shape.type as z.ZodLiteral<string>).value,
);

/**
 * Catch-all for an element whose `type` this schema version does not know.
 *
 * Symmetric with `toolInputSchema`'s catch-all: if the backend introduces a
 * new element type before the schema is updated, the element degrades to
 * verbatim pass-through fidelity instead of failing validation and breaking
 * json mode for the whole run. The `type` refinement excludes the known types,
 * so this only catches genuinely-unknown elements — a KNOWN element with a
 * malformed body still fails (it is not silently waved through here), keeping
 * strict validation for the types this version understands.
 */
const unknownElementSchema = z
  .object({
    id: z.string(),
    type: z.string().refine((t) => !KNOWN_ELEMENT_TYPES.includes(t), {
      message: 'known element type must match its strict schema',
    }),
    timestamp: z.number(),
  })
  .passthrough();

/** A single transcript entry: a known element, or an unknown one preserved as-is. */
const transcriptElementSchema = z.union([knownElementSchema, unknownElementSchema]);

/** Fields common to both the success and error variants of the document. */
const runResultBaseShape = {
  schemaVersion: z.literal(RUN_RESULT_SCHEMA_VERSION),
  sessionId: z.string(),
  exitCode: z.number().int().nonnegative(),
  /** Final assistant response text. May be empty (e.g. a failed run). */
  response: z.string(),
  /** The transcript: messages, tool calls, errors, and info entries. */
  elements: z.array(transcriptElementSchema),
};

/**
 * The full `duo run --output-format json` document.
 *
 * Modelled as a discriminated union on `status` rather than an optional `error`
 * + refinement, so the success/error contract lives in the type system: the
 * `error` field exists (and is required) only on the `error` variant. A
 * consumer that narrows on `status === 'error'` then sees `error: string`, not
 * `string | undefined` — there is no way to construct a `success` document
 * carrying an `error`, nor an `error` document missing one.
 */
export const runResultSchema = z.discriminatedUnion('status', [
  z.object({
    ...runResultBaseShape,
    status: z.literal('success'),
  }),
  z.object({
    ...runResultBaseShape,
    status: z.literal('error'),
    /** Populated whenever the run failed. */
    error: z.string(),
  }),
]);

export type RunResult = z.infer<typeof runResultSchema>;
