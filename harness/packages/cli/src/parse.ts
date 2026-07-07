import { z } from 'zod';
import { createInterfaceId } from '@gitlab/needle';
import { zodShapeFromDefMap } from './option_def';
import { sharedOptionDefs } from './shared_option_defs';
import { tuiCommandOptionDefs, runCommandOptionDefs } from './command_option_defs';

const sharedSchema = z.object(zodShapeFromDefMap(sharedOptionDefs));

const tuiCommandSchema = z.object({
  name: z.literal('tui'),
  ...zodShapeFromDefMap(tuiCommandOptionDefs),
});

const runCommandSchema = z.object({
  name: z.literal('run'),
  ...zodShapeFromDefMap(runCommandOptionDefs),
});

const runCommandRefinedSchema = runCommandSchema.superRefine((data, ctx) => {
  if (data.approval && !data.existingSessionId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '"--approval" requires "--existing-session-id"',
      path: ['approval'],
    });
  }
  if (data.rejectionReason && !data.approval) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '"--rejection-reason" requires "--approval"',
      path: ['rejectionReason'],
    });
  }
  if (data.rejectionReason && data.approval === 'approved') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: '"--rejection-reason" can only be used with "--approval false"',
      path: ['rejectionReason'],
    });
  }
});

const commandSchema = z.discriminatedUnion('name', [tuiCommandSchema, runCommandSchema]);

export type ParsedCommand = z.infer<typeof commandSchema>;

type ParsedSharedOptions = z.infer<typeof sharedSchema>;

/**
 * ParsedCliInput is the validated output of the parse phase.
 * Contains shared options and command-specific options, but not backend-specific options.
 */

export type ParsedCliInput = ParsedSharedOptions & {
  command: ParsedCommand;
};

export const ParsedCliInput = createInterfaceId<ParsedCliInput>('ParsedCliInput');

/**
 * Parse and validate raw Commander options into a typed ParsedCliInput.
 * Backend-specific options are parsed separately by the backend adapter.
 *
 * @param allOpts - merged options from `command.optsWithGlobals()`
 * @param commandName - which command is being invoked
 */
export function parse(
  allOpts: Record<string, unknown>,
  commandName: 'tui' | 'run',
): ParsedCliInput {
  const shared = sharedSchema.parse(allOpts);
  const command = commandSchema.parse({ name: commandName, ...allOpts });

  if (commandName === 'run') {
    runCommandRefinedSchema.parse({ name: commandName, ...allOpts });
  }

  return { ...shared, command };
}
