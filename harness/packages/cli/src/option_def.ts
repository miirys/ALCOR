import { Command, Option } from 'commander';
import type { ZodTypeAny } from 'zod';

export interface OptionDef<T = unknown> {
  flags: string;
  description: string;
  env?: string;
  default?: T;
  choices?: string[];
  parse?: (value: string) => T;
  mandatory?: boolean;
  hidden?: boolean;
  zod?: ZodTypeAny;
}

export type OptionDefMap = Record<string, OptionDef>;

export type ZodShapeOf<T extends OptionDefMap> = {
  [K in keyof T as T[K] extends { zod: ZodTypeAny } ? K : never]: T[K] extends {
    zod: infer Z extends ZodTypeAny;
  }
    ? Z
    : never;
};

export function zodShapeFromDefMap<T extends OptionDefMap>(defs: T): ZodShapeOf<T> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const [key, def] of Object.entries(defs)) {
    if (def.zod) {
      shape[key] = def.zod;
    }
  }
  return shape as ZodShapeOf<T>;
}

export function registerOptionsOnCommand(
  command: Command,
  optionDefs: OptionDef[] | OptionDefMap,
): void {
  const defs = Array.isArray(optionDefs) ? optionDefs : Object.values(optionDefs);
  for (const def of defs) {
    const option = new Option(def.flags, def.description);
    if (def.env) option.env(def.env);
    if (def.default !== undefined) option.default(def.default);
    if (def.choices) option.choices(def.choices);
    if (def.parse) option.argParser(def.parse);
    if (def.mandatory) option.makeOptionMandatory();
    if (def.hidden) option.hideHelp();
    command.addOption(option);
  }
}
