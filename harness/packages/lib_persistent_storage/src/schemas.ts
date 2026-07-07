import { z } from 'zod';
import {
  SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY,
  SelectedAgentPlatformProjectsSchema,
} from './agent_platform_schemas';

// Re-export for external use
export { SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY };

// Project in repository storage
export const SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY = 'selectedProjectInRepository';
export const HEARTBEAT_ACTIVITY_KEY = 'heartbeatActivity';
export const SELECTED_CHAT_MODEL_STORAGE_KEY = 'selectedChatModel';
export const SELECTED_ANTHROPIC_MODEL_STORAGE_KEY = 'selectedAnthropicModel';
// credit-ledger persisted state (see @gitlab-org/credit-ledger). the ledger
// owns its own validation + version gate, so this schema is deliberately
// permissive and forward-tolerant so a ledger `version` bump never requires a
// change here.
export const CREDIT_LEDGER_STORAGE_KEY = 'creditLedgerState';

export const SelectedProjectSettingSchema = z.object({
  accountId: z.string(),
  namespaceWithPath: z.string(),
  remoteName: z.string(),
  remoteUrl: z.string(),
  repositoryRootPath: z.string(),
});

const HeartbeatActivitySchema = z.record(z.string(), z.number());

const CreditLedgerStateSchema = z
  .object({
    version: z.number(),
    activeGroupId: z.string().optional(),
    groups: z.record(z.string(), z.unknown()),
    seenEventIds: z.array(z.string()),
  })
  .passthrough();

// Global settings
export const globalSettingSchema = {
  telemetry: z.object({
    enabled: z.boolean(),
  }),
  [CREDIT_LEDGER_STORAGE_KEY]: CreditLedgerStateSchema,
} as const;

export const NotificationsSettingSchema = z.object({
  channel: z.enum(['auto', 'disabled']),
});

// Client-specific settings (IDE/CLI)
export const clientSettingSchema = {
  telemetry: z.object({
    enabled: z.boolean(),
  }),
  enableGlobalSkills: z.object({
    enabled: z.boolean(),
  }),
  notifications: NotificationsSettingSchema,
  [SELECTED_PROJECT_IN_REPOSITORY_STORAGE_KEY]: z.array(SelectedProjectSettingSchema),
  [SELECTED_AGENT_PLATFORM_PROJECT_STORAGE_KEY]: SelectedAgentPlatformProjectsSchema.optional(),
  [HEARTBEAT_ACTIVITY_KEY]: HeartbeatActivitySchema,
  [SELECTED_CHAT_MODEL_STORAGE_KEY]: z.string(),
  [SELECTED_ANTHROPIC_MODEL_STORAGE_KEY]: z.string(),
} as const;
