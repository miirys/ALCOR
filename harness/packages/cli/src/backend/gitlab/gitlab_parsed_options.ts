import { z } from 'zod';
import { InvalidArgumentError } from 'commander';
import { createInterfaceId } from '@gitlab/needle';
import { GenerateTokenResponse, HeaderData } from '@gitlab-org/workflow-executor';
import { getLanguageServerVersion } from '@gitlab-org/core';
import { parseBooleanOption } from '../../utils/args_parsing';
import { zodShapeFromDefMap } from '../../option_def';
import {
  gitlabSharedOptionDefs,
  gitlabRunOptionDefs,
  gitlabTuiOptionDefs,
} from '../../backend_option_defs';
import type { Credentials } from '../../utils/credential_provider';

const gitlabSharedShape = zodShapeFromDefMap(gitlabSharedOptionDefs);
const gitlabRunShape = zodShapeFromDefMap(gitlabRunOptionDefs);
const gitlabTuiShape = zodShapeFromDefMap(gitlabTuiOptionDefs);

const gitlabFullShape = {
  ...gitlabSharedShape,
  ...gitlabRunShape,
  ...gitlabTuiShape,
  flowConfig: z.string().optional(),
};

export const gitlabOptionSchema = z.object(gitlabFullShape);

export type GitLabParsedOptions = z.infer<typeof gitlabOptionSchema>;
export const GitLabParsedOptions = createInterfaceId<GitLabParsedOptions>('GitLabParsedOptions');

export function tryBuildWorkflowToken(
  parsed: GitLabParsedOptions,
  credentials: Credentials,
): GenerateTokenResponse | undefined {
  const { duoWorkflowServiceServer, duoWorkflowServiceToken } = parsed;

  // If CI fields are not provided we do not build the token. The LS will fetch this token later from the API
  if (!duoWorkflowServiceServer || !duoWorkflowServiceToken) {
    return undefined;
  }

  const metadata = parsed.duoWorkflowMetadata;

  // Parse the insecure flag properly
  const isInsecure = parseBooleanOption(parsed.insecure);
  const isSecure = !isInsecure;

  // Validate configuration: warn if using insecure mode with port 443
  if (isInsecure && duoWorkflowServiceServer.includes(':443')) {
    console.warn(
      '\x1b[33m%s\x1b[0m',
      'WARNING: Using insecure (non-TLS) mode with port 443. This will likely fail. ' +
        'Unset DUO_WORKFLOW_INSECURE or set it to "false" for production endpoints.',
    );
  }

  const str = (value: unknown): string => (typeof value === 'string' ? value : '');

  const headers: HeaderData = {
    'X-Gitlab-Host-Name': str(metadata?.hostname) || 'unknown',
    'X-Gitlab-Instance-Id': parsed.duoWorkflowInstanceId || str(metadata?.instanceId) || 'unknown',
    'X-Gitlab-Realm': parsed.duoWorkflowRealm || str(metadata?.realm) || 'unknown',
    'X-Gitlab-Version': parsed.agentPlatformGitlabVersion || str(metadata?.version) || 'unknown',
    'X-Gitlab-Global-User-Id':
      parsed.duoWorkflowGlobalUserId || str(metadata?.globalUserId) || 'unknown',
    'X-Gitlab-Feature-Enabled-By-Namespace-Ids': str(metadata?.featureNamespaceIds),
    'X-Gitlab-Language-Server-Version': getLanguageServerVersion(),
    'X-Gitlab-Agent-Platform-Model-Metadata': str(metadata?.modelMetadata),
  };

  const oneHour = 3600000;
  const expiresAt = Date.now() + oneHour * 3;

  return {
    gitlab_rails: {
      base_url: str(metadata?.gitlabBaseUrl) || credentials.baseUrl,
      token: credentials.token,
      token_expires_at: new Date(expiresAt).toISOString(),
    },
    duo_workflow_service: {
      base_url: duoWorkflowServiceServer,
      token: duoWorkflowServiceToken,
      secure: isSecure,
      token_expires_at: expiresAt / 1000, // Convert to seconds
      headers,
    },
    workflow_metadata: {
      is_team_member: false,
      extended_logging: false,
      ...(metadata || {}),
    },
  } satisfies GenerateTokenResponse;
}

export function validateCiTokenConfiguration(parsed: Record<string, unknown>): void {
  const ciFlags = [
    'duoWorkflowServiceServer',
    'duoWorkflowServiceToken',
    'duoWorkflowMetadata',
    'duoWorkflowProjectId',
    'duoWorkflowNamespaceId',
    'gitlabProjectPath',
    'duoWorkflowGlobalUserId',
    'duoWorkflowInstanceId',
    'duoWorkflowRealm',
    'agentPlatformGitlabVersion',
  ];

  const providedFlags = ciFlags.filter((key) => parsed[key]);
  const missingFlags = ciFlags.filter((key) => parsed[key] === undefined).map((f) => `"${f}"`);

  if (providedFlags.length > 0 && missingFlags.length > 0) {
    throw new InvalidArgumentError(
      `When using CI pre-configured tokens, all flags must be provided. Missing: ${missingFlags.join(', ')}. ` +
        'Either provide all CI token flags or none.',
    );
  }
}
