import z from 'zod';

const CommandHookSchema = z.object({
  type: z.literal('command'),
  command: z.string(),
  timeout: z.number().optional(),
});

const MatcherGroupSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(CommandHookSchema),
});

/**
 * Strict schema for the full config — used only when all entries are known-valid.
 * For lenient parsing that filters invalid entries, use {@link parseHooksConfigLeniently}.
 */
export const HooksConfigSchema = z.object({
  hooks: z
    .object({
      SessionStart: z.array(MatcherGroupSchema).optional(),
    })
    .optional(),
});

/**
 * Parses hooks config leniently: invalid hooks or matcher groups are
 * filtered out with warnings rather than rejecting the entire config.
 */
export function parseHooksConfigLeniently(
  data: unknown,
  warn: (msg: string) => void,
): z.infer<typeof HooksConfigSchema> {
  if (!data || typeof data !== 'object' || !('hooks' in data)) return {};

  const raw = data as Record<string, unknown>;
  const rawHooks = raw.hooks;
  if (!rawHooks || typeof rawHooks !== 'object') return {};

  const events = ['SessionStart'] as const;
  const hooks: Record<string, z.infer<typeof MatcherGroupSchema>[]> = {};

  for (const event of events) {
    const groups = (rawHooks as Record<string, unknown>)[event];
    if (Array.isArray(groups)) {
      const validGroups = parseMatcherGroups(groups, event, warn);
      if (validGroups.length > 0) {
        hooks[event] = validGroups;
      }
    }
  }

  return { hooks };
}

function parseMatcherGroups(
  groups: unknown[],
  event: string,
  warn: (msg: string) => void,
): z.infer<typeof MatcherGroupSchema>[] {
  return groups.reduce<z.infer<typeof MatcherGroupSchema>[]>((validGroups, group) => {
    const g = group as Record<string, unknown>;
    if (!g || !Array.isArray(g.hooks)) {
      warn(`Invalid matcher group in ${event}: missing hooks array`);
      return validGroups;
    }

    const validHooks = (g.hooks as unknown[]).reduce<z.infer<typeof CommandHookSchema>[]>(
      (acc, hook) => {
        const result = CommandHookSchema.safeParse(hook);
        if (result.success) {
          acc.push(result.data);
        } else {
          warn(`Invalid hook in ${event}: type must be "command" with a command string`);
        }
        return acc;
      },
      [],
    );

    if (validHooks.length > 0) {
      validGroups.push({
        ...(typeof g.matcher === 'string' ? { matcher: g.matcher } : {}),
        hooks: validHooks,
      });
    }

    return validGroups;
  }, []);
}
