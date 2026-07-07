import { spawnSync } from 'child_process';
import { Logger } from '@gitlab-org/logging';
import { z } from 'zod';

const GlabOAuth2TokenSchema = z.object({
  type: z.literal('oauth2'),
  token: z.string(),
  expiry_timestamp: z.string().datetime(),
});

const GlabPatTokenSchema = z.object({
  type: z.literal('pat'),
  token: z.string(),
});

const GlabJobTokenSchema = z.object({
  type: z.literal('job-token'),
  token: z.string(),
});

const GlabTokenSchema = z.discriminatedUnion('type', [
  GlabOAuth2TokenSchema,
  GlabPatTokenSchema,
  GlabJobTokenSchema,
]);

const GlabSuccessResponseSchema = z.object({
  type: z.literal('success'),
  token: GlabTokenSchema,
  instance_url: z.string().url(),
});

const GlabErrorResponseSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
});

const GlabCredentialResponseSchema = z.discriminatedUnion('type', [
  GlabSuccessResponseSchema,
  GlabErrorResponseSchema,
]);

type GlabCredentialResponse = z.infer<typeof GlabCredentialResponseSchema>;

export type GlabCredential =
  | { type: 'oauth'; token: string; expiresAt: Date; instanceUrl: string }
  | { type: 'pat'; token: string; instanceUrl: string };

/**
 * Attempts to retrieve credentials from glab credential-helper
 * @param logger - Logger instance for debug/error logging
 * @returns A GlabCredential if available, null otherwise
 */
export function getGlabCredentials(logger: Logger, cwd: string): GlabCredential | null {
  try {
    logger.info('Attempting to fetch credentials from glab credential-helper');

    // Use spawnSync to invoke glab's credential-helper.
    const result = spawnSync('glab', ['auth', 'credential-helper'], {
      encoding: 'utf-8',
      timeout: 10000,
      cwd,
    });

    if (result.error) {
      if ('code' in result.error && result.error.code === 'ENOENT') {
        logger.info('glab is not installed or not found in PATH');
      } else {
        logger.warn('glab credential-helper failed:', result.error);
      }
      return null;
    }

    if (result.status !== 0) {
      logger.warn(`glab credential-helper exited with status ${result.status}`);
      return null;
    }

    if (!result.stdout || result.stdout.trim() === '') {
      logger.warn('glab credential-helper returned empty response');
      return null;
    }

    // When the credential-helper subcommand doesn't exist (older glab versions),
    // glab prints the `auth` help text to stdout and exits with status 0.
    // Detect this by checking for the help usage pattern.
    if (result.stdout.includes('glab auth <command>')) {
      logger.info(
        'glab credential-helper command not available (glab version may be too old, run `glab --version` to check — requires 1.85.2 or higher)',
      );
      return null;
    }

    // Parse the JSON output which is in the format:
    // {"type": "success", "token": {"type": "pat", "token": "glpat-..."}, "instance_url": "https://..."}
    const credentials = parseGlabCredentialOutput(result.stdout);

    if (!credentials) {
      logger.warn('glab credential-helper returned unparseable response');
      return null;
    }

    // Check if there's an error message (glab returns errors as JSON too)
    if (credentials.type === 'error') {
      logger.info(`glab credential-helper returned error: ${credentials.message}`);
      return null;
    }

    logger.info('Successfully retrieved credentials from glab credential-helper');
    return toGlabCredential(logger, credentials.token, credentials.instance_url);
  } catch (error) {
    // glab not installed, not configured, or other error
    logger.warn('Failed to get credentials from glab credential-helper:', error);
    return null;
  }
}

function toGlabCredential(
  logger: Logger,
  token: z.infer<typeof GlabTokenSchema>,
  instanceUrl: string,
): GlabCredential {
  switch (token.type) {
    case 'oauth2':
      return {
        type: 'oauth',
        token: token.token,
        expiresAt: new Date(token.expiry_timestamp),
        instanceUrl,
      };
    case 'pat':
      return { type: 'pat', token: token.token, instanceUrl };
    case 'job-token':
      logger.warn('glab returned job-token credential type, treating as pat');
      return { type: 'pat', token: token.token, instanceUrl };
    default:
      // exhaustive check
      throw new Error(`Unknown glab token type: ${(token as { type: string }).type}`);
  }
}

/**
 * Parses the JSON output from glab credential-helper
 * @param output - The raw JSON output from glab credential-helper
 * @returns Parsed credentials object
 */
function parseGlabCredentialOutput(output: string): GlabCredentialResponse | null {
  try {
    const parsed: unknown = JSON.parse(output.trim());
    return GlabCredentialResponseSchema.parse(parsed);
  } catch {
    // Not valid JSON or doesn't match schema
    return null;
  }
}
