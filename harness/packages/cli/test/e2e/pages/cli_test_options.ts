import { z } from 'zod';
import type { OptionDefMap, ZodShapeOf } from '../../../src/option_def';
import { sharedOptionDefs } from '../../../src/shared_option_defs';
import {
  gitlabSharedOptionDefs,
  gitlabTuiOptionDefs,
  gitlabRunOptionDefs,
  anthropicOptionDefs,
} from '../../../src/backend_option_defs';
import { tuiCommandOptionDefs, runCommandOptionDefs } from '../../../src/command_option_defs';

const allOptionDefs = {
  ...anthropicOptionDefs,
  ...gitlabRunOptionDefs,
  ...runCommandOptionDefs,
  ...tuiCommandOptionDefs,
  ...gitlabTuiOptionDefs,
  ...gitlabSharedOptionDefs,
  ...sharedOptionDefs,
} satisfies OptionDefMap;

export type CliTestOptions = Partial<z.infer<z.ZodObject<ZodShapeOf<typeof allOptionDefs>>>>;

function extractLongFlag(flags: string): string | undefined {
  return flags.split(/[\s,]+/).find((f) => f.startsWith('--'));
}

function hasValuePlaceholder(flags: string): boolean {
  return /<[^>]+>/.test(flags) || /\[[^\]]+\]/.test(flags);
}

export function cliOptionsToArgs(options: CliTestOptions): string[] {
  return Object.entries(options).flatMap(([key, value]) => {
    if (value === undefined) return [];

    const def = allOptionDefs[key as keyof typeof allOptionDefs];
    if (!def) return [];

    const longFlag = extractLongFlag(def.flags);
    if (!longFlag) return [];

    if (hasValuePlaceholder(def.flags)) {
      return [longFlag, String(value)];
    }

    return value ? [longFlag] : [];
  });
}
