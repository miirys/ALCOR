import { z } from 'zod';

const RelativePluginSourceSchema = z
  .string()
  .refine((value) => value.startsWith('./') && !value.split('/').includes('..'), {
    message: 'relative source must start with "./" and must not contain ".." segments',
  });

const GithubPluginSourceSchema = z.object({
  ref: z.string().optional(),
  repo: z.string(),
  sha: z.string().optional(),
  source: z.literal('github'),
});

const UrlPluginSourceSchema = z.object({
  ref: z.string().optional(),
  sha: z.string().optional(),
  source: z.literal('url'),
  url: z.string(),
});

const GitSubdirPluginSourceSchema = z.object({
  path: z.string(),
  ref: z.string().optional(),
  sha: z.string().optional(),
  source: z.literal('git-subdir'),
  url: z.string(),
});

const NpmPluginSourceSchema = z.object({
  package: z.string(),
  registry: z.string().optional(),
  source: z.literal('npm'),
  version: z.string().optional(),
});

export const PluginObjectSourceSchema = z.discriminatedUnion('source', [
  GithubPluginSourceSchema,
  UrlPluginSourceSchema,
  GitSubdirPluginSourceSchema,
  NpmPluginSourceSchema,
]);

/** An object-form plugin source (github/url/git-subdir/npm). */
export type PluginObjectSource = z.infer<typeof PluginObjectSourceSchema>;

export const PluginSourceSchema = z.union([RelativePluginSourceSchema, PluginObjectSourceSchema]);

/**
 * Where to fetch a plugin listed in a marketplace catalog: a relative path
 * (resolved against the marketplace root) or an object keyed by `source`.
 */
export type PluginSource = z.infer<typeof PluginSourceSchema>;
