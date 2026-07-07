import { z } from 'zod';
import { InvalidArgumentError } from 'commander';
import { WorkflowType } from '@gitlab-lsp/workflow-api';
import type { OptionDef, OptionDefMap } from './option_def';
import { parseBooleanOption } from './utils/args_parsing';
import { coerceBoolean } from './shared_option_defs';
import { parseFlowConfigOption, FlowConfigError } from './backend/gitlab/flow_config';
// https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/main/ai_gateway/models/anthropic.py#L68
export enum SupportedAnthropicModel {
  ClaudeSonnet4 = 'claude-sonnet-4-20250514',
  ClaudeSonnet45 = 'claude-sonnet-4-5-20250929',
  ClaudeOpus45 = 'claude-opus-4-5-20251101',
  ClaudeHaiku45 = 'claude-haiku-4-5-20251001',
}

export const gitlabSharedOptionDefs = {
  connectionType: {
    flags: '--connection-type <type>',
    description: '(DEPRECATED) Workflow connection type; ignored.',
    choices: ['grpc', 'websocket'],
    env: 'GITLAB_DUO_CONNECTION_TYPE',
    default: 'websocket',
    zod: z.enum(['grpc', 'websocket']).optional(),
  },
  model: {
    flags: '--model <gitlab_identifier>',
    description:
      'GitLab model identifier to use (for example, `claude_sonnet_4_6` or `claude_haiku_4_5_20251001`). Use the `gitlab_identifier` field from https://gitlab.com/gitlab-org/modelops/applied-ml/code-suggestions/ai-assist/-/blob/HEAD/ai_gateway/model_selection/models.yml.',
    env: 'GITLAB_DUO_MODEL',
    zod: z.string().optional(),
  },
} satisfies OptionDefMap;

export const gitlabTuiOptionDefs = {
  developer: {
    flags: '--developer',
    hidden: true,
    description: 'Use the local developer flow config (for flow development).',
    env: 'DUO_WORKFLOW_DEVELOPER',
    default: false,
    zod: z.preprocess(coerceBoolean, z.boolean()),
  },
} satisfies OptionDefMap;

export const gitlabRunOptionDefs = {
  langsmithTrace: {
    flags: '--langsmith-trace <trace_id>',
    description:
      'LangSmith trace header for distributed tracing. Use the format `{timestamp}-{run_uuid}`.',
    env: 'LANGSMITH_TRACE',
    zod: z.string().optional(),
  },
  flowConfigSchemaVersion: {
    flags: '--flow-config-schema-version <version>',
    description: 'Flow config schema version.',
    env: 'DUO_WORKFLOW_FLOW_CONFIG_SCHEMA_VERSION',
    zod: z.string().optional(),
  },
  flowConfigId: {
    flags: '--flow-config-id <id>',
    description: 'Flow config ID (for example, `developer`).',
    env: 'DUO_WORKFLOW_FLOW_CONFIG_ID',
    zod: z.string().optional(),
  },
  flowVersion: {
    flags: '--flow-version <version>',
    description: 'Explicit semver flow version (for example, `1.0.0`).',
    env: 'DUO_WORKFLOW_FLOW_VERSION',
    zod: z.string().optional(),
  },
  workflowType: {
    flags: '--workflow-type <type>',
    description: 'Workflow type (for example, `chat` or `software_development`).',
    default: WorkflowType.CHAT,
    env: 'DUO_WORKFLOW_DEFINITION',
    zod: z.string().optional(),
  },
  duoWorkflowServiceServer: {
    flags: '--duo-workflow-service-server <url>',
    description: 'GitLab Duo Workflow Service server URL.',
    env: 'DUO_WORKFLOW_SERVICE_SERVER',
    zod: z.string().optional(),
  },
  duoWorkflowServiceToken: {
    flags: '--duo-workflow-service-token <token>',
    description: 'GitLab Duo Workflow Service authentication token.',
    env: 'DUO_WORKFLOW_SERVICE_TOKEN',
    zod: z.string().optional(),
  },
  duoWorkflowMetadata: {
    flags: '--duo-workflow-metadata <json>',
    description: 'Pre-computed workflow metadata as a JSON string.',
    env: 'DUO_WORKFLOW_METADATA',
    parse: (value: string) => {
      if (!value) return undefined;
      try {
        return JSON.parse(value);
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'unknown';
        throw new InvalidArgumentError(`Could not parse workflow metadata JSON: ${msg}`);
      }
    },
    zod: z.record(z.string(), z.unknown()).optional(),
  },
  duoWorkflowProjectId: {
    flags: '--duo-workflow-project-id <id>',
    description: 'GitLab project ID.',
    env: 'DUO_WORKFLOW_PROJECT_ID',
    zod: z.string().optional(),
  },
  duoWorkflowNamespaceId: {
    flags: '--duo-workflow-namespace-id <id>',
    description: 'GitLab namespace ID.',
    env: 'DUO_WORKFLOW_NAMESPACE_ID',
    zod: z.string().optional(),
  },
  gitlabProjectPath: {
    flags: '--gitlab-project-path <path>',
    description: 'GitLab project path.',
    env: 'GITLAB_PROJECT_PATH',
    zod: z.string().optional(),
  },
  duoWorkflowGlobalUserId: {
    flags: '--duo-workflow-global-user-id <id>',
    description: 'Global user ID.',
    env: 'DUO_WORKFLOW_GLOBAL_USER_ID',
    zod: z.string().optional(),
  },
  duoWorkflowInstanceId: {
    flags: '--duo-workflow-instance-id <id>',
    description: 'GitLab instance ID.',
    env: 'DUO_WORKFLOW_INSTANCE_ID',
    zod: z.string().optional(),
  },
  duoWorkflowRealm: {
    flags: '--duo-workflow-realm <realm>',
    description: 'GitLab realm (for example, `saas` or `self-managed`).',
    env: 'DUO_WORKFLOW_SERVICE_REALM',
    zod: z.string().optional(),
  },
  agentPlatformGitlabVersion: {
    flags: '--agent-platform-gitlab-version <version>',
    description: 'GitLab instance version.',
    env: 'AGENT_PLATFORM_GITLAB_VERSION',
    zod: z.string().optional(),
  },
  agentPlatformFeatureSettingName: {
    flags: '--agent-platform-feature-setting-name <name>',
    description: 'Agent platform feature setting name.',
    env: 'AGENT_PLATFORM_FEATURE_SETTING_NAME',
    zod: z.string().optional(),
  },
  insecure: {
    flags: '--insecure [value]',
    description: 'Allow insecure (non-TLS) connections to GitLab Duo Workflow Service.',
    env: 'DUO_WORKFLOW_INSECURE',
    default: 'false',
    parse: (value: string) => parseBooleanOption(value),
    zod: z.union([z.string(), z.boolean()]).optional(),
  },
} satisfies OptionDefMap;

export function createFlowConfigOptionDef(getCwd: () => string): OptionDef {
  return {
    flags: '--flow-config <config>',
    description: 'Flow config (YAML/JSON content or file path).',
    env: 'DUO_WORKFLOW_FLOW_CONFIG',
    parse: (value: string) => {
      try {
        return parseFlowConfigOption(value, getCwd());
      } catch (error) {
        if (error instanceof FlowConfigError) throw new InvalidArgumentError(error.message);
        throw error;
      }
    },
  };
}

export const anthropicOptionDefs = {
  model: {
    flags: '--model <model>',
    description: `Anthropic model to use (supported: ${Object.values(SupportedAnthropicModel).join(', ')}).`,
    env: 'ANTHROPIC_MODEL',
    zod: z.string().optional(),
  },
} satisfies OptionDefMap;
